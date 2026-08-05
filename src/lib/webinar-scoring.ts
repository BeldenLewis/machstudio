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
  /** 공유 버튼을 누른 횟수(WebinarShareEvent) */
  shares: number;
  /** 이 사람의 추천 링크로 실제 등록한 사람 수 */
  referrals: number;
}

/**
 * 점수를 만든 네 덩어리 — 화면이 "왜 이 점수인지" 를 그대로 보여줄 수 있게 함께 돌려준다.
 * 이게 없던 동안 운영자는 47점이라는 숫자만 보고 근거를 CSV 와 대조해야 했다.
 */
export interface ScoreBreakdown {
  /** 참석 25(입장했으면 고정) */
  attend: number;
  /** 체류 0~35 — 실제 방송 경과 시간 대비 비율 */
  watch: number;
  /** 인터랙션 0~30 (캡) */
  interact: number;
  /** 캡 이전 원점수 — 화면이 "30 (원점수 42)" 로 보여준다 */
  interactRaw: number;
  /** 인텐트 0 또는 10 (마케팅 동의) */
  intent: number;
  /** 분모로 쓴 방송 경과 분 — 체류 점수를 검산할 수 있게 */
  evaluatedMinutes: number;
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
  /** 공유 버튼을 누른 횟수 */
  shares: number;
  /** 이 사람의 추천 링크로 등록한 사람 수 */
  referrals: number;
  score: number;
  segment: Segment;
  breakdown: ScoreBreakdown;
}

/**
 * 참여 점수(0~100): 참석 25 + 체류 35(방송 경과 대비 비율) + 인터랙션 30 + 인텐트(마케팅 동의) 10.
 * 노쇼는 cold — 단, 마케팅 동의 시 리타겟 가능한 리드로 소량(5) 가점.
 *
 * `liveMinutes` 는 **예정 길이가 아니라 실제 방송 경과 분**이어야 한다(resolveEvaluationMinutes).
 * 예정 길이를 넘기면 방송 중·조기 종료에서 전원이 저평가된다 — 그 함수의 주석에 실측이 있다.
 */
export function scoreRegistrant(i: EngagementInput): { score: number; segment: Segment; breakdown: ScoreBreakdown } {
  /* 공유·추천도 행동이다. 무게는 "얼마나 드문 행동인가" 순 —
     추천 성공(내 링크로 남이 실제 등록) 8 > 질문 6 > 공유 5 > 투표·CTA 4 > 채팅 3 > 추천 2.
     남을 데려오는 건 이 웨비나에서 가장 드물고 가장 강한 관심 신호다. */
  const interactRaw =
    i.chat * 3 + i.pollVotes * 4 + i.qaAsks * 6 + i.qaUpvotes * 2 + i.ctaClicks * 4 + i.shares * 5 + i.referrals * 8;
  if (!i.entered) {
    /* 노쇼여도 입소문은 인정한다 — 남을 데려온 사람은 못 왔을 뿐 관심이 있는 리드다.
       다만 참석자보다 위로 갈 수는 없게 25 로 묶는다(동의 5 를 더해도 웜 경계 30 이 상한). */
    const intent = i.agreeMarketing ? 5 : 0;
    const wordOfMouth = Math.min(25, i.shares * 5 + i.referrals * 8);
    const score = intent + wordOfMouth;
    return {
      score,
      segment: score >= 30 ? "warm" : "cold",
      breakdown: { attend: 0, watch: 0, interact: wordOfMouth, interactRaw, intent, evaluatedMinutes: i.liveMinutes },
    };
  }
  const attend = 25;
  const ratio = i.liveMinutes > 0 ? Math.min(1, i.watchMinutes / i.liveMinutes) : 0;
  const watch = Math.round(ratio * 35);
  const interact = Math.min(30, interactRaw);
  const intent = i.agreeMarketing ? 10 : 0;
  const score = Math.min(100, attend + watch + interact + intent);
  // hot 경계 65 — 참석25+시청35=60 이라, 60이면 "창만 끝까지 띄운 무반응 시청자"가 hot 이 된다.
  // 65는 풀시청이어도 최소 행동 하나(투표4·질문6…) 또는 마케팅 동의(10)를 요구한다.
  const segment: Segment = score >= 65 ? "hot" : score >= 30 ? "warm" : "cold";
  return { score, segment, breakdown: { attend, watch, interact, interactRaw, intent, evaluatedMinutes: i.liveMinutes } };
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
  /** 실제 방송 종료 시각(Webinar.broadcastEndedAt). 있으면 예정 종료보다 이 값이 상한이다 —
   *  방송이 끝난 뒤 탭만 열어둔 시청자의 체류가 예정 종료까지 부풀지 않게 한다. */
  broadcastEndedAt: number | null = null,
): number {
  if (now < liveStartAt) return UNCAPPED_WATCH_MINUTES;
  const lowerBound = earliestObservedAt !== null ? Math.min(earliestObservedAt, liveStartAt) : liveStartAt;
  const upperBound = Math.min(now, broadcastEndedAt ?? liveEndAt);
  return Math.max(0, Math.floor((upperBound - lowerBound) / 60000));
}

