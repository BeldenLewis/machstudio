/**
 * 참가작 로고 — 관리자가 직접 넣거나 뗀다.
 *
 * 신청 폼의 "팀 로고로 써요" 항목은 **그 설정을 켠 뒤 들어오는 신청부터만** 로고가 붙는다
 * (제출 당시엔 어느 사진이 로고 필드에서 왔는지 기록이 없어서, 이미 접수된 참가작은 소급
 * 적용이 안 된다). 이미 접수된 참가작에 로고를 넣으려면 관리자가 여기서 직접 올려야 한다.
 *
 * entry-image 라우트(공개, 접수 기간에만 열림)와 달리 **관리자 인증이 필요하고 접수 기간과
 * 무관하게 항상 연다** — 투표가 이미 시작된 뒤에도 로고를 넣을 수 있어야 한다.
 */
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { downscaleUpload, extensionForContentType } from "@/lib/image-downscale";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { ASSET_BUCKET, ensureAssetBucket } from "@/lib/webinar-asset-bucket";
import { COMPETITION_MEDIA, normalizeMedia, type CompetitionMediaItem } from "@/lib/competition-config";

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

async function authorize(competitionId: string, entryId: string, userId: string) {
  const entry = await prisma.competitionEntry.findUnique({
    where: { id: entryId },
    include: { competition: { select: { id: true, workspaceId: true } } },
  });
  if (!entry || entry.competitionId !== competitionId) return null;
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: entry.competition.workspaceId } },
  });
  return membership ? entry : null;
}

/** 기존 media 에서 로고 자리만 바꿔 끼운다 — 대표 사진 등 나머지 항목은 그대로 둔다. */
function replaceLogo(media: CompetitionMediaItem[], logo: CompetitionMediaItem | null): CompetitionMediaItem[] {
  const rest = media.filter((m) => !(m.kind === "image" && m.role === "logo"));
  return logo ? [...rest, logo] : rest;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id, entryId } = await params;
  const entry = await authorize(id, entryId, user.id);
  if (!entry) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "파일을 선택해주세요." }, { status: 400 });
  if (!(COMPETITION_MEDIA.IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return NextResponse.json({ error: "JPG·PNG·WebP 이미지만 올릴 수 있어요." }, { status: 400 });
  }
  if (file.size > COMPETITION_MEDIA.MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "이미지는 4MB 이하로 올려주세요." }, { status: 400 });
  }

  try {
    const admin = await ensureAssetBucket();
    const extension = EXTENSIONS[file.type];
    const downscaled = await downscaleUpload(file);
    const storedExt = extensionForContentType(downscaled.contentType, extension);
    const path = `${entry.competition.workspaceId}/${entry.competition.id}/entries/logo-${randomUUID()}.${storedExt}`;
    const { error } = await admin.storage.from(ASSET_BUCKET).upload(path, downscaled.body, {
      contentType: downscaled.contentType,
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) throw error;

    const { data } = admin.storage.from(ASSET_BUCKET).getPublicUrl(path);
    const media = normalizeMedia(entry.media);
    const nextMedia = replaceLogo(media, { kind: "image", url: data.publicUrl, sortOrder: media.length, role: "logo" });

    const updated = await prisma.competitionEntry.update({
      where: { id: entryId },
      data: { media: JSON.parse(JSON.stringify(nextMedia)) },
    });

    await logActivity({
      workspaceId: entry.competition.workspaceId,
      userId: user.id,
      action: "competition.entry_updated",
      meta: { competitionId: id, entryId, entryNo: updated.entryNo, field: "logo" },
    });

    return NextResponse.json({ entry: updated }, { status: 201 });
  } catch (error) {
    console.error("[competition] entry logo upload failed", error);
    return NextResponse.json({ error: "업로드에 실패했어요. 잠시 후 다시 시도해주세요." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id, entryId } = await params;
  const entry = await authorize(id, entryId, user.id);
  if (!entry) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const media = normalizeMedia(entry.media);
  const nextMedia = replaceLogo(media, null);

  const updated = await prisma.competitionEntry.update({
    where: { id: entryId },
    data: { media: JSON.parse(JSON.stringify(nextMedia)) },
  });

  await logActivity({
    workspaceId: entry.competition.workspaceId,
    userId: user.id,
    action: "competition.entry_updated",
    meta: { competitionId: id, entryId, entryNo: updated.entryNo, field: "logo-removed" },
  });

  return NextResponse.json({ entry: updated });
}
