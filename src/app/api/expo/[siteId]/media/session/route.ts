import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnedSite, requireProjectAccess } from "@/lib/expo/auth";
import { deriveExpoPermissions } from "@/lib/expo/permissions";
import { authFailure, guardExpoRoute, readJsonBody } from "@/lib/expo/route-guard";
import { ensureExpoQuarantineBucket } from "@/lib/expo/quarantine-bucket";
import { createMediaUploadSession, parseMediaSessionInput } from "@/lib/expo/media-upload-session";

export async function POST(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const guarded = await guardExpoRoute(request, { write: true });
  if (!guarded.ok) return guarded.response;
  const { siteId } = await params;
  const site = await prisma.expoSite.findFirst({
    where: { id: siteId, deletedAt: null },
    select: { id: true, workspaceId: true, projectId: true },
  });
  const owned = requireOwnedSite(site, guarded.ctx.userId, guarded.ctx.memberWorkspaceIds);
  if (!owned.ok) return authFailure(owned.failure);
  const workspaceRole = guarded.ctx.workspaceRole(owned.value.workspaceId);
  const projectRole = guarded.ctx.projectRole(owned.value.projectId);
  const access = requireProjectAccess(workspaceRole, projectRole);
  if (!access.ok) return authFailure(access.failure);
  if (!deriveExpoPermissions(workspaceRole, projectRole).canEdit) return authFailure({ kind: "forbidden" });

  const read = await readJsonBody(request, 4 * 1024);
  if (!read.ok) return read.response;
  let input: ReturnType<typeof parseMediaSessionInput>;
  try {
    input = parseMediaSessionInput(read.body);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "업로드 정보가 올바르지 않아요" }, { status: 422 });
  }

  try {
    const admin = await ensureExpoQuarantineBucket();
    const session = await createMediaUploadSession({
      admin: admin as never,
      workspaceId: owned.value.workspaceId,
      siteId: owned.value.id,
      userId: guarded.ctx.userId,
      ...input,
    });
    return NextResponse.json(session, { status: 201 });
  } catch {
    return NextResponse.json({ error: "안전한 업로드 세션을 만들 수 없어요" }, { status: 502 });
  }
}
