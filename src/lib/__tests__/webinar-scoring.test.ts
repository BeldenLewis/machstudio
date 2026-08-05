import { describe, expect, it } from "vitest";
import {
  resolveEvaluationMinutes,
  resolveWatchCapMinutes,
  scoreRegistrant,
  UNCAPPED_WATCH_MINUTES,
  type EngagementInput,
} from "@/lib/webinar-scoring";

/**
 * 리드 스코어링 — **영업 팔로업 순서를 정하는 숫자**다. 틀리면 전화할 사람을 잘못 고른다.
 *
 * 이 파일이 생긴 계기: 분모가 "예정 길이" 여서 방송 중과 조기 종료에 전원이 저평가됐다.
 * 실측(프로덕션 DB, 120분 예정 웨비나)이 아래 테스트의 기대값 그대로다.
 */

const MIN = 60_000;
const base: EngagementInput = {
  entered: true,
  watchMinutes: 0,
  liveMinutes: 120,
  chat: 0,
  pollVotes: 0,
  qaAsks: 0,
  qaUpvotes: 0,
  ctaClicks: 0,
  agreeMarketing: false,
  shares: 0,
  referrals: 0,
};

describe("분모는 실제 방송 경과 시간이다 — 예정 길이를 쓰면 전원이 저평가된다", () => {
  const start = Date.UTC(2026, 7, 11, 1, 0); // 10:00 KST
  const end = start + 120 * MIN;

  it("방송 중에는 지금까지 흐른 시간만 분모다", () => {
    // 15분 경과 → 분모 15분. 처음부터 본 시청자는 ratio 1.0 이어야 한다.
    expect(resolveEvaluationMinutes(start + 15 * MIN, start, end, start, null)).toBe(15);
    expect(resolveEvaluationMinutes(start + 90 * MIN, start, end, start, null)).toBe(90);
  });

  /**
   * 이게 고친 결함이다. 예정 120분을 분모로 쓰면 15분 시점에 **처음부터 계속 보고 있는**
   * 시청자가 콜드로 뜬다 — 인터랙션을 만점으로 채우고 마케팅 동의까지 있어도 69점이었다.
   */
  it("15분 경과 시점, 처음부터 본 무반응 시청자: 예정 기준이면 콜드 / 경과 기준이면 웜", () => {
    const wrong = scoreRegistrant({ ...base, watchMinutes: 15, liveMinutes: 120 });
    expect(wrong.score).toBe(29);
    expect(wrong.segment).toBe("cold");

    const right = scoreRegistrant({ ...base, watchMinutes: 15, liveMinutes: 15 });
    expect(right.score).toBe(60);
    expect(right.segment).toBe("warm");
  });

  it("방송 중에도 핫에 도달할 수 있다 — 풀시청 + 행동 하나면 충분", () => {
    const early = scoreRegistrant({ ...base, watchMinutes: 15, liveMinutes: 15, pollVotes: 1, agreeMarketing: true });
    expect(early.segment).toBe("hot");
  });

  it("예정보다 일찍 끝내면 실제 송출 길이가 분모다 (120분 예정 · 50분 송출)", () => {
    const endedAt = start + 50 * MIN;
    const now = start + 130 * MIN; // 웨비나 끝난 뒤 분석 화면을 열어본 시점
    expect(resolveEvaluationMinutes(now, start, end, start, endedAt)).toBe(50);

    // 끝까지 보고 투표까지 한 시청자 — 예정 기준 54점 웜 / 실제 송출 기준 74점 핫
    const deflated = scoreRegistrant({ ...base, watchMinutes: 50, liveMinutes: 120, pollVotes: 1, agreeMarketing: true });
    expect(deflated).toMatchObject({ score: 54, segment: "warm" });
    const honest = scoreRegistrant({ ...base, watchMinutes: 50, liveMinutes: 50, pollVotes: 1, agreeMarketing: true });
    expect(honest).toMatchObject({ score: 74, segment: "hot" });
  });

  /** 예정 시각 전에 강제 라이브 전환한 경우 — 하한이 실제 관측 시작으로 내려가야 분모가 양수다. */
  it("예정 시각 전 조기 오픈: 실제 입장 시각부터 센다", () => {
    const firstEntry = start - 30 * MIN;
    const now = start - 10 * MIN;
    expect(resolveEvaluationMinutes(now, start, end, firstEntry, null)).toBe(20);
  });

  /** 0 으로 나누는 사고를 막는 클램프. 방송 전엔 입장자가 없어 체류도 0 이라 점수엔 영향이 없다. */
  it("방송 전에는 최소 1분 — 0으로 나누지 않는다", () => {
    expect(resolveEvaluationMinutes(start - 60 * MIN, start, end, null, null)).toBe(1);
    expect(scoreRegistrant({ ...base, watchMinutes: 0, liveMinutes: 1 }).score).toBe(25);
  });
});

describe("체류 상한도 실제 방송 종료를 존중한다", () => {
  const start = Date.UTC(2026, 7, 11, 1, 0);
  const end = start + 120 * MIN;

  /** 방송이 끝난 뒤 탭만 열어둔 시청자의 체류가 예정 종료까지 부풀지 않게. */
  it("broadcastEndedAt 이 있으면 그 시각이 상한", () => {
    const endedAt = start + 50 * MIN;
    expect(resolveWatchCapMinutes(start + 130 * MIN, start, end, start, endedAt)).toBe(50);
    // 없으면 예정 종료가 상한 (기존 동작)
    expect(resolveWatchCapMinutes(start + 130 * MIN, start, end, start, null)).toBe(120);
  });

  it("예정 시각 전 강제 라이브는 상한 없음 — 기존 계약 유지", () => {
    expect(resolveWatchCapMinutes(start - 10 * MIN, start, end, null)).toBe(UNCAPPED_WATCH_MINUTES);
  });
});

