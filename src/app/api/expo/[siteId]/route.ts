/**
 * 사이트 상세·설정·삭제.
 *
 * **소속은 URL 이 지목한 사이트에서 온다** — 사이드바가 무엇을 가리키든 보지 않는다
 * (AGENTS.md "새 면을 만들 때" ②). 딥링크 사고를 막는 규칙이다.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardExpoRoute, readJsonBody, authFailure } from "@/lib/expo/route-guard";
import { requireOwnedSite, requireSameProjectSource } from "@/lib/expo/auth";
import { normalizeExpoTheme } from "@/lib/expo/config";
import { pageSummary } from "@/lib/expo/site-service";
import { safeHttpUrl } from "@/lib/webinar-config";

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

export async function GET(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const guard = await guardExpoRoute(request);
  if (!guard.ok) return guard.response;

  const { site, owned } = await loadOwned(siteId, guard.ctx);
  if (!owned.ok) return authFailure(owned.failure);

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
    where: { projectId: site!.projectId, deletedAt: null, mode: "builder" },
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

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim().slice(0, 120);
  if (body.theme !== undefined) data.theme = { ...normalizeExpoTheme(body.theme) };
  if (body.siteUrl !== undefined) data.siteUrl = safeHttpUrl(body.siteUrl) || null;

  // 사전등록 소스는 **같은 전시**여야 한다 — 아니면 홈페이지 폼이 다른 전시 등록을 받는다.
  if (body.collectSourceId !== undefined) {
    if (body.collectSourceId === null) {
      data.collectSourceId = null;
    } else {
      const source = await prisma.collectSource.findFirst({
        where: { id: String(body.collectSourceId), deletedAt: null },
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

  // 소프트 삭제 — 되돌릴 수 있어야 한다. 공개 로더는 deletedAt 을 보고 즉시 404 를 낸다.
  await prisma.expoSite.update({ where: { id: site!.id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
