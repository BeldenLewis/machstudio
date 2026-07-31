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
  // hot 경계 65 — 참석25+시청35=60 이라, 60이면 "창만 끝까지 띄운 무반응 시청자"가 hot 이 된다.
  // 65는 풀시청이어도 최소 행동 하나(투표4·질문6…) 또는 마케팅 동의(10)를 요구한다.
  const segment: Segment = score >= 65 ? "hot" : score >= 30 ? "warm" : "cold";
  return { score, segment };
}

export const SEGMENT_LABEL: Record<Segment | "noShow", string> = {
  hot: "핫",
  warm: "웜",
  cold: "콜드",
  noShow: "노쇼",
};

// dashboard/route.ts 의 체류 상한 SQL(LEAST(..., capMinutes::int))에도 그대로 넘어가는 값이라
// int4 범위(2,147,483,647)를 넘으면 쿼리가 죽는다. 실제 체류분(수 시간~수일)보다 압도적으로
// 크면서 안전한 "무제한" 값으로 100년치 분을 쓴다.
export const UNCAPPED_WATCH_MINUTES = 100 * 365 * 24 * 60;

/**
 * 체류 상한(분) = min(now, liveEndAt) − 하한, 0 이상.
 * 하한은 "예정 liveStartAt" 이 아니라 실제 관측이 시작된 시각(earliestObservedAt, 예: 가장 이른
 * enteredAt)과 liveStartAt 중 이른 쪽이다 — statusOverride="live" 로 예정 시각 **전에** 강제
 * 라이브 전환하면 실제 접속이 liveStartAt 보다 먼저 시작되는데, 하한을 liveStartAt 에 고정하면
 * 상한 구간이 음수가 되어(0 으로 클램프) 실제로 접속한 시청자의 watchMinutes 가 전부 0 으로
 * 잘린다. dashboard/route.ts 의 체류 통계 SQL(LEAST(eff, capMinutes) 패턴)도 같은 규칙을 쓴다.
 *
 * now < liveStartAt(아직 예정 시각도 안 됐는데 라이브로 강제된 경우)는 상한 계산 자체가 아직
 * 의미가 없으므로 캡을 적용하지 않고 원값(연결 시간)을 그대로 쓰게 UNCAPPED 를 반환한다.
 */
export function resolveWatchCapMinutes(
  now: number,
  liveStartAt: number,
  liveEndAt: number,
  earliestObservedAt: number | null,
): number {
  if (now < liveStartAt) return UNCAPPED_WATCH_MINUTES;
  const lowerBound = earliestObservedAt !== null ? Math.min(earliestObservedAt, liveStartAt) : liveStartAt;
  return Math.max(0, Math.floor((Math.min(now, liveEndAt) - lowerBound) / 60000));
}

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

  const [regs, chatG, pollG, qaAskG, qaVoteG, ctaG] = await Promise.all([
    prisma.webinarRegistration.findMany({
      where: { webinarId },
      select: { id: true, name: true, company: true, enteredAt: true, connectedSeconds: true, focusSeconds: true, stayMinutes: true, lastPingAt: true, agreeMarketing: true },
    }),
    prisma.webinarChatMessage.groupBy({ by: ["registrationId"], where: { webinarId, isHost: false, registrationId: { not: null } }, _count: { _all: true } }),
    prisma.webinarPollVote.groupBy({ by: ["registrationId"], where: { registrationId: { not: null }, poll: { webinarId } }, _count: { _all: true } }),
    prisma.webinarQA.groupBy({ by: ["registrationId"], where: { webinarId, registrationId: { not: null } }, _count: { _all: true } }),
    prisma.webinarQAVote.groupBy({ by: ["registrationId"], where: { registrationId: { not: null }, qa: { webinarId } }, _count: { _all: true } }),
    // CTA 는 팝업당 1회만 인정 — 투표(1인 1표)·추천(질문당 1회)과 달리 클릭엔 unique 제약이
    // 없어, 같은 버튼 연타(안 열리는 줄 알고 8번)만으로 인터랙션 캡을 채우는 걸 막는다.
    // 원본 클릭 기록은 그대로 두고(클릭률 분석용) 점수 집계만 dedupe 한다.
    prisma.$queryRaw<{ registrationId: string; cnt: number }[]>`
      SELECT "registrationId", COUNT(DISTINCT COALESCE("popupId", '') || ':' || "kind")::int AS "cnt"
        FROM "WebinarPopupClick"
       WHERE "webinarId" = ${webinarId} AND "registrationId" IS NOT NULL
       GROUP BY "registrationId"
    `,
  ]);

  const chatMap = countMap(chatG);
  const pollMap = countMap(pollG);
  const qaAskMap = countMap(qaAskG);
  const qaVoteMap = countMap(qaVoteG);
  const ctaMap = new Map<string, number>();
  for (const r of ctaG) ctaMap.set(r.registrationId, Number(r.cnt) || 0);

  const earliestObservedAt = regs.reduce<number | null>((min, r) => {
    if (!r.enteredAt) return min;
    const t = r.enteredAt.getTime();
    return min === null || t < min ? t : min;
  }, null);
  const capMinutes = resolveWatchCapMinutes(now, live.liveStartAt.getTime(), live.liveEndAt.getTime(), earliestObservedAt);

  const rows: ScoredRow[] = regs.map((r) => {
    const entered = !!r.enteredAt;
    // 접속 시간(connectedSeconds)이 단일 소스 — ping 간격 누적이라 구간 겹침으로 이중계산되지 않는다.
    // 0 인데 입장 기록은 있는 건 이 컬럼 도입 전 데이터 → 옛 스팬으로만 폴백한다.
    const connectedMin = Math.floor((r.connectedSeconds ?? 0) / 60);
    const effRaw = !entered
      ? 0
      : connectedMin > 0
        ? connectedMin
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