describe("점수 근거를 함께 돌려준다 — 화면이 '왜 이 점수인지' 를 보여줄 수 있게", () => {
  it("네 덩어리 합이 점수와 맞는다", () => {
    const { score, breakdown } = scoreRegistrant({
      ...base, watchMinutes: 60, liveMinutes: 60, chat: 2, pollVotes: 1, agreeMarketing: true,
    });
    expect(breakdown).toEqual({ attend: 25, watch: 35, interact: 10, interactRaw: 10, intent: 10, evaluatedMinutes: 60 });
    expect(breakdown.attend + breakdown.watch + breakdown.interact + breakdown.intent).toBe(score);
  });

  /** 캡에 걸려 잘린 원점수를 남긴다 — "30 (원점수 42)" 로 보여줘야 캡을 오해하지 않는다. */
  it("인터랙션 캡(30)에 걸리면 원점수를 따로 남긴다", () => {
    const { breakdown } = scoreRegistrant({ ...base, watchMinutes: 60, liveMinutes: 60, qaAsks: 7 });
    expect(breakdown.interactRaw).toBe(42);
    expect(breakdown.interact).toBe(30);
  });

  it("노쇼도 근거를 남긴다 — 마케팅 동의 5점의 출처가 보이게", () => {
    const no = scoreRegistrant({ ...base, entered: false, agreeMarketing: true });
    expect(no).toMatchObject({ score: 5, segment: "cold" });
    expect(no.breakdown).toMatchObject({ attend: 0, watch: 0, interact: 0, intent: 5 });
  });
});

describe("입소문(공유·추천)도 행동으로 센다", () => {
  const full = { ...base, watchMinutes: 60, liveMinutes: 60 };

  /** 남을 데려오는 건 이 웨비나에서 가장 드문 행동이라 질문(6)보다 무겁다. */
  it("추천 성공 8점 · 공유 5점 — 질문(6)·투표(4)와의 순서가 유지된다", () => {
    expect(scoreRegistrant({ ...full, referrals: 1 }).breakdown.interactRaw).toBe(8);
    expect(scoreRegistrant({ ...full, shares: 1 }).breakdown.interactRaw).toBe(5);
    expect(scoreRegistrant({ ...full, qaAsks: 1 }).breakdown.interactRaw).toBe(6);
  });

  it("공유만 해도 풀시청자가 핫이 된다 — 창만 띄운 무반응(60 웜)과 구분된다", () => {
    expect(scoreRegistrant(full).segment).toBe("warm");
    expect(scoreRegistrant({ ...full, shares: 1 }).segment).toBe("hot");
  });

  /**
   * 노쇼여도 남을 데려왔으면 관심 있는 리드다 — 예전 규칙은 입장하지 않으면 무조건 0/5 였다.
   * 다만 참석자 위로 갈 수는 없게 25 로 묶는다(동의 5 를 더해도 웜 경계 30 이 상한).
   */
  it("노쇼 + 추천: 콜드에 갇히지 않고 웜까지 올라간다", () => {
    const noShow = { ...base, entered: false };
    expect(scoreRegistrant({ ...noShow, referrals: 1 }).score).toBe(8);
    expect(scoreRegistrant({ ...noShow, referrals: 3, agreeMarketing: true })).toMatchObject({ score: 29, segment: "cold" });
    expect(scoreRegistrant({ ...noShow, referrals: 4, agreeMarketing: true })).toMatchObject({ score: 30, segment: "warm" });
  });

  it("노쇼 입소문 가점은 25 에서 멈춘다 — 참석자를 넘지 못하게", () => {
    const maxed = scoreRegistrant({ ...base, entered: false, referrals: 20, shares: 20, agreeMarketing: true });
    expect(maxed.score).toBe(30);
    expect(maxed.breakdown.interact).toBe(25);
  });
});

describe("세그먼트 경계 — 기존 계약을 그대로 유지한다", () => {
  const full = { ...base, watchMinutes: 60, liveMinutes: 60 };

  /** 60점(참석25+풀시청35)은 "창만 띄워둔 무반응 시청자" 라 핫이 아니다 — 의도된 경계. */
  it("풀시청 무반응은 웜(60), 행동 하나가 붙으면 핫", () => {
    expect(scoreRegistrant(full)).toMatchObject({ score: 60, segment: "warm" });
    expect(scoreRegistrant({ ...full, pollVotes: 2 }).segment).toBe("hot");
    expect(scoreRegistrant({ ...full, agreeMarketing: true }).segment).toBe("hot");
  });

  it("점수는 100을 넘지 않는다", () => {
    const max = scoreRegistrant({ ...full, chat: 50, pollVotes: 50, qaAsks: 50, qaUpvotes: 50, ctaClicks: 50, agreeMarketing: true });
    expect(max.score).toBe(100);
  });

  it("노쇼는 마케팅 동의가 있어도 콜드 — 참석하지 않은 사람이 웜을 넘지 못하게", () => {
    expect(scoreRegistrant({ ...base, entered: false, agreeMarketing: true }).segment).toBe("cold");
    expect(scoreRegistrant({ ...base, entered: false }).score).toBe(0);
  });
});
