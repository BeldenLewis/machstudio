/**
 * 마하스튜디오 업로드(자료실) — 목록과 등록.
 *
 * 실제 파일은 이 라우트를 거치지 않는다(sign/route.ts 머리말 참고). 브라우저가 Storage 에
 * 직접 올린 뒤, 여기 POST 로 "다 올렸다" 는 사실과 표시용 메타(원본 이름·크기·가로세로·
 * 길이)만 등록한다.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { kindForMimeType, validateMediaUpload } from "@/lib/media-asset";
import { MEDIA_BUCKET } from "@/lib/media-asset-bucket";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const membership = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
  if (!membership) return NextResponse.json({ assets: [] });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  const assets = await prisma.mediaAsset.findMany({
    where: {
      workspaceId: membership.workspaceId,
      ...(projectId ? { projectId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      createdBy: { select: { name: true, email: true } },
      project: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ assets });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const membership = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
  if (!membership) return NextResponse.json({ error: "워크스페이스가 없어요" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { path, mimeType, size, originalName, width, height, durationSec, groupLabel } = body as {
    path?: unknown; mimeType?: unknown; size?: unknown; originalName?: unknown;
    width?: unknown; height?: unknown; durationSec?: unknown; groupLabel?: unknown;
  };

  const validationError = validateMediaUpload({ mimeType, size });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const kind = kindForMimeType(String(mimeType));

  if (typeof path !== "string" || !path) {
    return NextResponse.json({ error: "업로드 경로가 없어요." }, { status: 400 });
  }
  /**
   * **경로에서 소속을 읽는다** — 클라이언트가 보낸 값을 그대로 믿지 않는다. 경로는
   * sign/route.ts 가 `${workspaceId}/${projectId 또는 "workspace"}/${uuid}.${ext}` 로
   * 지었으므로, 앞머리가 이 사용자의 워크스페이스가 아니면 남의 자리에 등록하려는 것이다.
   */
  const [pathWorkspaceId, pathProjectSegment] = path.split("/");
  if (pathWorkspaceId !== membership.workspaceId) {
    return NextResponse.json({ error: "이 업로드 자리를 쓸 수 없어요." }, { status: 403 });
  }
  const projectId = pathProjectSegment === "workspace" ? null : pathProjectSegment;

  // 실제로 올라왔는지 확인한다 — 존재하지 않는 오브젝트를 가리키는 죽은 행을 만들지 않는다.
  const admin = createAdminClient();
  const folder = path.split("/").slice(0, -1).join("/");
  const fileName = path.split("/").pop()!;
  const { data: listing, error: listError } = await admin.storage
    .from(MEDIA_BUCKET)
    .list(folder, { search: fileName, limit: 1 });
  if (listError || !listing?.some((entry) => entry.name === fileName)) {
    return NextResponse.json({ error: "업로드가 아직 끝나지 않았어요. 다시 시도해주세요." }, { status: 409 });
  }

  const { data: urlData } = admin.storage.from(MEDIA_BUCKET).getPublicUrl(path);

  const asset = await prisma.mediaAsset.create({
    data: {
      workspaceId: membership.workspaceId,
      projectId,
      createdById: user.id,
      kind,
      path,
      url: urlData.publicUrl,
      mimeType: String(mimeType),
      size: Number(size),
      originalName: typeof originalName === "string" && originalName.trim() ? originalName.trim().slice(0, 200) : fileName,
      width: typeof width === "number" && Number.isFinite(width) ? Math.round(width) : null,
      height: typeof height === "number" && Number.isFinite(height) ? Math.round(height) : null,
      durationSec: typeof durationSec === "number" && Number.isFinite(durationSec) ? Math.round(durationSec) : null,
      // 그룹을 보던 중에 올렸으면 그 그룹으로 바로 들어간다 — 매번 업로드 뒤에 다시 묶지 않아도 된다.
      groupLabel: typeof groupLabel === "string" && groupLabel.trim() ? groupLabel.trim().slice(0, 80) : null,
    },
    include: {
      createdBy: { select: { name: true, email: true } },
      project: { select: { id: true, name: true } },
    },
  });

  await logActivity({
    workspaceId: membership.workspaceId,
    userId: user.id,
    action: "media.uploaded",
    meta: { assetId: asset.id, kind, originalName: asset.originalName, size: asset.size },
  });

  return NextResponse.json({ asset }, { status: 201 });
}
