/**
 * 공개 스위치 — **실제로 밖에 나가는 순간**이다.
 *
 * 발행(사본 만들기)과 나눈 이유가 여기다: 스니펫을 미리 붙여 두고 전환일에 스위치만 켠다.
 * 되돌리기도 스위치 하나다.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardExpoRoute, readJsonBody, authFailure } from "@/lib/expo/route-guard";
import { requireOwnedPage, requireWorkspaceAdmin } from "@/lib/expo/auth";
import { prepareLiveToggle } from "@/lib/expo/site-service";
import { liveIssues } from "@/lib/expo/readiness";

export async function POST(request: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const guard = await guardExpoRoute(request, { write: true });
  if (!guard.ok) return guard.response;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  if (typeof parsed.body.live !== "boolean") {
    return NextResponse.json({ error: "켤지 끌지가 필요해요" }, { status: 400 });
  }
  const live = parsed.body.live;

  const page = await prisma.expoPage.findFirst({
    where: { id: pageId, deletedAt: null },
    select: {
      id: true, siteId: true, published: true,
      site: { select: { id: true, workspaceId: true, projectId: true } },
    },
  });
  const owned = requireOwnedPage(page, guard.ctx.userId, guard.ctx.memberWorkspaceIds);
  if (!owned.ok) return authFailure(owned.failure);

  // 공개 스위치도 `canPublish` 다 — 끄는 것까지 포함해서. 남이 켠 것을 아무나 끄면
  // 전시 기간 중에 파트너 사이트가 조용히 빈다.
  const admin = requireWorkspaceAdmin(guard.ctx.userId, guard.ctx.workspaceRole(owned.value.site.workspaceId));
  if (!admin.ok) return authFailure(admin.failure);

  // 켤 때만 막는다 — 끄는 것은 언제나 되어야 한다(되돌리기를 막으면 안 된다).
  if (live) {
    const issues = liveIssues(page!.published);
    if (issues.length > 0) {
      return NextResponse.json({ error: "아직 공개할 수 없어요", issues }, { status: 422 });
    }
  }

  const prepared = prepareLiveToggle(page!, live);
  if (!prepared.ok) {
    return NextResponse.json({ error: "아직 공개할 수 없어요" }, { status: 422 });
  }

  const updated = await prisma.expoPage.update({
    where: { id: page!.id },
    data: { liveAt: prepared.value.liveAt },
    select: { id: true, liveAt: true },
  });
  return NextResponse.json({ page: updated });
}
