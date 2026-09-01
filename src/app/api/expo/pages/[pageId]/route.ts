/**
 * 페이지 하나 — 읽기·draft 저장·삭제.
 *
 * draft 저장만 **비교-교환(CAS)** 이다. 두 탭에서 편집하면 나중 저장이 앞 저장을 조용히
 * 덮으므로, 클라이언트가 읽은 번호를 함께 보내고 어긋나면 409 + 최신 값을 돌려준다.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardExpoRoute, readJsonBody, authFailure, fieldErrors } from "@/lib/expo/route-guard";
import { requireOwnedPage, requireProjectAccess } from "@/lib/expo/auth";
import { deriveExpoPermissions } from "@/lib/expo/permissions";
import { validatePageDraft } from "@/lib/expo/request";
import { changedSourceRefs, sourceScopeWhere } from "@/lib/expo/source-scope";
import { newlyEmbedEnabled } from "@/lib/expo/release-gate";
import { prepareDeletePage, prepareDraftWrite, serviceMessage, serviceStatus } from "@/lib/expo/site-service";
import { normalizeExpoPage } from "@/lib/expo/config";
import { expoPreviewCodeDigest } from "@/lib/expo/code-digest";
import { slugFromTitle } from "@/lib/expo/model";
import { pageReadiness, sectionSnippetIssues } from "@/lib/expo/readiness";
import { expoPageSnippet, expoSectionSnippet } from "@/lib/expo/snippet";
import { getRequiredExpoPublicOrigin, expoOriginMessage } from "@/lib/expo/origin";
import { sectionDef } from "@/lib/expo/registry";
import { hasContent } from "@/lib/expo/model";
import { safeHttpUrl } from "@/lib/webinar-config";

async function ownedPage(pageId: string, ctx: { userId: string; memberWorkspaceIds: string[] }) {
  const page = await prisma.expoPage.findFirst({
    where: { id: pageId, deletedAt: null, site: { deletedAt: null } },
    select: {
      id: true, siteId: true, slug: true, title: true, isHome: true, sortOrder: true,
      draft: true, draftRevision: true, published: true, publishedAt: true,
      liveAt: true, imwebUrl: true, lastSeenAt: true, lastSeenOrigin: true, updatedAt: true,
      site: { select: { id: true, workspaceId: true, projectId: true } },
    },
  });
  return { page, owned: requireOwnedPage(page, ctx.userId, ctx.memberWorkspaceIds) };
}

export async function GET(request: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const guard = await guardExpoRoute(request);
  if (!guard.ok) return guard.response;

  const { page, owned } = await ownedPage(pageId, guard.ctx);
  if (!owned.ok) return authFailure(owned.failure);
  const access = requireProjectAccess(guard.ctx.workspaceRole(owned.value.site.workspaceId), guard.ctx.projectRole(owned.value.site.projectId));
  if (!access.ok) return authFailure(access.failure);

  return NextResponse.json({
    page: {
      id: page!.id, siteId: page!.siteId, slug: page!.slug, title: page!.title,
      isHome: page!.isHome, sortOrder: page!.sortOrder, imwebUrl: page!.imwebUrl,
      draft: normalizeExpoPage(page!.draft),
      draftRevision: page!.draftRevision,
      /**
       * 붙여넣은 코드의 지문. 편집기 미리보기가 "이 코드를 실행" 을 요청할 때 그대로
       * 되돌려 보낸다 — 서버가 계산한 값과 정확히 같을 때만 실행된다(code-digest.ts).
       * 편집기가 직접 계산하지 않는 이유: 알고리즘이 두 벌이 되면 어긋나는 날이 온다.
       */
      codeDigest: expoPreviewCodeDigest(page!.draft),
      /**
       * "왜 아직 안 나가는가" 를 서버가 판정해서 내려보낸다. 화면이 따로 판단하면
       * **버튼은 눌리는데 아무 일도 안 일어나는** 상태가 생긴다(`readiness.ts` 머리말).
       */
      readiness: pageReadiness({
        draft: page!.draft,
        published: page!.published,
        publishedAt: page!.publishedAt,
        updatedAt: page!.updatedAt,
        imwebUrl: page!.imwebUrl,
      }),
      snippets: buildSnippets(page!),
      exportSections: buildExportSections(page!.published),
      /**
       * 발행본 쪽 지문. 미리보기에서 발행본을 볼 때 쓴다 — 초안 지문을 그대로 보내면
       * 서버가 계산한 값과 달라 실행이 거절되고, 화면에는 이유가 안 보인다.
       * PATCH 는 발행본을 건드리지 않으므로 저장 응답에는 싣지 않는다.
       */
      publishedCodeDigest: expoPreviewCodeDigest(page!.published),
      hasPublished: Boolean(page!.published),
      publishedAt: page!.publishedAt, liveAt: page!.liveAt, updatedAt: page!.updatedAt,
      lastSeenAt: page!.lastSeenAt, lastSeenOrigin: page!.lastSeenOrigin,
    },
  });
}

/**
 * 백업 HTML 버튼은 draft의 embed 토글이 아니라 현재 published 사본에서 파생한다.
 * standalone builder와 같은 enabled/content/지원 타입 문을 사용하되 렌더 입력은 싣지 않는다.
 */
