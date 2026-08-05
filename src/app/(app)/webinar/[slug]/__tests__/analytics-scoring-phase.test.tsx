// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AnalyticsTab from "../AnalyticsTab";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * 분석 탭 리드 스코어링 — **화면이 오진하지 않는지**를 묶는다.
 *
 * 실제로 있었던 오진: 8/11 웨비나(등록 254명, 아직 방송 전)를 열면 세그먼트 막대가
 * **"노쇼 254 · 100%"** 였다. 입장이 0 이니 전원 노쇼로 집계된 것인데, 열리지도 않은
 * 웨비나가 실패한 것처럼 보였다. 그래서 방송 전에는 세그먼트 대신 "확보한 리드" 를 보여준다.
 */

const BASE = {
  funnel: {
    visits: 0, registered: 254, attended: 0, stay30: 0, stay60: 0,
    avgStayMinutes: 0, maxStayMinutes: 0, attendRate: 0, stay30Rate: 0, stay60Rate: 0, regRate: 0,
  },
  utmBreakdown: [],
  campaignBreakdown: [],
  registrationTrend: [],
  interactions: {
    polls: [], qa: { total: 0, answered: 0, pending: 0, dismissed: 0, answerRate: 0, top: [] },
    chat: { messages: 0, participants: 0 }, cta: { clicks: 0, clickers: 0 }, reminders: 0,
  },
  hasVisitData: false,
  generatedAt: new Date("2026-08-05T02:00:00Z").toISOString(),
};

const LEAD_ANALYSIS = {
  histogram: [
    { from: 0, to: 9, count: 0 }, { from: 10, to: 19, count: 1 }, { from: 20, to: 29, count: 2 },
    { from: 30, to: 39, count: 3 }, { from: 40, to: 49, count: 4 }, { from: 50, to: 59, count: 2 },
    { from: 60, to: 69, count: 9 }, { from: 70, to: 79, count: 1 }, { from: 80, to: 89, count: 0 },
    { from: 90, to: 100, count: 0 },
  ],
  composition: { attend: 550, watch: 430, interact: 0, intent: 120, total: 1100 },
  byIndustry: [
    { label: "K-뷰티", total: 109, entered: 61, avgScore: 47, hot: 5, reliable: true },
    { label: "패션", total: 4, entered: 2, avgScore: 71, hot: 1, reliable: false },
  ],
  byRole: [{ label: "의사결정권자", total: 137, entered: 79, avgScore: 51, hot: 8, reliable: true }],
  lift: [
    { action: "투표", withCount: 61, withAvg: 62, withoutAvg: 41, reliable: true },
    // withCount 0 인 줄은 화면에서 빠져야 한다 — 0 vs 0 비교는 자리만 차지한다
    { action: "질문 추천", withCount: 0, withAvg: 0, withoutAvg: 46, reliable: false },
  ],
  minReliableSample: 20,
};

const SCORING_BEFORE = {
  total: 254, liveMinutes: 1, scheduledMinutes: 120, phase: "before" as const,
  distribution: { hot: 0, warm: 0, cold: 0, noShow: 254 },
  top: [], retargetCount: 0,
  leadQuality: { consented: 142, withEmail: 254, withPhone: 254, withCompany: 254 },
};

const BREAKDOWN = { attend: 25, watch: 22, interact: 0, interactRaw: 0, intent: 0, evaluatedMinutes: 75 };
const SCORING_ENDED = {
  total: 6, liveMinutes: 75, scheduledMinutes: 120, phase: "ended" as const,
  distribution: { hot: 1, warm: 2, cold: 1, noShow: 2 },
  top: [{
    name: "참가1", company: "아웃컴", score: 47, segment: "warm" as const, watchMinutes: 75,
    chat: 0, pollVotes: 0, qaAsks: 0, qaUpvotes: 0, ctaClicks: 0, agreeMarketing: false, breakdown: BREAKDOWN,
  }],
  retargetCount: 2,
  leadQuality: { consented: 3, withEmail: 6, withPhone: 6, withCompany: 6 },
};

let host: HTMLDivElement | null = null;
let root: Root | null = null;

function mockFetch(scoring: unknown, extra: Record<string, unknown> = {}) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes("/analytics") && !url.includes("attendance-curve")
      ? { ...BASE, scoring, leadAnalysis: LEAD_ANALYSIS, ...extra }
      : url.includes("attendance-curve")
        ? { points: [], peak: 0, avg: 0 }
        : { items: [] };
    return { ok: true, json: async () => body } as Response;
  }));
}