/**
 * 참여 점수의 **분모**(평가 기준 길이, 분) = "이 시청자가 볼 수 있었던 시간".
 *
 * 예정 길이(liveEndAt−liveStartAt)를 분모로 쓰면 안 되는 이유 — 실측 두 가지:
 *  · **방송 중 저평가**: 120분 예정 웨비나의 15분 시점에, 처음부터 계속 보고 있는 시청자가
 *    ratio 0.125 → 체류 4점 → 총 29점 **콜드**로 뜬다. 인터랙션을 만점(30)으로 채우고 마케팅
 *    동의까지 있어도 69점이라, 운영 중에 "지금 핫 리드가 누구냐"를 볼 수 없었다.
 *  · **조기 종료 저평가**: 120분 예정인데 50분만 송출하면, 끝까지 보고 투표까지 한 시청자가
 *    54점 웜에 갇힌다. 실제 송출 길이로 나누면 74점 핫 — 20점이 방송을 일찍 끝냈다는 이유로 사라진다.
 *
 * 그래서 분모는 **실제로 흐른 방송 시간**이다:
 *   하한 = min(실제 관측 시작, liveStartAt) — 예정 시각 전 강제 라이브를 흡수(resolveWatchCapMinutes 동일 규칙)
 *   상한 = min(now, broadcastEndedAt ?? liveEndAt)
 *
 * 0 으로 나누지 않도록 최소 1분으로 클램프한다. 방송 전에는 상한<하한 이라 1분이 되지만,
 * 그 시점엔 입장자가 없어(watchMinutes=0) ratio 도 0 이므로 점수에 영향이 없다.
 */
