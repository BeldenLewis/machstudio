// 공고 히어로 배경 미디어 업로드(이미지·동영상).
// 웨비나 landing-media 와 같은 규약이다 — 버킷 설정과 형식 검증은
// webinar-asset-bucket / webinar-landing-media 한 곳이 소유한다. 여기서 허용 목록을
// 다시 적으면 한쪽이 새 형식을 받아도 이 라우트에서만 막히고, 원인이 안 보인다.
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { ASSET_BUCKET, ensureAssetBucket } from "@/lib/webinar-asset-bucket";
import {
  landingMediaExtension,
  landingMediaKind,
  validateLandingMedia,
} from "@/lib/webinar-landing-media";

async function authorize(competitionId: string, userId: string) {
  const competition = await prisma.competition.findUnique({ where: { id: competitionId } });
  if (!competition) return null;
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: competition.workspaceId } },
  });
  return membership ? competition : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const competition = await authorize(id, user.id);
  if (!competition) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

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
    const path = `${competition.workspaceId}/${competition.id}/notice/${randomUUID()}.${extension}`;
    const { error } = await admin.storage.from(ASSET_BUCKET).upload(path, file, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) throw error;

    const { data } = admin.storage.from(ASSET_BUCKET).getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl, type: kind }, { status: 201 });
  } catch (error) {
    console.error("[competition] notice media upload failed", error);
    return NextResponse.json({ error: "업로드에 실패했어요. 잠시 후 다시 시도해주세요." }, { status: 500 });
  }
}