function buildExportSections(publishedRaw: unknown) {
  if (!publishedRaw) return [];
  return normalizeExpoPage(publishedRaw).sections
    .filter((section) => section.enabled && hasContent(section)
      && section.type !== "register-form" && section.type !== "custom-code")
    .map((section) => ({
      sid: section.sid,
      label: sectionDef(section.type)?.label ?? section.type,
    }));
}

/**
 * 붙일 코드 한 벌.
 *
 * 주소를 못 구하면 **코드를 만들지 않는다.** 빈 문자열이나 상대경로로 덮으면 붙인 사람은
 * 붙였다고 믿고, 전시 기간에 조용히 빈 자리가 된다(`origin.ts` 머리말).
 * 이유를 그대로 올려 화면이 말하게 한다.
 *
 * 구획 목록은 **초안에서 따로 내보내기를 켠 것**을 뽑는다 — 그게 운영자의 의도다.
 * 실제로 붙일 수 있는지는 발행본 기준으로 판정해 사유를 함께 준다.
 */
function buildSnippets(page: { id: string; draft: unknown; published: unknown }) {
  const origin = getRequiredExpoPublicOrigin();
  if (!origin.ok) {
    return { ok: false as const, message: expoOriginMessage(origin.reason) };
  }

  const draft = normalizeExpoPage(page.draft);
  const sections = draft.sections
    .filter((section) => section.embedEnabled)
    .map((section) => ({
      sid: section.sid,
      type: section.type,
      label: sectionDef(section.type)?.label ?? section.type,
      snippet: expoSectionSnippet(origin.origin, page.id, section.sid),
      issues: sectionSnippetIssues(page.published, section.sid),
    }));

  return { ok: true as const, page: expoPageSnippet(origin.origin, page.id), sections };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const guard = await guardExpoRoute(request, { write: true });
  if (!guard.ok) return guard.response;

  const { page, owned } = await ownedPage(pageId, guard.ctx);
  if (!owned.ok) return authFailure(owned.failure);
  const access = requireProjectAccess(guard.ctx.workspaceRole(owned.value.site.workspaceId), guard.ctx.projectRole(owned.value.site.projectId));
  if (!access.ok) return authFailure(access.failure);
  if (!deriveExpoPermissions(guard.ctx.workspaceRole(owned.value.site.workspaceId), guard.ctx.projectRole(owned.value.site.projectId)).canEdit) {
    return authFailure({ kind: "forbidden" });
  }

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const data: Record<string, unknown> = {};
  let draftExpectedRevision: number | null = null;

  if (typeof body.title === "string") data.title = body.title.trim().slice(0, 120) || "제목 없음";
  if (typeof body.slug === "string") {
    const siblings = await prisma.expoPage.findMany({
      where: { siteId: page!.siteId, deletedAt: null, NOT: { id: page!.id } },
      select: { slug: true },
    });
    data.slug = slugFromTitle(body.slug, siblings.map((s) => s.slug));
  }
  if (body.imwebUrl !== undefined) data.imwebUrl = safeHttpUrl(body.imwebUrl) || null;

  if (body.draft !== undefined) {
    // **정규화 전에** 검증한다 — 정규화가 자르고 나면 무엇이 넘쳤는지 알 수 없다.
    const valid = validatePageDraft(body.draft);
    if (!valid.ok) return fieldErrors(valid.errors);

    /**
     * 사전등록 소스는 DB 를 봐야 판정된다 — 순수 검증이 못 하는 부분이라 여기서 한다.
     *
     * **이번에 바뀐 참조만** 본다. 안 바뀌었으면 조회를 아예 하지 않는다(자동저장 핫패스).
     * 매번 대조하면 소스를 하나 지운 순간, 전혀 다른 구획을 고쳐도 그 페이지가 영구
     * 저장 불가가 된다 — `SourceRefField` 가 후보에 없는 값을 그대로 실어 보내기 때문이다.
     */
    const changed = changedSourceRefs(body.draft, page!.draft);
    if (changed.length > 0) {
      const rows = await prisma.collectSource.findMany({
        where: sourceScopeWhere(owned.value.site.projectId, changed.map((c) => c.value)),
        select: { id: true },
      });
      const usable = new Set(rows.map((r) => r.id));
      const bad = changed.filter((c) => !usable.has(c.value));
      if (bad.length > 0) {
        return fieldErrors(bad.map((c) => ({
          path: "sections.content.sourceRef",
          code: "invalid-shape" as const,
          sid: c.sid,
          message: "그 사전등록 폼은 이 전시에서 쓸 수 없어요. 목록에서 다시 골라 주세요.",
        })));
      }
    }

    /**
     * 릴리스 승인 전에는 구획의 "따로 내보내기" 를 **새로 켤 수 없다.** 끄는 것은 언제나 된다.
     * 이전 값과 비교하는 것이 핵심이다 — "지금 켜져 있는 것" 을 막으면 이미 켜 둔 구획이
     * 있는 페이지가 영구 저장 불가가 된다(글자 하나만 고쳐도 422).
     */
    if (!guard.ctx.caps.publicEmbed) {
      const arming = newlyEmbedEnabled(body.draft, page!.draft);
      if (arming.length > 0) {
        return fieldErrors(arming.map((sid) => ({
          path: "sections.embedEnabled",
          code: "launch-locked" as const,
          sid,
          message: "아직 아임웹 공개가 열리지 않아 '이 구획만 따로 내보내기' 를 켤 수 없어요.",
        })));
      }
    }

    const expected = Number(body.draftRevision);
    if (!Number.isFinite(expected)) {
      return NextResponse.json({ error: "편집 번호가 필요해요" }, { status: 400 });
    }
    const prepared = prepareDraftWrite(page!, expected, body.draft);
    if (!prepared.ok) {
      // 최신 값을 함께 준다 — 화면이 이걸로 다시 읽는다. 자동 재시도는 하지 않는다.
      return NextResponse.json(
        {
          error: serviceMessage(prepared.error),
          draft: normalizeExpoPage(page!.draft),
          draftRevision: page!.draftRevision,
        },
        { status: serviceStatus(prepared.error) },
      );
    }
    data.draft = JSON.parse(JSON.stringify(prepared.value.draft));
    draftExpectedRevision = expected;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "바꿀 항목이 없어요" }, { status: 400 });
  }

  if (draftExpectedRevision !== null) {
    /**
     * 검증 때 읽은 번호를 믿고 `update()` 하면 두 요청이 모두 통과한다. WHERE 자체가
     * 활성 페이지 소속 + 정확한 revision을 조건으로 삼고, 증가는 DB 문장 안에서 한다.
     */
    const [updated] = await prisma.expoPage.updateManyAndReturn({
      where: {
        id: page!.id,
        siteId: page!.siteId,
        deletedAt: null,
        draftRevision: draftExpectedRevision,
        site: { deletedAt: null },
      },
      data: { ...data, draftRevision: { increment: 1 } },
      limit: 1,
      select: { id: true, slug: true, title: true, imwebUrl: true, draftRevision: true, updatedAt: true },
    });

    if (!updated) {
      // 조건부 write가 진 요청만 최신의 **인가된 활성 페이지**를 다시 읽어 409에 싣는다.
      const latest = await ownedPage(pageId, guard.ctx);
      if (!latest.owned.ok) return authFailure(latest.owned.failure);
      const latestAccess = requireProjectAccess(
        guard.ctx.workspaceRole(latest.owned.value.site.workspaceId),
        guard.ctx.projectRole(latest.owned.value.site.projectId),
      );
      if (!latestAccess.ok) return authFailure(latestAccess.failure);
      return NextResponse.json({
        error: serviceMessage({ kind: "conflict", currentRevision: latest.page!.draftRevision }),
        draft: normalizeExpoPage(latest.page!.draft),
        draftRevision: latest.page!.draftRevision,
      }, { status: 409 });
    }

    return NextResponse.json({ page: { ...updated, codeDigest: expoPreviewCodeDigest(data.draft) } });
  }

  const updated = await prisma.expoPage.update({
    where: { id: page!.id },
    data,
    select: { id: true, slug: true, title: true, imwebUrl: true, draftRevision: true, updatedAt: true },
  });

  /**
   * 저장 응답에도 지문을 싣는다 — 코드를 고치면 옛 허가가 그 자리에서 낡아야 한다.
   * 방금 쓴 값에서 뽑는다(다시 읽지 않는다): draft 는 최대 512KB 짜리 JSON 컬럼이고,
   * 이번 요청에 draft 가 없었으면 저장된 것이 그대로이므로 읽어 온 값이 맞다.
   */
  const savedDraft = data.draft !== undefined ? data.draft : page!.draft;
  return NextResponse.json({ page: { ...updated, codeDigest: expoPreviewCodeDigest(savedDraft) } });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const guard = await guardExpoRoute(request, { write: true });
  if (!guard.ok) return guard.response;

  const { page, owned } = await ownedPage(pageId, guard.ctx);
  if (!owned.ok) return authFailure(owned.failure);
  const access = requireProjectAccess(guard.ctx.workspaceRole(owned.value.site.workspaceId), guard.ctx.projectRole(owned.value.site.projectId));
  if (!access.ok) return authFailure(access.failure);

  // 페이지 삭제도 `canManageSite` 다(`permissions.ts`).
  if (!deriveExpoPermissions(guard.ctx.workspaceRole(owned.value.site.workspaceId), guard.ctx.projectRole(owned.value.site.projectId)).canManageSite) {
    return authFailure({ kind: "forbidden" });
  }

  const prepared = prepareDeletePage(page!);
  if (!prepared.ok) {
    return NextResponse.json({ error: serviceMessage(prepared.error) }, { status: serviceStatus(prepared.error) });
  }

  // 지우면서 공개도 끈다 — 지운 페이지가 파트너 사이트에 계속 나가면 안 된다.
  await prisma.expoPage.update({
    where: { id: page!.id },
    data: { deletedAt: prepared.value.deletedAt, liveAt: null },
  });
  return NextResponse.json({ ok: true });
}