async function render() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root?.render(<AnalyticsTab webinarId="w1" />); });
  // 로딩 → 데이터 반영까지 마이크로태스크를 비운다
  await act(async () => { await Promise.resolve(); });
  return host.textContent ?? "";
}

/** 제목이 들어 있는 카드의 부모(그리드) 를 찾는다 — jsdom 은 레이아웃을 계산하지 않으므로
 *  좌표 대신 "같은 grid 컨테이너의 형제인가" 로 2열 배치를 검증한다. */
function cardOf(title: string): HTMLElement | null {
  const h = [...(host?.querySelectorAll("h3") ?? [])].find((el) => el.textContent?.includes(title));
  // SectionCard 는 <section>(motion.section) 이다 — div 로 찾으면 카드 안쪽 헤더 div 가 잡힌다.
  return (h?.closest("section.rounded-2xl") as HTMLElement | null) ?? null;
}

beforeEach(() => {
  // ResizeObserver·matchMedia 등 차트가 기대하는 브라우저 API 최소 스텁
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  if (!window.matchMedia) {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  }
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  host = null; root = null;
  vi.unstubAllGlobals();
});

describe("방송 전 — 세그먼트 대신 확보한 리드", () => {
  it("'노쇼' 대신 지금 쓸 수 있는 숫자를 보여준다 — 등록 254명 중 마케팅 동의 142명(56%)", async () => {
    mockFetch(SCORING_BEFORE);
    const text = await render();
    expect(text).toContain("확보한 리드");
    expect(text).toContain("254");
    expect(text).toContain("마케팅 수신 동의");
    expect(text).toContain("142명 · 56%");
    expect(text).not.toContain("노쇼");
  });
});

describe("방송 후 — 세그먼트 + 점수 근거 + 리타겟", () => {
  it("세그먼트 기준과 계산 기준 시간을 화면에 밝힌다", async () => {
    mockFetch(SCORING_ENDED);
    const text = await render();
    expect(text).toContain("핫 65점↑");
    // 예정 120분인데 실제 방송 75분 — 화면이 그 차이를 설명해야 한다
    expect(text).toContain("실제 방송 75분 기준(예정 120분)");
  });

  it("점수를 네 덩어리로 분해해 보여준다 — 숫자만 보고 CSV 와 대조하지 않게", async () => {
    mockFetch(SCORING_ENDED);
    const text = await render();
    expect(text).toContain("참석 25 + 체류 22 + 행동 0");
    expect(text).toContain("체류 75/75분");
  });

  /** 노쇼 + 마케팅 동의는 5점 콜드라 상위 참여자에 절대 안 나오는데, 다음 액션의 제일 큰 덩어리다. */
  it("노쇼지만 동의한 리드를 리타겟 대상으로 알린다", async () => {
    mockFetch(SCORING_ENDED);
    const text = await render();
    expect(text).toContain("2명");
    expect(text).toContain("마케팅 정보 수신에 동의했어요");
  });
});

/**
 * 좌우 2열 — 전체 폭 카드로 한 줄씩 쌓으면 방송 전에도 막대 4개 + 막대 5개를 보려고
 * 두 번 스크롤해야 했다. 리드 요약과 퍼널은 둘 다 "몇 명이 어디까지 왔나" 라 나란히 둔다.
 */
describe("리드 요약 + 참가 퍼널은 같은 2열 그리드에 나란히 있다", () => {
  it("방송 전: 확보한 리드 | 참가 퍼널", async () => {
    mockFetch(SCORING_BEFORE);
    await render();
    const lead = cardOf("확보한 리드");
    const funnel = cardOf("참가 퍼널");
    expect(lead, "확보한 리드 카드").toBeTruthy();
    expect(funnel, "참가 퍼널 카드").toBeTruthy();
    expect(lead!.parentElement).toBe(funnel!.parentElement);
    expect(lead!.parentElement?.className).toContain("lg:grid-cols-2");
  });

  it("방송 후: 리드 스코어링 | 참가 퍼널 · 상위 참여자는 그리드 밖 전체 폭", async () => {
    mockFetch(SCORING_ENDED);
    await render();
    const lead = cardOf("리드 스코어링");
    const funnel = cardOf("참가 퍼널");
    const top = cardOf("상위 참여자");
    expect(lead!.parentElement).toBe(funnel!.parentElement);
    expect(lead!.parentElement?.className).toContain("lg:grid-cols-2");
    // 명단은 요약 아래 전체 폭 — 2열 그리드 안에 들어가면 좁아져 근거 줄이 깨진다
    expect(top, "상위 참여자 카드").toBeTruthy();
    expect(top!.parentElement).not.toBe(lead!.parentElement);
  });

  it("방송 전에는 상위 참여자 카드가 없다 — 점수를 매길 대상이 없다", async () => {
    mockFetch(SCORING_BEFORE);
    await render();
    expect(cardOf("상위 참여자")).toBeNull();
  });
});

