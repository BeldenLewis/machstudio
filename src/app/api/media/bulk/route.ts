/**
 * 여러 자산을 한 번에 — 지우거나 그룹에 담거나 프로젝트를 옮긴다.
 *
 * 세 동작을 한 라우트에 둔 이유: 전부 "선택한 것들에 같은 조작을 한다" 는 같은 모양이고,
 * 권한 판정의 첫 단계(이 워크스페이스 것만, id 목록으로 골라 온다)가 완전히 같다.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity";
import { MEDIA_BUCKET } from "@/lib/media-asset-bucket";

const MAX_IDS = 200;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const membership = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { action, ids, groupLabel, projectId } = body as {
    action?: unknown; ids?: unknown; groupLabel?: unknown; projectId?: unknown;
  };

  if (action !== "delete" && action !== "group" && action !== "move") {
    return NextResponse.json({ error: "알 수 없는 작업이에요." }, { status: 400 });
  }
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string")) {
    return NextResponse.json({ error: "선택한 항목이 없어요." }, { status: 400 });
  }
  if (ids.length > MAX_IDS) {
    return NextResponse.json({ error: `한 번에 ${MAX_IDS}개까지 처리할 수 있어요.` }, { status: 400 });
  }

  // **id 목록을 그대로 믿지 않는다** — 이 워크스페이스 소속인 것만 걸러 온다.
  const rows = await prisma.mediaAsset.findMany({
    where: { id: { in: ids }, workspaceId: membership.workspaceId },
    select: { id: true, path: true, createdById: true, originalName: true },
  });
  const foundIds = new Set(rows.map((r) => r.id));
  const notFound = ids.filter((id) => !foundIds.has(id));

  if (action === "group") {
    const label = typeof groupLabel === "string" && groupLabel.trim() ? groupLabel.trim().slice(0, 80) : null;
    /**
     * 그룹 담기는 관리자 전용이 아니다 — 파괴적이지 않고 자주 쓰는 정리 동작이라
     * 업로드와 같은 권한(워크스페이스 멤버 전체)으로 둔다.
     */
    await prisma.mediaAsset.updateMany({
      where: { id: { in: [...foundIds] } },
      data: { groupLabel: label },
    });
    await logActivity({
      workspaceId: membership.workspaceId, userId: user.id, action: "media.bulk_grouped",
      meta: { count: foundIds.size, groupLabel: label },
    });
    return NextResponse.json({ updated: foundIds.size, notFound });
  }

  if (action === "move") {
    /**
     * 그룹(자유 문자열)과 달리 projectId 는 실제 FK 다 — 값을 그대로 믿으면 남의
     * 워크스페이스 프로젝트에 내 자산을 붙일 수 있다. null(워크스페이스 공용)이
     * 아닌 한 이 워크스페이스 소속이고 삭제되지 않은 프로젝트인지 먼저 확인한다.
     */
    let targetProjectId: string | null = null;
    if (projectId !== null && projectId !== undefined) {
      if (typeof projectId !== "string" || !projectId) {
        return NextResponse.json({ error: "옮길 프로젝트를 골라주세요." }, { status: 400 });
      }
      const project = await prisma.project.findFirst({
        where: { id: projectId, workspaceId: membership.workspaceId, deletedAt: null },
        select: { id: true },
      });
      if (!project) return NextResponse.json({ error: "그 프로젝트를 찾을 수 없어요." }, { status: 400 });
      targetProjectId = project.id;
    }

    /**
     * 프로젝트 이동도 그룹 담기와 같은 권한(워크스페이스 멤버 전체)이다 — 파괴적이지
     * 않고, 되돌리려면 다시 이동하면 그만인 정리 동작이라 삭제와 다르게 본다.
     */
    await prisma.mediaAsset.updateMany({
      where: { id: { in: [...foundIds] } },
      data: { projectId: targetProjectId },
    });
    await logActivity({
      workspaceId: membership.workspaceId, userId: user.id, action: "media.bulk_moved",
      meta: { count: foundIds.size, projectId: targetProjectId },
    });
    return NextResponse.json({ updated: foundIds.size, notFound, projectId: targetProjectId });
  }

  // action === "delete" — 올린 사람 본인이거나 관리자인 것만 실제로 지운다.
  const canDelete = membership.role === "OWNER" || membership.role === "ADMIN";
  const deletable = rows.filter((r) => canDelete || r.createdById === user.id);
  const skipped = rows.filter((r) => !(canDelete || r.createdById === user.id)).map((r) => r.id);

  if (deletable.length > 0) {
    // DB 를 먼저 지운다 — 그 사이 스토리지 정리가 실패해도 목록에서는 이미 사라진다
    // (media/[id]/route.ts 와 같은 순서, 이유도 같다: 반대로 하면 "유령 행" 이 생긴다).
    await prisma.mediaAsset.deleteMany({ where: { id: { in: deletable.map((r) => r.id) } } });

    const admin = createAdminClient();
    const { error } = await admin.storage.from(MEDIA_BUCKET).remove(deletable.map((r) => r.path));
    if (error) console.error("[media] 일괄 삭제 — 스토리지 정리 실패, 고아 파일들:", deletable.map((r) => r.path), error);

    await logActivity({
      workspaceId: membership.workspaceId, userId: user.id, action: "media.bulk_deleted",
      meta: { count: deletable.length, skipped: skipped.length },
    });
  }

  return NextResponse.json({
    deletedIds: deletable.map((r) => r.id),
    skippedIds: skipped,
    notFound,
  });
}
