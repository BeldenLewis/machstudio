/**
 * 사이트 상세·설정·삭제.
 *
 * **소속은 URL 이 지목한 사이트에서 온다** — 사이드바가 무엇을 가리키든 보지 않는다
 * (AGENTS.md "새 면을 만들 때" ②). 딥링크 사고를 막는 규칙이다.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardExpoRoute, readJsonBody, authFailure } from "@/lib/expo/route-guard";
import { requireOwnedSite, requireProjectAccess, requireSameProjectSource } from "@/lib/expo/auth";
import { deriveExpoPermissions } from "@/lib/expo/permissions";
import { normalizeExpoTheme } from "@/lib/expo/config";
import { normalizeHexColor } from "@/lib/color";
import { pageSummary } from "@/lib/expo/site-service";
import { safeHttpUrl } from "@/lib/webinar-config";
import { sourceScopeWhere } from "@/lib/expo/source-scope";

async function loadOwned(siteId: string, ctx: { userId: string; memberWorkspaceIds: string[] }) {
  const site = await prisma.expoSite.findFirst({
    where: { id: siteId, deletedAt: null },
    select: {
      id: true, workspaceId: true, projectId: true, name: true, theme: true,
      collectSourceId: true, defaultLocale: true, previewToken: true, siteUrl: true,
    },
  });
  return { site, owned: requireOwnedSite(site, ctx.userId, ctx.memberWorkspaceIds) };
}

function permissions(ctx: { workspaceRole(id: string): "OWNER" | "ADMIN" | "MEMBER" | null; projectRole(id: string): "VIEWER" | "EDITOR" | "ADMIN" | null }, site: { workspaceId: string; projectId: string }) {
  return deriveExpoPermissions(ctx.workspaceRole(site.workspaceId), ctx.projectRole(site.projectId));
}

export async function GET(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const guard = await guardExpoRoute(request);
  if (!guard.ok) return guard.response;

  const { site, owned } = await loadOwned(siteId, guard.ctx);
  if (!owned.ok) return authFailure(owned.failure);
  const access = requireProjectAccess(guard.ctx.workspaceRole(owned.value.workspaceId), guard.ctx.projectRole(owned.value.projectId));
  if (!access.ok) return authFailure(access.failure);

  // 페이지는 **요약만** 싣는다 — draft 50개를 목록에 담으면 응답이 수 MB 가 된다.
  const pages = await prisma.expoPage.findMany({
    where: { siteId, deletedAt: null },
    select: {
      id: true, slug: true, title: true, isHome: true, sortOrder: true,
      draftRevision: true, deletedAt: true, published: true, liveAt: true, imwebUrl: true,
    },
    orderBy: { sortOrder: "asc" },
  });

  /**
   * 이 전시의 사전등록 소스. 등록 폼 구획이 고를 수 있는 후보다.
   *
   * 공용 `/api/collect-sources` 를 쓰지 않는 이유: 그건 `workspaceId` 를 요구하고
   * 소스마다 `fieldMappings` 를 통째로 실어 준다 — 여기서 필요한 것은 id 와 이름뿐이고,
   * 소속 판정은 이미 URL 자원(site)으로 끝났다.
   *
   * 조건은 공개 로더의 **수용 조건과 같다**(`app/h/[pageId]/loader.ts` 의 소스 확인).
   * 여기서 더 넓게 주면 운영자는 고를 수 있는데 공개 화면에서는 폼이 안 나온다.
   */
  const sources = await prisma.collectSource.findMany({
    where: sourceScopeWhere(site!.projectId),
    select: { id: true, name: true, isActive: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    sources,
    site: {
      id: site!.id, name: site!.name, projectId: site!.projectId,
      theme: normalizeExpoTheme(site!.theme),
      collectSourceId: site!.collectSourceId, defaultLocale: site!.defaultLocale,
      previewToken: site!.previewToken, siteUrl: site!.siteUrl,
    },
    pages: pages.map(pageSummary),
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const guard = await guardExpoRoute(request, { write: true });
  if (!guard.ok) return guard.response;

  const { site, owned } = await loadOwned(siteId, guard.ctx);
  if (!owned.ok) return authFailure(owned.failure);
  const access = requireProjectAccess(guard.ctx.workspaceRole(owned.value.workspaceId), guard.ctx.projectRole(owned.value.projectId));
  if (!access.ok) return authFailure(access.failure);
  if (!permissions(guard.ctx, owned.value).canEdit) return authFailure({ kind: "forbidden" });

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim().slice(0, 120);

  /**
   * 색은 **이미 공개된 것을 바꾼다.** 공개 로더가 사이트 테마를 실시간으로 읽으므로
   * (`app/h/[pageId]/loader.ts`) 저장하는 순간 파트너 사이트에 붙어 있는 페이지의 색이
   * 같이 바뀐다 — 발행·공개 스위치와 같은 무게다. 그래서 여기만 역할까지 본다.
   * 이름·주소·소스 연결은 초안 편집 쪽이라 그대로 둔다.
   *
   * ── 여기서는 **되돌리지 않고 거절한다** ──────────────────────────────
   * `normalizeExpoTheme` 는 색이 아닌 값을 만나면 기본 남색으로 되돌린다. 읽는 경로에서는
   * 그게 맞다(화면이 안 깨진다). 그런데 **쓰는 경로에서 그러면 저장돼 있던 브랜드 색이
   * 파괴된다** — 게다가 그 결과가 즉시 공개 페이지로 나가고, 화면에는 "색을 적용했어요" 만
   * 뜬다. 되돌릴 방법도 없다(옛 값이 어디에도 안 남는다).
   *
   * 그리고 **보낸 칸만** 바꾼다. 빠뜨린 칸까지 기본값으로 채우면 부분 저장이 나머지를 지운다.
   */
  if (body.theme !== undefined) {
    if (!permissions(guard.ctx, owned.value).canEdit) return authFailure({ kind: "forbidden" });

    const raw = body.theme && typeof body.theme === "object" && !Array.isArray(body.theme)
      ? (body.theme as Record<string, unknown>)
      : {};
    const keys = ["accent", "lightBg", "darkBg"] as const;
    const next = { ...normalizeExpoTheme(site!.theme) };
    const bad: string[] = [];
    for (const key of keys) {
      if (raw[key] === undefined) continue;
      const hex = normalizeHexColor(typeof raw[key] === "string" ? (raw[key] as string) : "");
      if (!hex) { bad.push(key); continue; }
      next[key] = hex;
    }
    if (bad.length > 0) {
      return NextResponse.json(
        { error: "색은 #RRGGBB 형식이어야 해요", fields: bad },
        { status: 400 },
      );
    }
    data.theme = next;
  }
  if (body.siteUrl !== undefined) data.siteUrl = safeHttpUrl(body.siteUrl) || null;

  // 사전등록 소스는 **같은 전시**여야 한다 — 아니면 홈페이지 폼이 다른 전시 등록을 받는다.
  if (body.collectSourceId !== undefined) {
    if (body.collectSourceId === null) {
      data.collectSourceId = null;
    } else {
      /**
       * **`mode: "builder"` 가 빠져 있었다** — capture 모드 소스(아임웹에서 긁어 오는 쪽)를
       * 사이트 기본 소스로 붙일 수 있었다. 그건 폼이 아니라서 홈페이지가 그리면
       * 방문자에게 빈 껍데기가 나간다. 목록·draft·공개 로더와 같은 조건을 쓴다.
       */
      const source = await prisma.collectSource.findFirst({
        where: sourceScopeWhere(owned.value.projectId, [String(body.collectSourceId)]),
        select: { id: true, projectId: true },
      });
      const same = requireSameProjectSource(owned.value, source);
      if (!same.ok) return authFailure(same.failure);
      data.collectSourceId = same.value.id;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "바꿀 항목이 없어요" }, { status: 400 });
  }

  const updated = await prisma.expoSite.update({
    where: { id: site!.id },
    data,
    select: { id: true, name: true, theme: true, collectSourceId: true, siteUrl: true },
  });
  return NextResponse.json({ site: { ...updated, theme: normalizeExpoTheme(updated.theme) } });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const guard = await guardExpoRoute(request, { write: true });
  if (!guard.ok) return guard.response;

  const { site, owned } = await loadOwned(siteId, guard.ctx);
  if (!owned.ok) return authFailure(owned.failure);
  const access = requireProjectAccess(guard.ctx.workspaceRole(owned.value.workspaceId), guard.ctx.projectRole(owned.value.projectId));
  if (!access.ok) return authFailure(access.failure);

  // 사이트 삭제는 `canManageSite` 다 — 화면이 MEMBER 에게 숨기는 버튼이므로 라우트도 막는다.
  if (!permissions(guard.ctx, owned.value).canManageSite) return authFailure({ kind: "forbidden" });

  // 소프트 삭제 — 되돌릴 수 있어야 한다. 공개 로더는 deletedAt 을 보고 즉시 404 를 낸다.
  await prisma.expoSite.update({ where: { id: site!.id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
