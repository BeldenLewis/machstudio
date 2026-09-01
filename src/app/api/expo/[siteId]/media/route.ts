/**
 * 홈페이지 이미지 업로드 — **업로드 시점에 줄인다.**
 *
 * 읽을 때 줄이지 않는 이유: Supabase 이미지 변환은 유료 기능이라 이 프로젝트에서 403 이
 * 난다(2026-08-19 실측). 저장된 것 자체가 작아야 변환 없이도 보이고, 원본 서빙이 안전하다.
 *
 * 이 라우트는 `multipart/form-data` 를 받으므로 공용 출처 가드(JSON 전용)를 쓰지 않고
 * 여기서 따로 본다.
 */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureAssetBucket, ASSET_BUCKET } from "@/lib/webinar-asset-bucket";
import { requireOwnedSite, requireProjectAccess } from "@/lib/expo/auth";
import { authFailure, guardExpoRoute } from "@/lib/expo/route-guard";
import { deriveExpoPermissions } from "@/lib/expo/permissions";
import {
  checkUploadCandidate, EXPO_IMAGE_MESSAGES, expoObjectPrefix, type ImageRejection,
} from "@/lib/expo/image-guard";
import { processExpoRaster } from "@/lib/expo/image-process";

/** W1 호환 multipart는 Vercel 본문 상한 아래의 기존 4MiB transport를 그대로 둔다. */
const EXPO_LEGACY_MULTIPART_BYTES = 4 * 1024 * 1024;

const reject = (code: ImageRejection) =>
  NextResponse.json({ error: EXPO_IMAGE_MESSAGES[code], code }, { status: 422 });

export async function POST(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const guarded = await guardExpoRoute(request, { write: true, contentTypes: ["multipart/form-data"] });
  if (!guarded.ok) return guarded.response;
  const siteRow = await prisma.expoSite.findFirst({
    where: { id: siteId, deletedAt: null },
    select: { id: true, workspaceId: true, projectId: true },
  });
  const owned = requireOwnedSite(siteRow, guarded.ctx.userId, guarded.ctx.memberWorkspaceIds);
  if (!owned.ok) return authFailure(owned.failure);
  const workspaceRole = guarded.ctx.workspaceRole(owned.value.workspaceId);
  const projectRole = guarded.ctx.projectRole(owned.value.projectId);
  const access = requireProjectAccess(workspaceRole, projectRole);
  if (!access.ok) return authFailure(access.failure);
  if (!deriveExpoPermissions(workspaceRole, projectRole).canEdit) {
    return authFailure({ kind: "forbidden" });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "파일이 필요해요" }, { status: 400 });
  if (file.size > EXPO_LEGACY_MULTIPART_BYTES) return reject("too-large");

  // ── 바이트를 직접 보고 판정한다 — 선언한 MIME 을 믿지 않는다 ──────────
  const bytes = new Uint8Array(await file.arrayBuffer());
  const candidate = checkUploadCandidate({ declaredType: file.type, bytes });
  if (candidate) return reject(candidate);

  let processed: Awaited<ReturnType<typeof processExpoRaster>>;
  try {
    processed = await processExpoRaster({ declaredType: file.type, bytes });
  } catch {
    return reject("unreadable");
  }

  // ── 저장 — 경로가 곧 소유다 ────────────────────────────────────────
  await ensureAssetBucket();
  const path = `${expoObjectPrefix(owned.value.workspaceId, owned.value.id)}${randomUUID()}.${processed.optimized.extension}`;

  const admin = createAdminClient();
  const { error } = await admin.storage.from(ASSET_BUCKET).upload(path, processed.optimized.bytes, {
    contentType: processed.optimized.mimeType,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) return NextResponse.json({ error: "업로드에 실패했어요" }, { status: 502 });

  const { data } = admin.storage.from(ASSET_BUCKET).getPublicUrl(path);
  return NextResponse.json({
    url: data.publicUrl,
    width: processed.width,
    height: processed.height,
    bytes: processed.optimized.bytes.length,
  }, { status: 201 });
}
