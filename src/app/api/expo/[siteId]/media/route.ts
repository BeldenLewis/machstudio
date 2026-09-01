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
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureAssetBucket, ASSET_BUCKET } from "@/lib/webinar-asset-bucket";
import { downscaleUpload, extensionForContentType } from "@/lib/image-downscale";
import { getExpoCapabilities } from "@/lib/expo/capability";
import { probeExpoSchema } from "@/lib/expo/schema-probe";
import { requireOwnedSite, requireProjectAccess, type ProjectRole, type WorkspaceRole } from "@/lib/expo/auth";
import { authFailure } from "@/lib/expo/route-guard";
import { deriveExpoPermissions } from "@/lib/expo/permissions";
import {
  checkDecodedMetadata, checkDownscaled, checkUploadCandidate,
  EXPO_IMAGE_LIMITS, EXPO_IMAGE_MESSAGES, expoObjectPrefix, type ImageRejection,
} from "@/lib/expo/image-guard";

const reject = (code: ImageRejection) =>
  NextResponse.json({ error: EXPO_IMAGE_MESSAGES[code], code }, { status: 422 });

export async function POST(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;

  const caps = await getExpoCapabilities({ probe: probeExpoSchema });
  if (!caps.admin) return NextResponse.json({ error: "찾을 수 없어요" }, { status: 404 });

  // 파일 업로드라 JSON 가드를 못 쓴다 — 출처만 따로 본다.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") {
    return NextResponse.json({ error: "다른 사이트에서 온 요청은 처리하지 않아요" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return authFailure({ kind: "unauthenticated" });

  const [memberships, projectMemberships] = await Promise.all([
    prisma.workspaceMember.findMany({ where: { userId: user.id }, select: { workspaceId: true, role: true } }),
    prisma.projectMember.findMany({
      where: { userId: user.id, project: { workspace: { members: { some: { userId: user.id } } } } },
      select: { projectId: true, role: true },
    }),
  ]);
  const siteRow = await prisma.expoSite.findFirst({
    where: { id: siteId, deletedAt: null },
    select: { id: true, workspaceId: true, projectId: true },
  });
  const owned = requireOwnedSite(siteRow, user.id, memberships.map((m) => m.workspaceId));
  if (!owned.ok) return authFailure(owned.failure);
  const workspaceRole = memberships.find((m) => m.workspaceId === owned.value.workspaceId)?.role as WorkspaceRole | undefined;
  const projectRole = projectMemberships.find((m) => m.projectId === owned.value.projectId)?.role as ProjectRole | undefined;
  const access = requireProjectAccess(workspaceRole ?? null, projectRole ?? null);
  if (!access.ok) return authFailure(access.failure);
  if (!deriveExpoPermissions(workspaceRole ?? null, projectRole ?? null).canEdit) {
    return authFailure({ kind: "forbidden" });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "파일이 필요해요" }, { status: 400 });

  // ── 바이트를 직접 보고 판정한다 — 선언한 MIME 을 믿지 않는다 ──────────
  const bytes = new Uint8Array(await file.arrayBuffer());
  const candidate = checkUploadCandidate({ declaredType: file.type, bytes });
  if (candidate) return reject(candidate);

  let meta: { width?: number; height?: number; format?: string };
  try {
    meta = await sharp(Buffer.from(bytes), { limitInputPixels: EXPO_IMAGE_LIMITS.maxPixels }).metadata();
  } catch {
    return reject("unreadable");
  }
  const decoded = checkDecodedMetadata(meta);
  if (decoded) return reject(decoded);

  // ── 축소. 실패하면 원본이 그대로 오므로(공용 헬퍼의 fail-open) 결과를 다시 잰다 ──
  const scaled = await downscaleUpload(file);
  // 헬퍼는 Buffer 또는 원본 File 을 돌려준다(축소 실패 시 후자).
  const scaledBytes = scaled.body instanceof File
    ? new Uint8Array(await scaled.body.arrayBuffer())
    : new Uint8Array(scaled.body);

  let scaledMeta: { width?: number; height?: number };
  try {
    scaledMeta = await sharp(Buffer.from(scaledBytes), { limitInputPixels: EXPO_IMAGE_LIMITS.maxPixels }).metadata();
  } catch {
    return reject("downscale-failed");
  }
  const after = checkDownscaled({ bytes: scaledBytes.length, width: scaledMeta.width, height: scaledMeta.height });
  if (after) return reject(after);

  // ── 저장 — 경로가 곧 소유다 ────────────────────────────────────────
  await ensureAssetBucket();
  const ext = extensionForContentType(scaled.contentType, "jpg");
  const path = `${expoObjectPrefix(owned.value.workspaceId, owned.value.id)}${randomUUID()}.${ext}`;

  const admin = createAdminClient();
  const { error } = await admin.storage.from(ASSET_BUCKET).upload(path, scaledBytes, {
    contentType: scaled.contentType,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) return NextResponse.json({ error: "업로드에 실패했어요" }, { status: 502 });

  const { data } = admin.storage.from(ASSET_BUCKET).getPublicUrl(path);
  return NextResponse.json({
    url: data.publicUrl,
    width: scaledMeta.width,
    height: scaledMeta.height,
    bytes: scaledBytes.length,
  }, { status: 201 });
}
