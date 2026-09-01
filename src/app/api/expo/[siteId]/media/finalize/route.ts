import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnedSite, requireProjectAccess } from "@/lib/expo/auth";
import { deriveExpoPermissions } from "@/lib/expo/permissions";
import { authFailure, guardExpoRoute, readJsonBody } from "@/lib/expo/route-guard";
import { ensureExpoQuarantineBucket } from "@/lib/expo/quarantine-bucket";
import { createExpoFinalizeStorage, finalizeExpoUpload } from "@/lib/expo/media-upload-session";
import { ensureAssetBucketWithAdmin } from "@/lib/webinar-asset-bucket";

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
  const path = typeof read.body.path === "string" ? read.body.path : "";
  const declaredType = typeof read.body.declaredType === "string" ? read.body.declaredType : "";
  if (!path || !declaredType) return NextResponse.json({ error: "완료할 업로드 정보가 필요해요" }, { status: 422 });

  try {
    // Target/bucket verification happens before the service-role client returned here is used.
    const admin = await ensureExpoQuarantineBucket();
    const result = await finalizeExpoUpload(createExpoFinalizeStorage(admin as never), {
      workspaceId: owned.value.workspaceId,
      siteId: owned.value.id,
      userId: guarded.ctx.userId,
      path,
      declaredType,
      ensurePublicBucket: () => ensureAssetBucketWithAdmin(admin as never),
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "미디어를 완료할 수 없어요" }, { status: 422 });
  }
}
