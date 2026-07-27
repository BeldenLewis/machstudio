// 세션 로고 업로드 — 연사 사진과 같은 버킷·같은 형식·같은 한도를 쓴다.
// 라우트를 따로 둔 이유는 저장 경로(logos/)와 오류 문구("로고")뿐이다. 검증 규칙과 버킷 설정은
// 각각 webinar-speaker-photo.ts / webinar-asset-bucket.ts 한 곳에서 온다.
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { ASSET_BUCKET, ensureAssetBucket } from "@/lib/webinar-asset-bucket";
import { speakerPhotoExtension, validateSessionLogo } from "@/lib/webinar-speaker-photo";

async function authorize(webinarId: string, userId: string) {
  const webinar = await prisma.webinar.findUnique({ where: { id: webinarId } });
  if (!webinar) return null;

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: webinar.workspaceId } },
  });

  return membership ? webinar : null;
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
  if (!(file instanceof File)) return NextResponse.json({ error: "로고 파일을 선택해주세요." }, { status: 400 });

  const validationError = validateSessionLogo(file);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const extension = speakerPhotoExtension(file.type);
  if (!extension) return NextResponse.json({ error: "지원하지 않는 이미지 형식이에요." }, { status: 400 });

  try {
    const admin = await ensureAssetBucket();
    const path = `${webinar.workspaceId}/${webinar.id}/logos/${randomUUID()}.${extension}`;
    const { error } = await admin.storage.from(ASSET_BUCKET).upload(path, file, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) throw error;

    const { data } = admin.storage.from(ASSET_BUCKET).getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl }, { status: 201 });
  } catch (error) {
    console.error("[webinar] session logo upload failed", error);
    return NextResponse.json({ error: "로고 업로드에 실패했어요. 잠시 후 다시 시도해주세요." }, { status: 500 });
  }
}
