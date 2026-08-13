/**
 * 참가작 사진 업로드 — 공개 엔드포인트(신청자가 로그인 없이 올린다).
 *
 * **1장당 요청 1번**이다. 여러 장을 한 요청에 담으면 Vercel 요청 본문 상한(4.5MB)을
 * 파일 합계 + multipart 오버헤드가 함께 넘는다. 그래서 파일당 상한도 4MB 로 잡았다
 * (webinar-speaker-photo.ts 가 같은 이유로 4MB 다).
 *
 * 영상은 여기로 올리지 않는다 — YouTube 링크로 받는다(competition-config.extractYoutubeId).
 */
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/ratelimit";
import { ASSET_BUCKET, ensureAssetBucket } from "@/lib/webinar-asset-bucket";
import { COMPETITION_MEDIA } from "@/lib/competition-config";
import { resolveCompetitionStatus } from "@/lib/competition-status";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
} as const;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { ...CORS_HEADERS, "Access-Control-Max-Age": "86400" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const ip = getClientIp(request);
  const limited = rateLimit(`competition-image:${id}:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!limited.allowed) {
    return NextResponse.json({ error: "요청이 너무 잦아요." }, { status: 429, headers: CORS_HEADERS });
  }

  const competition = await prisma.competition.findUnique({ where: { id } });
  if (!competition) return NextResponse.json({ error: "대회 없음" }, { status: 404, headers: CORS_HEADERS });

  // 접수 기간이 아니면 업로드도 막는다 — 폼이 닫혔는데 스토리지만 열려 있으면 안 된다.
  if (!resolveCompetitionStatus(competition).canApply) {
    return NextResponse.json({ error: "지금은 접수 기간이 아니에요." }, { status: 403, headers: CORS_HEADERS });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "파일을 선택해주세요." }, { status: 400, headers: CORS_HEADERS });
  }
  if (!(COMPETITION_MEDIA.IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return NextResponse.json({ error: "JPG·PNG·WebP 이미지만 올릴 수 있어요." }, { status: 400, headers: CORS_HEADERS });
  }
  if (file.size > COMPETITION_MEDIA.MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "이미지는 장당 4MB 이하로 올려주세요." }, { status: 400, headers: CORS_HEADERS });
  }

  try {
    const admin = await ensureAssetBucket();
    const extension = EXTENSIONS[file.type];
    const path = `${competition.workspaceId}/${competition.id}/entries/${randomUUID()}.${extension}`;
    const { error } = await admin.storage.from(ASSET_BUCKET).upload(path, file, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) throw error;

    const { data } = admin.storage.from(ASSET_BUCKET).getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl }, { status: 201, headers: CORS_HEADERS });
  } catch (error) {
    console.error("[competition] entry image upload failed", error);
    return NextResponse.json({ error: "업로드에 실패했어요." }, { status: 500, headers: CORS_HEADERS });
  }
}
