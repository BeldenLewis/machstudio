/**
 * 미리보기 링크 재발급 — **옛 링크를 끊는 것**이 목적이다.
 * 링크를 받은 사람이 더는 못 보게 해야 할 때 쓴다(CollectSource.previewToken 과 같은 패턴).
 */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { guardExpoRoute, authFailure } from "@/lib/expo/route-guard";
import { requireOwnedSite } from "@/lib/expo/auth";

export async function POST(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const guard = await guardExpoRoute(request, { write: true });
  if (!guard.ok) return guard.response;

  const site = await prisma.expoSite.findFirst({
    where: { id: siteId, deletedAt: null },
    select: { id: true, workspaceId: true, projectId: true },
  });
  const owned = requireOwnedSite(site, guard.ctx.userId, guard.ctx.memberWorkspaceIds);
  if (!owned.ok) return authFailure(owned.failure);

  const updated = await prisma.expoSite.update({
    where: { id: site!.id },
    data: { previewToken: randomUUID() },
    select: { previewToken: true },
  });
  return NextResponse.json({ previewToken: updated.previewToken });
}
