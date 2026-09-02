/**
 * 발행 이력은 현재 초안과 분리된 감사 기록이다. 사용자 계정은 삭제될 수 있으므로
 * publishedBy 에 FK 를 만들지 않고, 표시용 프로필만 애플리케이션에서 덧붙인다.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardExpoRoute, authFailure } from "@/lib/expo/route-guard";
import { requireOwnedPage, requireProjectAccess } from "@/lib/expo/auth";
import { normalizeExpoPage } from "@/lib/expo/config";

export interface RevisionListItem {
  id: string;
  sequence: number;
  codeDigest: string;
  publishedBy: string;
  publisher: { id: string; name: string | null; email: string | null } | null;
  createdAt: string;
  summary: {
    preset?: string;
    sectionCount: number;
    campaignCount: number;
    destinationCount: number;
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const guard = await guardExpoRoute(request);
  if (!guard.ok) return guard.response;

  const page = await prisma.expoPage.findFirst({
    where: { id: pageId, deletedAt: null, site: { deletedAt: null } },
    select: { id: true, siteId: true, site: { select: { id: true, workspaceId: true, projectId: true } } },
  });
  const owned = requireOwnedPage(page, guard.ctx.userId, guard.ctx.memberWorkspaceIds);
  if (!owned.ok) return authFailure(owned.failure);
  const access = requireProjectAccess(
    guard.ctx.workspaceRole(owned.value.site.workspaceId),
    guard.ctx.projectRole(owned.value.site.projectId),
  );
  if (!access.ok) return authFailure(access.failure);

  const revisions = await prisma.expoPageRevision.findMany({
    where: { pageId: owned.value.id },
    orderBy: { sequence: "desc" },
    take: 20,
    select: { id: true, sequence: true, codeDigest: true, publishedBy: true, createdAt: true, snapshot: true },
  });
  const publishers = await prisma.user.findMany({
    where: { id: { in: [...new Set(revisions.map((revision) => revision.publishedBy))] } },
    select: { id: true, name: true, email: true },
  });
  const publisherById = new Map(publishers.map((publisher) => [publisher.id, publisher]));

  const items: RevisionListItem[] = revisions.map((revision) => {
    const snapshot = normalizeExpoPage(revision.snapshot);
    return {
      id: revision.id,
      sequence: revision.sequence,
      codeDigest: revision.codeDigest,
      publishedBy: revision.publishedBy,
      publisher: publisherById.get(revision.publishedBy) ?? null,
      createdAt: revision.createdAt.toISOString(),
      summary: {
        ...(snapshot.preset ? { preset: snapshot.preset } : {}),
        sectionCount: snapshot.sections.length,
        campaignCount: snapshot.settings?.campaigns?.length ?? 0,
        destinationCount: snapshot.settings?.destinations?.length ?? 0,
      },
    };
  });
  return NextResponse.json({ revisions: items });
}
