/**
 * 심사 점수 저장·제출.
 *
 * 임시저장(submitted=false)은 채점 도중 자동으로 계속 들어온다. 제출(submitted=true)하면
 * 잠기고, 그때부터는 운영자가 풀어 주기 전까지 못 고친다.
 *
 * 점수 합(total)은 **서버가 계산해 저장한다** — 클라이언트가 보낸 합계를 믿으면 순위가 조작된다.
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientIp, rateLimit } from "@/lib/ratelimit";
import { judgeCookieName, verifyJudgeSession } from "@/lib/competition-judge-session";
import { judgeScoreTotal, normalizeCriteria } from "@/lib/competition-scoring";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const ip = getClientIp(request);
  const limited = rateLimit(`judge-score:${token}:${ip}`, { limit: 120, windowMs: 60_000 });
  if (!limited.allowed) {
    return NextResponse.json({ error: "요청이 너무 잦아요." }, { status: 429 });
  }

  const judge = await prisma.competitionJudge.findUnique({ where: { accessToken: token } });
  if (!judge) return NextResponse.json({ error: "심사 링크를 찾을 수 없어요." }, { status: 404 });

  const store = await cookies();
  if (!verifyJudgeSession(store.get(judgeCookieName(token))?.value, token, judge.passwordHash)) {
    return NextResponse.json({ error: "인증이 만료됐어요. 비밀번호를 다시 입력해주세요." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const entryId = typeof body.entryId === "string" ? body.entryId : "";
  const roundId = typeof body.roundId === "string" ? body.roundId : "";
  if (!entryId || !roundId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const round = await prisma.competitionRound.findUnique({ where: { id: roundId } });
  if (!round || round.competitionId !== judge.competitionId) {
    return NextResponse.json({ error: "라운드를 찾을 수 없어요." }, { status: 404 });
  }

  // 심사 대상인지 확인 — 노출되지 않은/반려된 참가작에는 점수를 남길 수 없다.
  const entry = await prisma.competitionEntry.findFirst({
    where: {
      id: entryId,
      competitionId: judge.competitionId,
      isPublished: true,
      status: { not: "rejected" },
      ...(round.kind === "final" ? { advanced: true } : {}),
    },
    select: { id: true },
  });
  if (!entry) return NextResponse.json({ error: "심사 대상이 아니에요." }, { status: 400 });

  const existing = await prisma.competitionJudgeScore.findUnique({
    where: { roundId_entryId_judgeId: { roundId, entryId, judgeId: judge.id } },
  });
  if (existing?.submitted) {
    return NextResponse.json({ error: "이미 제출한 심사예요. 수정하려면 운영자에게 요청해주세요." }, { status: 409 });
  }

  const criteria = normalizeCriteria(round.judgeCriteria);
  const rawScores = (body.scores && typeof body.scores === "object" ? body.scores : {}) as Record<string, unknown>;

  // 정의된 항목만 저장한다(임의 키 주입 차단) + 범위를 벗어난 값은 잘라낸다.
  const scores: Record<string, number> = {};
  for (const criterion of criteria) {
    const value = Number(rawScores[criterion.key]);
    if (!Number.isFinite(value)) continue;
    scores[criterion.key] = Math.max(0, Math.min(criterion.maxScore, Math.round(value)));
  }

  const submitted = body.submitted === true;
  if (submitted && Object.keys(scores).length < criteria.length) {
    return NextResponse.json({ error: "모든 항목에 점수를 입력해주세요." }, { status: 400 });
  }

  const total = judgeScoreTotal(scores, criteria);
  const comment = typeof body.comment === "string" ? body.comment.slice(0, 2000) : null;

  const saved = await prisma.competitionJudgeScore.upsert({
    where: { roundId_entryId_judgeId: { roundId, entryId, judgeId: judge.id } },
    create: { roundId, entryId, judgeId: judge.id, scores, total, comment, submitted },
    update: { scores, total, comment, submitted },
  });

  return NextResponse.json({ ok: true, total: saved.total, submitted: saved.submitted });
}
