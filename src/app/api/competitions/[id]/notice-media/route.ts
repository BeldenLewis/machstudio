// 공고 히어로 배경 미디어 업로드(이미지·동영상).
// 웨비나 landing-media 와 같은 규약이다 — 버킷 설정과 형식 검증은
// webinar-asset-bucket / webinar-landing-media 한 곳이 소유한다. 여기서 허용 목록을
// 다시 적으면 한쪽이 새 형식을 받아도 이 라우트에서만 막히고, 원인이 안 보인다.
import { randomUUID } from "node:crypto";
import { downscaleUpload, extensionForContentType } from "@/lib/image-downscale";
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
    /*
      저장 전에 줄인다 — 이유는 image-downscale.ts 주석. 요약하면 Supabase 이미지
      변환은 유료라 안 켜져 있고(변환 URL 이 403), 그렇다고 원본을 그대로 서빙하면
      예전처럼 egress 쿼터를 태운다. 저장된 것 자체를 작게 만들어 둘 다 피한다.
    */
    const downscaled = await downscaleUpload(file);
    // 형식이 바뀌면(webp) 경로 확장자도 따라가야 한다 — 안 그러면 .jpg 인데 내용은 webp 다.
    const storedExt = extensionForContentType(downscaled.contentType, extension);
    const path = `${competition.workspaceId}/${competition.id}/notice/${randomUUID()}.${storedExt}`;
    const { error } = await admin.storage.from(ASSET_BUCKET).upload(path, downscaled.body, {
      contentType: downscaled.contentType,
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
