import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { speakerPhotoExtension, validateSpeakerPhoto } from "@/lib/webinar-speaker-photo";

const BUCKET = "webinar-assets";

async function authorize(webinarId: string, userId: string) {
  const webinar = await prisma.webinar.findUnique({ where: { id: webinarId } });
  if (!webinar) return null;

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: webinar.workspaceId } },
  });

  return membership ? webinar : null;
}

async function ensureAssetBucket() {
  const admin = createAdminClient();
  const { error: bucketError } = await admin.storage.getBucket(BUCKET);
  if (!bucketError) return admin;

  const { error } = await admin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: "5MB",
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  });
  // 동시에 처음 올린 두 요청 중 하나는 이미 생성됐다는 응답을 받을 수 있다.
  if (error && !/already exists/i.test(error.message)) throw error;
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
  if (!(file instanceof File)) return NextResponse.json({ error: "사진 파일을 선택해주세요." }, { status: 400 });

  const validationError = validateSpeakerPhoto(file);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const extension = speakerPhotoExtension(file.type);
  if (!extension) return NextResponse.json({ error: "지원하지 않는 이미지 형식이에요." }, { status: 400 });

  try {
    const admin = await ensureAssetBucket();
    const path = `${webinar.workspaceId}/${webinar.id}/speakers/${randomUUID()}.${extension}`;
    const { error } = await admin.storage.from(BUCKET).upload(path, file, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) throw error;

    const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl }, { status: 201 });
  } catch (error) {
    console.error("[webinar] speaker photo upload failed", error);
    return NextResponse.json({ error: "사진 업로드에 실패했어요. 잠시 후 다시 시도해주세요." }, { status: 500 });
  }
}
