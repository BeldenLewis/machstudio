/**
 * 집계 — 운영자용. 계산 근거(표 수·비중)를 함께 내려준다.
 * 숫자만 보여주면 아무도 못 믿는다는 게 설계 문서의 판단이다.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { buildTally } from "@/lib/competition-vote";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const competition = await prisma.competition.findUnique({ where: { id } });
  if (!competition) return NextResponse.json({ error: "대회 없음" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: competition.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const kind = new URL(request.url).searchParams.get("round") === "final" ? "final" : "prelim";
  const round = await prisma.competitionRound.findUnique({
    where: { competitionId_kind: { competitionId: id, kind } },
  });
  if (!round) return NextResponse.json({ error: "라운드 없음" }, { status: 404 });

  const entries = await prisma.competitionEntry.findMany({
    where: {
      competitionId: id,
      isPublished: true,
      status: { not: "rejected" },
      ...(kind === "final" ? { advanced: true } : {}),
    },
    select: { id: true, entryNo: true, title: true, teamName: true },
  });

  const grouped = await prisma.competitionVote.groupBy({
    by: ["entryId"],
    where: { roundId: round.id },
    _count: { _all: true },
  });
  const counts = new Map(grouped.map((g) => [g.entryId, g._count._all]));

  const { rows, totalVotes } = buildTally(entries, counts);

  // 서로 다른 사람이 몇 명 투표했는지 — 표 수와 함께 봐야 참여 규모가 읽힌다.
  const voters = await prisma.competitionVote.findMany({
    where: { roundId: round.id },
    select: { voterKey: true },
    distinct: ["voterKey"],
  });

  return NextResponse.json({
    round: { kind: round.kind, name: round.name, maxVotesPerVoter: round.maxVotesPerVoter, advanceCount: round.advanceCount },
    rows,
    totalVotes,
    voterCount: voters.length,
  });
}
