// 랜딩 히어로 배경 미디어 업로드(이미지·동영상) — speaker-photo 와 같은 버킷(webinar-assets)을 쓰되,
// 동영상은 버킷 기본 제한(5MB·이미지 전용)에 걸리므로 업로드 전에 제한을 상향해 둔다.
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  LANDING_MEDIA_MIME_TYPES,
  landingMediaExtension,
  landingMediaKind,
  validateLandingMedia,
} from "@/lib/webinar-landing-media";

const BUCKET = "webinar-assets";
const SPEAKER_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

async function authorize(webinarId: string, userId: string) {
  const webinar = await prisma.webinar.findUnique({ where: { id: webinarId } });
  if (!webinar) return null;
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: webinar.workspaceId } },
  });
  return membership ? webinar : null;
}

// 버킷이 없으면 생성, 있으면 동영상까지 받도록 제한을 상향(멱등 — 이미 상향돼 있어도 무해).
async function ensureAssetBucket() {
  const admin = createAdminClient();
  const allowedMimeTypes = [...new Set([...SPEAKER_PHOTO_MIME_TYPES, ...LANDING_MEDIA_MIME_TYPES])];
  const { error: bucketError } = await admin.storage.getBucket(BUCKET);
  if (bucketError) {
    const { error } = await admin.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: "50MB",
      allowedMimeTypes,
    });
    if (error && !/already exists/i.test(error.message)) throw error;
    return admin;
  }
  const { error } = await admin.storage.updateBucket(BUCKET, {
    public: true,
    fileSizeLimit: "50MB",
    allowedMimeTypes,
  });
  if (error) throw error;
  return admin;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const webinar = await authorize(id, user.id);
  if (!webinar) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "파일을 선택해주세요." }, { status: 400 });

  const validationError = validateLandingMedia(file);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const extension = landingMediaExtension(file.type);
  const kind = landingMediaKind(file.type);
  if (!extension || !kind) return NextResponse.json({ error: "지원하지 않는 형식이에요." }, { status: 400 });

  try {
    const admin = await ensureAssetBucket();
    const path = `${webinar.workspaceId}/${webinar.id}/landing/${randomUUID()}.${extension}`;
    const { error } = await admin.storage.from(BUCKET).upload(path, file, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) throw error;

    const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl, type: kind }, { status: 201 });
  } catch (error) {
    console.error("[webinar] landing media upload failed", error);
    return NextResponse.json({ error: "업로드에 실패했어요. 잠시 후 다시 시도해주세요." }, { status: 500 });
  }
}
