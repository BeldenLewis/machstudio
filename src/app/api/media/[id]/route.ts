import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity";
import { MEDIA_BUCKET } from "@/lib/media-asset-bucket";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;

  const membership = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const asset = await prisma.mediaAsset.findFirst({ where: { id, workspaceId: membership.workspaceId } });
  if (!asset) return NextResponse.json({ error: "찾을 수 없어요" }, { status: 404 });

  // 올린 사람 본인이거나 관리자만 — 삭제는 저빈도·고위험 액션이라 자기 것 밖으로 넓히지 않는다.
  const canDelete = asset.createdById === user.id || membership.role === "OWNER" || membership.role === "ADMIN";
  if (!canDelete) return NextResponse.json({ error: "올린 사람만 지울 수 있어요." }, { status: 403 });

  // **DB 행을 먼저 지운다.** 순서를 반대로 하면(스토리지 먼저) 그 사이 오류가 나면
  // 목록에는 남아 있는데 눌러 보면 깨진 파일인 "유령 행" 이 생긴다. 지금 순서면 최악의
  // 실패도 스토리지에 고아 파일이 남는 것뿐 — 목록에는 안 보이고, 다시 지울 수도 없지만
  // 화면에서는 조용히 사라진 것과 같다(용량만 조금 남는다).
  await prisma.mediaAsset.delete({ where: { id: asset.id } });

  const admin = createAdminClient();
  const { error } = await admin.storage.from(MEDIA_BUCKET).remove([asset.path]);
  if (error) console.error("[media] 스토리지 정리 실패 — 고아 파일:", asset.path, error);

  await logActivity({
    workspaceId: membership.workspaceId,
    userId: user.id,
    action: "media.deleted",
    meta: { assetId: asset.id, originalName: asset.originalName, kind: asset.kind },
  });

  return NextResponse.json({ ok: true });
}
