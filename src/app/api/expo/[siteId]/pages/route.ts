/**
 * 페이지 추가(POST) · 순서 재배치(PATCH).
 *
 * 순서를 **별도 엔드포인트**로 둔 이유: draft 저장과 같은 자리에서 처리하면 자동저장이
 * 도는 중에 드래그가 충돌로 막힌다. 순서는 draft 를 안 건드리므로 CAS 도 쓰지 않는다.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardExpoRoute, readJsonBody, authFailure } from "@/lib/expo/route-guard";
import { requireOwnedSite } from "@/lib/expo/auth";
import { prepareNewPage, prepareReorder, serviceMessage, serviceStatus } from "@/lib/expo/site-service";

async function ownedSite(siteId: string, ctx: { userId: string; memberWorkspaceIds: string[] }) {
  const site = await prisma.expoSite.findFirst({
    where: { id: siteId, deletedAt: null },
    select: { id: true, workspaceId: true, projectId: true },
  });
  return requireOwnedSite(site, ctx.userId, ctx.memberWorkspaceIds);
}

const pageRows = (siteId: string) => prisma.expoPage.findMany({
  where: { siteId },
  select: { id: true, slug: true, title: true, isHome: true, sortOrder: true, draftRevision: true, deletedAt: true },
  orderBy: { sortOrder: "asc" },
});

export async function POST(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const guard = await guardExpoRoute(request, { write: true });
  if (!guard.ok) return guard.response;

  const owned = await ownedSite(siteId, guard.ctx);
  if (!owned.ok) return authFailure(owned.failure);

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const prepared = prepareNewPage(await pageRows(siteId), {
    title: String(parsed.body.title ?? ""),
    slug: parsed.body.slug ? String(parsed.body.slug) : undefined,
  });
  if (!prepared.ok) {
    return NextResponse.json({ error: serviceMessage(prepared.error) }, { status: serviceStatus(prepared.error) });
  }

  const page = await prisma.expoPage.create({
    // Prisma 의 Json 입력 타입은 인덱스 시그니처를 요구한다 — 고정 키 타입이라 한 번 넓힌다.
    data: {
      siteId,
      ...prepared.value,
      draft: JSON.parse(JSON.stringify(prepared.value.draft)),
    },
    select: { id: true, slug: true, title: true, isHome: true, sortOrder: true },
  });
  return NextResponse.json({ page }, { status: 201 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const guard = await guardExpoRoute(request, { write: true });
  if (!guard.ok) return guard.response;

  const owned = await ownedSite(siteId, guard.ctx);
  if (!owned.ok) return authFailure(owned.failure);

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const ids = Array.isArray(parsed.body.order) ? parsed.body.order.map(String) : null;
  if (!ids) return NextResponse.json({ error: "순서 목록이 필요해요" }, { status: 400 });

  const prepared = prepareReorder(await pageRows(siteId), ids);
  if (!prepared.ok) {
    return NextResponse.json({ error: serviceMessage(prepared.error) }, { status: serviceStatus(prepared.error) });
  }

  // 한 트랜잭션으로 — 중간에 끊기면 순서가 어긋난 채 남는다.
  await prisma.$transaction(
    prepared.value.map((p) => prisma.expoPage.update({ where: { id: p.id }, data: { sortOrder: p.sortOrder } })),
  );
  return NextResponse.json({ order: prepared.value });
}
