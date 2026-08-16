import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

const IDENTITIES = ["device", "ip", "both", "registration"] as const;
const ORDERS = ["random", "manual", "submitted"] as const;

async function authorize(competitionId: string, roundId: string, userId: string) {
  const round = await prisma.competitionRound.findUnique({
    where: { id: roundId },
    include: { competition: { select: { id: true, workspaceId: true } } },
  });
  if (!round || round.competitionId !== competitionId) return null;
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: round.competition.workspaceId } },
  });
  return membership ? round : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; roundId: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id, roundId } = await params;
  const round = await authorize(id, roundId, user.id);
  if (!round) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const body = await request.json();
  const data: Record<string, unknown> = {};

  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.voteEnabled === "boolean") data.voteEnabled = body.voteEnabled;
  if (typeof body.allowVoteUndo === "boolean") data.allowVoteUndo = body.allowVoteUndo;
  if (typeof body.showLiveTally === "boolean") data.showLiveTally = body.showLiveTally;
  if (typeof body.carryOverEnabled === "boolean") data.carryOverEnabled = body.carryOverEnabled;

  if (typeof body.maxVotesPerVoter === "number" && body.maxVotesPerVoter >= 1) {
    data.maxVotesPerVoter = Math.floor(body.maxVotesPerVoter);
  }
  if (body.ipVoteLimit === null) data.ipVoteLimit = null;
  else if (typeof body.ipVoteLimit === "number" && body.ipVoteLimit >= 1) {
    data.ipVoteLimit = Math.floor(body.ipVoteLimit);
  }
  if (typeof body.advanceCount === "number" && body.advanceCount >= 1) data.advanceCount = Math.floor(body.advanceCount);
  else if (body.advanceCount === null) data.advanceCount = null;

  if (typeof body.carryOverPercent === "number" && body.carryOverPercent >= 0 && body.carryOverPercent <= 100) {
    data.carryOverPercent = Math.floor(body.carryOverPercent);
  }

  if (typeof body.voterIdentity === "string") {
    if (!(IDENTITIES as readonly string[]).includes(body.voterIdentity)) {
      return NextResponse.json({ error: "알 수 없는 식별 방식이에요" }, { status: 400 });
    }
    // registration 은 사전등록 시스템(별도 브랜치)의 등록번호 조회가 붙어야 동작한다.
    if (body.voterIdentity === "registration") {
      return NextResponse.json(
        { error: "사전등록 연동은 아직 준비 중이에요. 기기 또는 IP 방식을 사용해주세요." },
        { status: 400 },
      );
    }
    data.voterIdentity = body.voterIdentity;
  }

  if (typeof body.entryOrder === "string") {
    if (!(ORDERS as readonly string[]).includes(body.entryOrder)) {
      return NextResponse.json({ error: "알 수 없는 정렬 방식이에요" }, { status: 400 });
    }
    data.entryOrder = body.entryOrder;
  }

  // 투표 기간 — 순서를 본다. 마감이 시작보다 앞서면 영원히 닫힌 투표가 된다.
  const openAt = body.voteOpenAt === null ? null : body.voteOpenAt ? new Date(body.voteOpenAt) : undefined;
  const closeAt = body.voteCloseAt === null ? null : body.voteCloseAt ? new Date(body.voteCloseAt) : undefined;
  if (openAt !== undefined) {
    if (openAt && Number.isNaN(openAt.getTime())) return NextResponse.json({ error: "투표 시작 일시가 올바르지 않아요" }, { status: 400 });
    data.voteOpenAt = openAt;
  }
  if (closeAt !== undefined) {
    if (closeAt && Number.isNaN(closeAt.getTime())) return NextResponse.json({ error: "투표 마감 일시가 올바르지 않아요" }, { status: 400 });
    data.voteCloseAt = closeAt;
  }
  const finalOpen = (openAt !== undefined ? openAt : round.voteOpenAt) ?? null;
  const finalClose = (closeAt !== undefined ? closeAt : round.voteCloseAt) ?? null;
  if (finalOpen && finalClose && finalOpen.getTime() > finalClose.getTime()) {
    return NextResponse.json({ error: "투표 마감이 시작보다 빠를 수 없어요" }, { status: 400 });
  }

  if (Array.isArray(body.judgeCriteria)) {
    data.judgeCriteria = body.judgeCriteria;
  }
  if (typeof body.publicWeight === "number" && typeof body.judgeWeight === "number") {
    const pub = Math.max(0, Math.min(100, Math.floor(body.publicWeight)));
    const judge = Math.max(0, Math.min(100, Math.floor(body.judgeWeight)));
    if (pub + judge !== 100) {
      return NextResponse.json({ error: "대중·심사 비율의 합은 100이어야 해요" }, { status: 400 });
    }
    data.publicWeight = pub;
    data.judgeWeight = judge;
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ error: "변경할 내용이 없어요" }, { status: 400 });

  const updated = await prisma.competitionRound.update({ where: { id: roundId }, data });

  await logActivity({
    workspaceId: round.competition.workspaceId,
    userId: user.id,
    action: "competition.updated",
    meta: { competitionId: id, roundId, kind: round.kind },
  });

  return NextResponse.json({ round: updated });
}
