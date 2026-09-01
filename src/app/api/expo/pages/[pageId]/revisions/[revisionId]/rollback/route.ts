/** 발행본 복구 — URL 페이지와 대상 revision 의 소속을 모두 확인한 뒤 서비스에 위임한다. */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardExpoRoute, authFailure } from "@/lib/expo/route-guard";
import { requireOwnedPage, requireProjectAccess } from "@/lib/expo/auth";
import { deriveExpoPermissions } from "@/lib/expo/permissions";
import { rollbackPageRevision } from "@/lib/expo/revision-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ pageId: string; revisionId: string }> },
) {
  const { pageId, revisionId } = await params;
  const guard = await guardExpoRoute(request, { write: true });
  if (!guard.ok) return guard.response;

  const page = await prisma.expoPage.findFirst({
    where: { id: pageId, deletedAt: null, site: { deletedAt: null } },
    select: { id: true, siteId: true, draft: true, draftRevision: true, published: true, site: { select: { id: true, workspaceId: true, projectId: true } } },
  });
  const owned = requireOwnedPage(page, guard.ctx.userId, guard.ctx.memberWorkspaceIds);
  if (!owned.ok) return authFailure(owned.failure);
  const workspaceRole = guard.ctx.workspaceRole(owned.value.site.workspaceId);
  const projectRole = guard.ctx.projectRole(owned.value.site.projectId);
  const access = requireProjectAccess(workspaceRole, projectRole);
  if (!access.ok) return authFailure(access.failure);
  if (!deriveExpoPermissions(workspaceRole, projectRole).canPublish) return authFailure({ kind: "forbidden" });

  // 서비스도 같은 조건을 재확인하지만, 여기서 404 를 내야 다른 페이지의 이력이 존재하는지 새지 않는다.
  const target = await prisma.expoPageRevision.findFirst({
    where: { id: revisionId, pageId: owned.value.id },
    select: { id: true },
  });
  if (!target) return authFailure({ kind: "not-found" });

  const now = new Date();
  const result = await prisma.$transaction((tx) => rollbackPageRevision(tx, {
    pageId: owned.value.id,
    siteId: owned.value.siteId,
    revisionId: target.id,
    publishedBy: guard.ctx.userId,
    publicEmbedEnabled: guard.ctx.caps.publicEmbed,
    now,
  }));
  if (!result.ok) {
    return NextResponse.json(
      { error: "아직 발행본으로 복구할 수 없어요", code: result.code, issues: result.issues },
      { status: result.status },
    );
  }
  return NextResponse.json({
    page: { id: result.pageId, publishedAt: now },
    revision: { id: result.revisionId, sequence: result.sequence, codeDigest: result.codeDigest },
  });
}
