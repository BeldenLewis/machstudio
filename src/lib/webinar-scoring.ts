/**
 * 웨비나 리드 참여 스코어링.
 * 참석·유효 체류·인터랙션(채팅/투표/Q&A질문/Q&A추천)·마케팅 동의를 0~100 점수로 합성하고
 * hot/warm/cold 세그먼트로 나눈다. 모든 인터랙션은 registrationId 로 등록자에 연결된다.
 *
 * 유효 체류(watchMinutes)는 방송 경과 시간으로 상한을 둔다 — 며칠째 방치된 라이브 세션의
 * 체류 폭주(핑이 여러 날 이어지는 케이스)를 흡수. dashboard/analytics 의 평균 시청과 동일 규칙.
 */
import { prisma } from "@/lib/prisma";

export type Segment = "hot" | "warm" | "cold";

export interface EngagementInput {
  entered: boolean;
  watchMinutes: number;
  liveMinutes: number;
  chat: number;
  pollVotes: number;
  qaAsks: number;
  qaUpvotes: number;
  ctaClicks: number;
  agreeMarketing: boolean;
}

export interface ScoredRow {
  registrationId: string;
  name: string;
  company: string | null;
  entered: boolean;
  watchMinutes: number;
  chat: number;
  pollVotes: number;
  qaAsks: number;
  qaUpvotes: number;
  ctaClicks: number;
  agreeMarketing: boolean;
  score: number;
  segment: Segment;
}

/**
 * 참여 점수(0~100): 참석 25 + 체류 35(방송 대비 비율) + 인터랙션 30 + 인텐트(마케팅 동의) 10.
 * 노쇼는 cold — 단, 마케팅 동의 시 리타겟 가능한 리드로 소량(5) 가점.
 */
export function scoreRegistrant(i: EngagementInput): { score: number; segment: Segment } {
  if (!i.entered) {
    return { score: i.agreeMarketing ? 5 : 0, segment: "cold" };
  }
  const attend = 25;
  const ratio = i.liveMinutes > 0 ? Math.min(1, i.watchMinutes / i.liveMinutes) : 0;
  const watch = Math.round(ratio * 35);
  const interactRaw = i.chat * 3 + i.pollVotes * 4 + i.qaAsks * 6 + i.qaUpvotes * 2 + i.ctaClicks * 4;
  const interact = Math.min(30, interactRaw);
  const intent = i.agreeMarketing ? 10 : 0;
  const score = Math.min(100, attend + watch + interact + intent);
  const segment: Segment = score >= 60 ? "hot" : score >= 30 ? "warm" : "cold";
  return { score, segment };
}

export const SEGMENT_LABEL: Record<Segment | "noShow", string> = {
  hot: "핫",
  warm: "웜",
  cold: "콜드",
  noShow: "노쇼",
};

function countMap(rows: { registrationId: string | null; _count: { _all: number } }[]) {
  const m = new Map<string, number>();
  for (const r of rows) if (r.registrationId) m.set(r.registrationId, r._count._all);
  return m;
}

/**
 * 웨비나의 모든 등록자에 대해 참여 입력값을 조립하고 점수를 매긴다.
 * 인터랙션 카운트는 테이블별 groupBy(registrationId) 로 한 번에 모아 JS 에서 병합(N+1 회피).
 */
export async function assembleWebinarEngagement(
  webinarId: string,
  live: { liveStartAt: Date; liveEndAt: Date },
): Promise<{ liveMinutes: number; capMinutes: number; rows: ScoredRow[] }> {
  const now = Date.now();
  const liveMinutes = Math.max(1, Math.floor((live.liveEndAt.getTime() - live.liveStartAt.getTime()) / 60000));
  const capMinutes = Math.max(0, Math.floor((Math.min(now, live.liveEndAt.getTime()) - live.liveStartAt.getTime()) / 60000));

  const [regs, chatG, pollG, qaAskG, qaVoteG, ctaG, segG] = await Promise.all([
    prisma.webinarRegistration.findMany({
      where: { webinarId },
      select: { id: true, name: true, company: true, enteredAt: true, stayMinutes: true, lastPingAt: true, agreeMarketing: true },
    }),
    prisma.webinarChatMessage.groupBy({ by: ["registrationId"], where: { webinarId, isHost: false, registrationId: { not: null } }, _count: { _all: true } }),
    prisma.webinarPollVote.groupBy({ by: ["registrationId"], where: { registrationId: { not: null }, poll: { webinarId } }, _count: { _all: true } }),
    prisma.webinarQA.groupBy({ by: ["registrationId"], where: { webinarId, registrationId: { not: null } }, _count: { _all: true } }),
    prisma.webinarQAVote.groupBy({ by: ["registrationId"], where: { registrationId: { not: null }, qa: { webinarId } }, _count: { _all: true } }),
    prisma.webinarPopupClick.groupBy({ by: ["registrationId"], where: { webinarId, registrationId: { not: null } }, _count: { _all: true } }),
    // 실제 시청 구간 합 — "입장~마지막활동" 스팬은 중간 이탈(자리비움)까지 시청으로 세어 과대집계된다.
    prisma.$queryRaw<{ registrationId: string; minutes: number }[]>`
      SELECT "registrationId",
             FLOOR(SUM(EXTRACT(EPOCH FROM ("endedAt" - "startedAt"))) / 60)::int AS "minutes"
        FROM "WebinarAttendanceSegment"
       WHERE "webinarId" = ${webinarId}
       GROUP BY "registrationId"
    `,
  ]);

  const chatMap = countMap(chatG);
  const pollMap = countMap(pollG);
  const qaAskMap = countMap(qaAskG);
  const qaVoteMap = countMap(qaVoteG);
  const ctaMap = countMap(ctaG);

  const segMap = new Map<string, number>();
  for (const s of segG) segMap.set(s.registrationId, Number(s.minutes) || 0);

  const rows: ScoredRow[] = regs.map((r) => {
    const entered = !!r.enteredAt;
    // 우선순위: 실제 시청 구간 합 → (구간 기록이 없는 과거 데이터만) 입장~마지막활동 스팬.
    const segMinutes = segMap.get(r.id);
    const effRaw = !entered
      ? 0
      : segMinutes !== undefined
        ? segMinutes
        : Math.max(r.stayMinutes ?? 0, Math.floor(((r.lastPingAt?.getTime() ?? now) - (r.enteredAt as Date).getTime()) / 60000));
    const watchMinutes = Math.min(capMinutes, Math.max(0, effRaw));
    const chat = chatMap.get(r.id) ?? 0;
    const pollVotes = pollMap.get(r.id) ?? 0;
    const qaAsks = qaAskMap.get(r.id) ?? 0;
    const qaUpvotes = qaVoteMap.get(r.id) ?? 0;
    const ctaClicks = ctaMap.get(r.id) ?? 0;
    const { score, segment } = scoreRegistrant({ entered, watchMinutes, liveMinutes, chat, pollVotes, qaAsks, qaUpvotes, ctaClicks, agreeMarketing: r.agreeMarketing });
    return {
      registrationId: r.id,
      name: r.name,
      company: r.company,
      entered,
      watchMinutes,
      chat,
      pollVotes,
      qaAsks,
      qaUpvotes,
      ctaClicks,
      agreeMarketing: r.agreeMarketing,
      score,
      segment,
    };
  });

  return { liveMinutes, capMinutes, rows };
}
