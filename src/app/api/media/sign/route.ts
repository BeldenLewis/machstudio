/**
 * 업로드 자리를 내준다 — **바이트는 받지 않는다.**
 *
 * 브라우저가 이 응답의 서명 URL로 Supabase Storage 에 직접 올린다. 우리 서버(Vercel 서버리스
 * 함수)를 거치면 요청 본문이 4.5MB 를 넘는 순간 우리 코드가 보기도 전에 413 으로 끊긴다
 * (webinar-landing-media 가 이 함정에 빠져 있다 — 50MB 동영상을 그 경로로 받는다고 적혀
 * 있지만 실제로는 안 된다). 그래서 여기서는 mimeType·size 만 재고 자리만 내준다.
 */
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { extensionForMimeType, validateMediaUpload } from "@/lib/media-asset";
import { ensureMediaBucket, MEDIA_BUCKET } from "@/lib/media-asset-bucket";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const membership = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
  if (!membership) return NextResponse.json({ error: "워크스페이스가 없어요" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { mimeType, size, projectId } = body as {
    mimeType?: unknown; size?: unknown; projectId?: unknown;
  };

  const validationError = validateMediaUpload({ mimeType, size });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const extension = extensionForMimeType(String(mimeType));
  if (!extension) return NextResponse.json({ error: "지원하지 않는 형식이에요." }, { status: 400 });

  // 프로젝트를 지정했으면 이 워크스페이스 것인지 확인한다 — 남의 프로젝트에 자산을 걸 수 없다.
  let scopedProjectId: string | null = null;
  if (typeof projectId === "string" && projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId: membership.workspaceId, deletedAt: null },
      select: { id: true },
    });
    if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
    scopedProjectId = project.id;
  }

  try {
    const admin = await ensureMediaBucket();
    const path = `${membership.workspaceId}/${scopedProjectId ?? "workspace"}/${randomUUID()}.${extension}`;

    const { data, error } = await admin.storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw error ?? new Error("no data");

    return NextResponse.json({
      path: data.path,
      token: data.token,
      bucket: MEDIA_BUCKET,
      projectId: scopedProjectId,
    });
  } catch (error) {
    console.error("[media] 서명 URL 발급 실패", error);
    return NextResponse.json({ error: "업로드 준비에 실패했어요. 잠시 후 다시 시도해주세요." }, { status: 500 });
  }
}
