/**
 * 종합 점수(대중 + 심사) 조회와 본선 진출 확정.
 *
 * GET  : 계산 근거를 포함한 순위 — 표 수·심사 평균·정규화 값·가중 후 점수
 * POST : 상위 n팀을 진출 확정하고 **스냅샷을 남긴다**. 확정 뒤 표가 더 들어와도
 *        "그때 무엇을 보고 정했는지"는 흔들리지 않아야 한다.
 */
import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import {
  combineScores,
  criteriaMaxTotal,
  normalizeCriteria,
  type AdvanceSnapshot,
} from "@/lib/competition-scoring";

async function loadContext(competitionId: string, userId: string, roundKind: string) {
  const competition = await prisma.competition.findUnique({ where: { id: competitionId } });
  if (!competition) return { error: "대회 없음", status: 404 } as const;

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: competition.workspaceId } },
  });
  if (!membership) return { error: "접근 권한 없음", status: 403 } as const;

  const kind = roundKind === "final" ? "final" : "prelim";
  const round = await prisma.competitionRound.findUnique({
    where: { competitionId_kind: { competitionId, kind } },
  });
  if (!round) return { error: "라운드 없음", status: 404 } as const;

  return { competition, round };
}

async function computeRows(competitionId: string, round: { id: string; kind: string; judgeCriteria: unknown; publicWeight: number; judgeWeight: number }) {
  const entries = await prisma.competitionEntry.findMany({
    where: {
      competitionId,
      isPublished: true,
      status: { not: "rejected" },
      ...(round.kind === "final" ? { advanced: true } : {}),
    },
    select: { id: true, entryNo: true, title: true, teamName: true },
  });

  const [voteGroups, judgeScores, judges] = await Promise.all([
    prisma.competitionVote.groupBy({ by: ["entryId"], where: { roundId: round.id }, _count: { _all: true } }),
    prisma.competitionJudgeScore.findMany({
      where: { roundId: round.id },
      select: { entryId: true, judgeId: true, total: true, submitted: true },
    }),
    prisma.competitionJudge.findMany({ where: { competitionId, roundKind: round.kind }, select: { id: true, weight: true } }),
  ]);

  const criteria = normalizeCriteria(round.judgeCriteria);
  const rows = combineScores({
    entries,
    voteCounts: new Map(voteGroups.map((g) => [g.entryId, g._count._all])),
    judgeScores,
    judgeWeights: new Map(judges.map((j) => [j.id, j.weight])),
    criteriaMax: criteriaMaxTotal(criteria),
    publicWeight: round.publicWeight,
    judgeWeight: round.judgeWeight,
    // 예선은 먼저 신청한 팀, 본선은 관람객 점수가 높은 팀이 앞선다(확정 규칙).
    tieBreak: round.kind === "final" ? "public" : "entryNo",
  });

  return { rows, criteria, judgeCount: judges.length };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const kind = new URL(request.url).searchParams.get("round") ?? "prelim";
  const ctx = await loadContext(id, user.id, kind);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { competition, round } = ctx;
  const { rows, criteria, judgeCount } = await computeRows(id, round);

  // 제출 완료한 심사위원 수 — 아직 안 낸 사람이 있으면 순위가 바뀔 수 있다는 걸 알려야 한다.
  const submittedJudges = await prisma.competitionJudgeScore.findMany({
    where: { roundId: round.id, submitted: true },
    select: { judgeId: true },
    distinct: ["judgeId"],
  });

  const snapshot = (competition.scoringConfig as { advanceSnapshot?: AdvanceSnapshot } | null)?.advanceSnapshot ?? null;

  return NextResponse.json({
    round: {
      kind: round.kind, name: round.name,
      publicWeight: round.publicWeight, judgeWeight: round.judgeWeight,
      advanceCount: round.advanceCount,
    },
    criteria,
    criteriaMax: criteriaMaxTotal(criteria),
    judgeCount,
    submittedJudgeCount: submittedJudges.length,
    rows,
    snapshot,
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const ctx = await loadContext(id, user.id, String(body.round ?? "prelim"));
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { competition, round } = ctx;
  const advanceCount = typeof body.advanceCount === "number" && body.advanceCount >= 1
    ? Math.floor(body.advanceCount)
    : round.advanceCount;

  if (!advanceCount) {
    return NextResponse.json({ error: "본선 진출 팀 수를 정해주세요." }, { status: 400 });
  }

  const { rows } = await computeRows(id, round);
  if (rows.length === 0) return NextResponse.json({ error: "집계할 참가작이 없어요." }, { status: 400 });

  const advancing = rows.slice(0, advanceCount).map((r) => r.entryId);

  // 진출 확정은 전부 아니면 전무여야 한다 — 일부만 반영되면 명단이 뒤섞인다.
  await prisma.$transaction([
    prisma.competitionEntry.updateMany({ where: { competitionId: id }, data: { advanced: false } }),
    prisma.competitionEntry.updateMany({ where: { id: { in: advancing } }, data: { advanced: true } }),
    prisma.competitionRound.update({ where: { id: round.id }, data: { advanceCount } }),
    prisma.competition.update({
      where: { id },
      data: {
        scoringConfig: {
          ...((competition.scoringConfig as Record<string, unknown> | null) ?? {}),
          advanceSnapshot: {
            decidedAt: new Date().toISOString(),
            roundKind: round.kind,
            advanceCount,
            publicWeight: round.publicWeight,
            judgeWeight: round.judgeWeight,
            rows,
          } satisfies AdvanceSnapshot,
        } as unknown as Prisma.InputJsonValue,
      },
    }),
  ]);

  await logActivity({
    workspaceId: competition.workspaceId,
    userId: user.id,
    action: "competition.advanced",
    meta: { competitionId: id, roundKind: round.kind, advanceCount, entryIds: advancing },
  });

  return NextResponse.json({ ok: true, advanced: advancing.length, rows });
}