export function resolveEvaluationMinutes(
  now: number,
  liveStartAt: number,
  liveEndAt: number,
  earliestObservedAt: number | null,
  broadcastEndedAt: number | null = null,
): number {
  const lowerBound = earliestObservedAt !== null ? Math.min(earliestObservedAt, liveStartAt) : liveStartAt;
  const upperBound = Math.min(now, broadcastEndedAt ?? liveEndAt);
  return Math.max(1, Math.floor((upperBound - lowerBound) / 60000));
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
  live: { liveStartAt: Date; liveEndAt: Date; broadcastEndedAt?: Date | null },
): Promise<{ liveMinutes: number; scheduledMinutes: number; capMinutes: number; rows: ScoredRow[] }> {
  const now = Date.now();
  const broadcastEndedAt = live.broadcastEndedAt?.getTime() ?? null;
  const scheduledMinutes = Math.max(1, Math.floor((live.liveEndAt.getTime() - live.liveStartAt.getTime()) / 60000));

  const [regs, chatG, pollG, qaAskG, qaVoteG, ctaG, shareG, referralG] = await Promise.all([
    prisma.webinarRegistration.findMany({
      where: { webinarId },
      select: { id: true, name: true, company: true, enteredAt: true, connectedSeconds: true, focusSeconds: true, stayMinutes: true, lastPingAt: true, agreeMarketing: true, shareCode: true },
    }),
    prisma.webinarChatMessage.groupBy({ by: ["registrationId"], where: { webinarId, isHost: false, registrationId: { not: null } }, _count: { _all: true } }),
    prisma.webinarPollVote.groupBy({ by: ["registrationId"], where: { registrationId: { not: null }, poll: { webinarId } }, _count: { _all: true } }),
    // 운영자가 내린(dismissed) 질문은 점수에서 뺀다 — 질문 1건이 6점(최고 가중치)이라
    // 스팸 질문 5개만으로 인터랙션 캡(30)을 채울 수 있었다. 공개 목록(/api/webinar/[slug]/qa)도
    // 같은 필터를 쓰므로, "시청자에게 안 보이는 질문은 점수도 안 준다" 로 두 쪽이 일치한다.
    prisma.webinarQA.groupBy({
      by: ["registrationId"],
      where: { webinarId, registrationId: { not: null }, status: { not: "dismissed" } },
      _count: { _all: true },
    }),
    prisma.webinarQAVote.groupBy({
      by: ["registrationId"],
      where: { registrationId: { not: null }, qa: { webinarId, status: { not: "dismissed" } } },
      _count: { _all: true },
    }),
    // CTA 는 팝업당 1회만 인정 — 투표(1인 1표)·추천(질문당 1회)과 달리 클릭엔 unique 제약이
    // 없어, 같은 버튼 연타(안 열리는 줄 알고 8번)만으로 인터랙션 캡을 채우는 걸 막는다.
    // 원본 클릭 기록은 그대로 두고(클릭률 분석용) 점수 집계만 dedupe 한다.
    prisma.$queryRaw<{ registrationId: string; cnt: number }[]>`
      SELECT "registrationId", COUNT(DISTINCT COALESCE("popupId", '') || ':' || "kind")::int AS "cnt"
        FROM "WebinarPopupClick"
       WHERE "webinarId" = ${webinarId} AND "registrationId" IS NOT NULL
       GROUP BY "registrationId"
    `,
    // 공유 행위 — 같은 사람이 여러 면(대기·시청·종료)에서 공유하면 각각 센다(면마다 도달이 다르다).
    prisma.webinarShareEvent.groupBy({ by: ["registrationId"], where: { webinarId }, _count: { _all: true } }),
    // 추천 성공 — 이 사람의 링크로 실제 등록한 사람 수(클릭이 아니라 등록이다).
    prisma.webinarRegistration.groupBy({
      by: ["referredById"],
      where: { webinarId, referredById: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const chatMap = countMap(chatG);
  const pollMap = countMap(pollG);
  const qaAskMap = countMap(qaAskG);
  const qaVoteMap = countMap(qaVoteG);
  const ctaMap = new Map<string, number>();
  for (const r of ctaG) ctaMap.set(r.registrationId, Number(r.cnt) || 0);
  const shareMap = new Map<string, number>();
  for (const r of shareG) shareMap.set(r.registrationId, r._count._all);
  const referralMap = new Map<string, number>();
  for (const r of referralG) if (r.referredById) referralMap.set(r.referredById, r._count._all);

  const earliestObservedAt = regs.reduce<number | null>((min, r) => {
    if (!r.enteredAt) return min;
    const t = r.enteredAt.getTime();
    return min === null || t < min ? t : min;
  }, null);
  const capMinutes = resolveWatchCapMinutes(now, live.liveStartAt.getTime(), live.liveEndAt.getTime(), earliestObservedAt, broadcastEndedAt);
  // 점수의 분모 — 예정 길이가 아니라 실제 방송 경과 분. resolveEvaluationMinutes 주석에 실측 근거가 있다.
  const liveMinutes = resolveEvaluationMinutes(now, live.liveStartAt.getTime(), live.liveEndAt.getTime(), earliestObservedAt, broadcastEndedAt);

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
    const shares = shareMap.get(r.id) ?? 0;
    const referrals = referralMap.get(r.id) ?? 0;
    const { score, segment, breakdown } = scoreRegistrant({ entered, watchMinutes, liveMinutes, chat, pollVotes, qaAsks, qaUpvotes, ctaClicks, agreeMarketing: r.agreeMarketing, shares, referrals });
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
      shares,
      referrals,
      score,
      segment,
      breakdown,
    };
  });

  return { liveMinutes, scheduledMinutes, capMinutes, rows };
}