/**
 * 리드 분석 패널 — 세그먼트 4칸으로는 다음 웨비나를 어떻게 바꿀지 알 수 없다.
 * 방송 전에는 점수가 전부 0 이라 업종·직함 **구성만** 남긴다.
 */
describe("리드 분석 패널", () => {
  it("방송 후: 분포·구성·업종·직함이 모두 뜨고 2열로 짝지어진다", async () => {
    mockFetch(SCORING_ENDED);
    await render();
    for (const t of ["점수 분포", "점수 구성", "업종별 리드", "직함별 리드"]) {
      expect(cardOf(t), t).toBeTruthy();
    }
    expect(cardOf("점수 분포")!.parentElement).toBe(cardOf("점수 구성")!.parentElement);
    expect(cardOf("업종별 리드")!.parentElement).toBe(cardOf("직함별 리드")!.parentElement);
    expect(cardOf("점수 분포")!.parentElement?.className).toContain("lg:grid-cols-2");
  });

  /** 방송 전에는 평균이 전부 0 이라 숫자를 보여주면 오해만 만든다. */
  it("방송 전: 점수 카드는 사라지고 업종·직함 구성만 남는다", async () => {
    mockFetch(SCORING_BEFORE);
    await render();
    expect(cardOf("점수 분포")).toBeNull();
    expect(cardOf("점수 구성")).toBeNull();
    expect(cardOf("행동한 사람")).toBeNull();
    expect(cardOf("업종별 리드")).toBeTruthy();
    expect(cardOf("업종별 리드")!.textContent).toContain("109명");
    // 설명 문구에는 "방송이 끝나면 평균 점수도" 가 있으므로 **데이터 줄**에 값이 없는지 본다.
    expect(cardOf("업종별 리드")!.textContent).not.toContain("평균 47점");
    expect(cardOf("업종별 리드")!.textContent).not.toContain("표본 부족");
  });

  it("표본이 작은 그룹은 '표본 부족' 으로 밝힌다 — 4명의 평균은 노이즈다", async () => {
    mockFetch(SCORING_ENDED);
    await render();
    const text = cardOf("업종별 리드")!.textContent ?? "";
    expect(text).toContain("평균 47점");
    expect(text).toContain("표본 부족");
  });

  /** 이 문구가 이 카드의 정직성이다 — 행동 가점을 포함하면 동어반복이 된다. */
  it("행동 리프트는 '가점은 빼고 비교' 를 명시하고, 아무도 안 한 행동은 뺀다", async () => {
    mockFetch(SCORING_ENDED);
    await render();
    const card = cardOf("행동한 사람");
    expect(card).toBeTruthy();
    expect(card!.textContent).toContain("그 행동으로 받은 가점은 빼고");
    expect(card!.textContent).toContain("투표");
    expect(card!.textContent).not.toContain("질문 추천");
  });

  it("아무도 반응하지 않았으면 점수 구성이 그 사실을 말한다", async () => {
    mockFetch(SCORING_ENDED);
    await render();
    expect(cardOf("점수 구성")!.textContent).toContain("행동 기여도가 0");
  });
});

describe("입소문 섹션 — 데이터가 있을 때만 뜬다", () => {
  const WOM = {
    sharers: 3, shares: 5, clicks: 12, registered: 4,
    bySurface: [{ surface: "waiting", count: 3 }, { surface: "live", count: 2 }],
    top: [{ name: "참가1", company: "아웃컴", shares: 2, clicks: 7, registered: 3 }],
  };

  it("아무도 공유하지 않았으면 섹션을 그리지 않는다 — 빈 껍데기 금지", async () => {
    mockFetch(SCORING_ENDED, { wordOfMouth: { ...WOM, sharers: 0, shares: 0, clicks: 0, registered: 0, top: [], bySurface: [] } });
    const text = await render();
    expect(text).not.toContain("입소문");
  });

  it("공유 → 클릭 → 등록 3단과 상위 추천인을 보여준다", async () => {
    mockFetch(SCORING_ENDED, { wordOfMouth: WOM });
    const text = await render();
    expect(text).toContain("입소문");
    expect(text).toContain("공유한 사람");
    expect(text).toContain("추천 링크 방문");
    expect(text).toContain("추천으로 등록");
    expect(text).toContain("전환 33%"); // 4/12
    expect(text).toContain("가장 많이 데려온 사람");
    expect(text).toContain("대기 화면");
  });
});
