/**
 * 본선 진행 순서.
 *
 * 예선 접수 순번(참가번호)은 본선에서 의미가 없다 — 본선은 무대 진행 순서라 운영자가 다시 짠다.
 * 그래서 sortOrder 를 고치지 않고 별도 컬럼(finalOrder)에 담는다. 예선 기록을 건드리면 안 된다.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

async function authorize(competitionId: string, userId: string) {
  const competition = await prisma.competition.findUnique({ where: { id: competitionId } });
  if (!competition) return null;
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: competition.workspaceId } },
  });
  return membership ? competition : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  if (!(await authorize(id, user.id))) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const entries = await prisma.competitionEntry.findMany({
    where: { competitionId: id, advanced: true },
    orderBy: [{ finalOrder: "asc" }, { entryNo: "asc" }],
    select: { id: true, entryNo: true, title: true, teamName: true, finalOrder: true },
  });

  return NextResponse.json({ entries });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const competition = await authorize(id, user.id);
  if (!competition) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const order: unknown = body.order;
  if (!Array.isArray(order) || order.some((v) => typeof v !== "string")) {
    return NextResponse.json({ error: "순서가 올바르지 않아요." }, { status: 400 });
  }

  // 보내온 id 가 실제 진출자인지 확인한다 — 남의 대회 참가작 id 를 섞어 보내면 안 된다.
  const advanced = await prisma.competitionEntry.findMany({
    where: { competitionId: id, advanced: true },
    select: { id: true },
  });
  const allowed = new Set(advanced.map((e) => e.id));
  const ids = (order as string[]).filter((entryId) => allowed.has(entryId));
  if (ids.length !== advanced.length) {
    return NextResponse.json({ error: "진출자 목록이 바뀌었어요. 새로고침 후 다시 시도해주세요." }, { status: 409 });
  }

  // 한 번에 다시 매긴다 — 일부만 반영되면 두 참가작이 같은 순번을 갖는다.
  await prisma.$transaction(
    ids.map((entryId, index) =>
      prisma.competitionEntry.update({ where: { id: entryId }, data: { finalOrder: index + 1 } }),
    ),
  );

  await logActivity({
    workspaceId: competition.workspaceId,
    userId: user.id,
    action: "competition.final_order_updated",
    meta: { competitionId: id, count: ids.length },
  });

  const entries = await prisma.competitionEntry.findMany({
    where: { competitionId: id, advanced: true },
    orderBy: [{ finalOrder: "asc" }, { entryNo: "asc" }],
    select: { id: true, entryNo: true, title: true, teamName: true, finalOrder: true },
  });

  return NextResponse.json({ entries });
}
