/**
 * 발행 — draft 를 **서버가 다시 정규화해** published 에 굳힌다.
 *
 * 클라이언트가 보낸 것을 그대로 굳히지 않는다. 발행본은 공개 로더가 읽는 유일한 원본이라,
 * 여기 들어간 것은 이미 검증을 통과한 것이어야 한다.
 * draftRevision 은 건드리지 않는다 — 진행 중인 자동저장을 충돌로 막으면 안 된다.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardExpoRoute, authFailure } from "@/lib/expo/route-guard";
import { requireOwnedPage, requireProjectAccess } from "@/lib/expo/auth";
import { deriveExpoPermissions } from "@/lib/expo/permissions";
import { publishPageRevision } from "@/lib/expo/revision-service";

export async function POST(request: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const guard = await guardExpoRoute(request, { write: true });
  if (!guard.ok) return guard.response;

  const page = await prisma.expoPage.findFirst({
    where: { id: pageId, deletedAt: null, site: { deletedAt: null } },
    select: {
      id: true, siteId: true, draft: true, published: true,
      site: { select: { id: true, workspaceId: true, projectId: true } },
    },
  });
  const owned = requireOwnedPage(page, guard.ctx.userId, guard.ctx.memberWorkspaceIds);
  if (!owned.ok) return authFailure(owned.failure);
  const access = requireProjectAccess(guard.ctx.workspaceRole(owned.value.site.workspaceId), guard.ctx.projectRole(owned.value.site.projectId));
  if (!access.ok) return authFailure(access.failure);

  /**
   * 발행은 **역할까지** 본다. 멤버십만 보면 MEMBER 도 발행할 수 있는데, 화면은 그에게
   * `canPublish: false` 라고 말한다(`permissions.ts`) — 숨긴 버튼을 API 로는 누를 수 있는
   * 상태였다. 버튼을 숨기는 것은 인가가 아니고, 라우트가 제자리에서 다시 판정해야 한다.
   */
  if (!deriveExpoPermissions(guard.ctx.workspaceRole(owned.value.site.workspaceId), guard.ctx.projectRole(owned.value.site.projectId)).canPublish) {
    return authFailure({ kind: "forbidden" });
  }

  const now = new Date();
  const result = await prisma.$transaction((tx) => publishPageRevision(tx, {
    pageId: page!.id,
    siteId: page!.siteId,
    publishedBy: guard.ctx.userId!,
    publicEmbedEnabled: guard.ctx.caps.publicEmbed,
    now,
  }));
  if (!result.ok) {
    return NextResponse.json(
      { error: "아직 발행할 수 없어요", code: result.code, issues: result.issues },
      { status: result.status },
    );
  }

  return NextResponse.json({
    page: { id: result.pageId, publishedAt: now },
    revision: { id: result.revisionId, sequence: result.sequence, codeDigest: result.codeDigest },
  });
}
