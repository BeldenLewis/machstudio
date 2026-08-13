import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

const ENTRY_STATUSES = ["submitted", "approved", "rejected"] as const;

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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id, entryId } = await params;
  const entry = await authorize(id, entryId, user.id);
  if (!entry) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const body = await request.json();
  const data: Record<string, unknown> = {};

  if (typeof body.isPublished === "boolean") data.isPublished = body.isPublished;
  if (typeof body.advanced === "boolean") data.advanced = body.advanced;
  if (typeof body.sortOrder === "number") data.sortOrder = Math.floor(body.sortOrder);
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (body.teamName !== undefined) data.teamName = typeof body.teamName === "string" && body.teamName.trim() ? body.teamName.trim() : null;
  if (body.summary !== undefined) data.summary = typeof body.summary === "string" && body.summary.trim() ? body.summary.trim() : null;
  if (typeof body.status === "string") {
    if (!(ENTRY_STATUSES as readonly string[]).includes(body.status)) {
      return NextResponse.json({ error: "알 수 없는 상태예요" }, { status: 400 });
    }
    data.status = body.status;
    // 반려는 노출에서도 빼는 게 자연스럽다 — 반려된 작품이 투표 목록에 남으면 사고다.
    if (body.status === "rejected") data.isPublished = false;
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ error: "변경할 내용이 없어요" }, { status: 400 });

  const updated = await prisma.competitionEntry.update({ where: { id: entryId }, data });

  await logActivity({
    workspaceId: entry.competition.workspaceId,
    userId: user.id,
    action: "competition.entry_updated",
    meta: { competitionId: id, entryId, entryNo: updated.entryNo },
  });

  return NextResponse.json({ entry: updated });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id, entryId } = await params;
  const entry = await authorize(id, entryId, user.id);
  if (!entry) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  await prisma.competitionEntry.delete({ where: { id: entryId } });

  await logActivity({
    workspaceId: entry.competition.workspaceId,
    userId: user.id,
    action: "competition.entry_deleted",
    meta: { competitionId: id, entryId, entryNo: entry.entryNo },
  });

  return NextResponse.json({ ok: true });
}
