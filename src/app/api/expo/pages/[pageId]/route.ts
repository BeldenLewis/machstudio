/**
 * 페이지 하나 — 읽기·draft 저장·삭제.
 *
 * draft 저장만 **비교-교환(CAS)** 이다. 두 탭에서 편집하면 나중 저장이 앞 저장을 조용히
 * 덮으므로, 클라이언트가 읽은 번호를 함께 보내고 어긋나면 409 + 최신 값을 돌려준다.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardExpoRoute, readJsonBody, authFailure, fieldErrors } from "@/lib/expo/route-guard";
import { requireOwnedPage } from "@/lib/expo/auth";
import { validatePageDraft } from "@/lib/expo/request";
import { prepareDeletePage, prepareDraftWrite, serviceMessage, serviceStatus } from "@/lib/expo/site-service";
import { normalizeExpoPage } from "@/lib/expo/config";
import { expoPreviewCodeDigest } from "@/lib/expo/code-digest";
import { slugFromTitle } from "@/lib/expo/model";
import { safeHttpUrl } from "@/lib/webinar-config";

async function ownedPage(pageId: string, ctx: { userId: string; memberWorkspaceIds: string[] }) {
  const page = await prisma.expoPage.findFirst({
    where: { id: pageId, deletedAt: null },
    select: {
      id: true, siteId: true, slug: true, title: true, isHome: true, sortOrder: true,
      draft: true, draftRevision: true, published: true, publishedAt: true,
      liveAt: true, imwebUrl: true, updatedAt: true,
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
       * 발행본 쪽 지문. 미리보기에서 발행본을 볼 때 쓴다 — 초안 지문을 그대로 보내면
       * 서버가 계산한 값과 달라 실행이 거절되고, 화면에는 이유가 안 보인다.
       * PATCH 는 발행본을 건드리지 않으므로 저장 응답에는 싣지 않는다.
       */
      publishedCodeDigest: expoPreviewCodeDigest(page!.published),
      hasPublished: Boolean(page!.published),
      publishedAt: page!.publishedAt, liveAt: page!.liveAt, updatedAt: page!.updatedAt,
    },
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const guard = await guardExpoRoute(request, { write: true });
  if (!guard.ok) return guard.response;

  const { page, owned } = await ownedPage(pageId, guard.ctx);
  if (!owned.ok) return authFailure(owned.failure);

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const data: Record<string, unknown> = {};

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
    data.draftRevision = prepared.value.draftRevision;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "바꿀 항목이 없어요" }, { status: 400 });
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
