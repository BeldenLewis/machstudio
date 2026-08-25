// 수집 소스 "기본 정보" 탭의 포스터 업로드 — 웨비나 연사 사진·경진대회 공고 미디어와 같은 규약이다
// (webinar-asset-bucket 이 버킷 설정을 한 곳에서 관리).
import { randomUUID } from "node:crypto";
import { downscaleUpload, extensionForContentType } from "@/lib/image-downscale";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { ASSET_BUCKET, ensureAssetBucket } from "@/lib/webinar-asset-bucket";
import { speakerPhotoExtension, validatePoster } from "@/lib/webinar-speaker-photo";

async function authorize(sourceId: string, userId: string) {
  const source = await prisma.collectSource.findUnique({ where: { id: sourceId } });
  if (!source) return null;
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: source.workspaceId } },
  });
  return membership ? source : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const source = await authorize(id, user.id);
  if (!source) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "파일을 선택해주세요." }, { status: 400 });

  const validationError = validatePoster(file);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const extension = speakerPhotoExtension(file.type);
  if (!extension) return NextResponse.json({ error: "지원하지 않는 형식이에요." }, { status: 400 });

  try {
    const admin = await ensureAssetBucket();
    const downscaled = await downscaleUpload(file);
    const storedExt = extensionForContentType(downscaled.contentType, extension);
    const path = `${source.workspaceId}/${source.id}/poster/${randomUUID()}.${storedExt}`;
    const { error } = await admin.storage.from(ASSET_BUCKET).upload(path, downscaled.body, {
      contentType: downscaled.contentType,
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) throw error;

    const { data } = admin.storage.from(ASSET_BUCKET).getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl }, { status: 201 });
  } catch (error) {
    console.error("[collect-source] poster upload failed", error);
    return NextResponse.json({ error: "업로드에 실패했어요. 잠시 후 다시 시도해주세요." }, { status: 500 });
  }
}
