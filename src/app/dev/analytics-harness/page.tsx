"use client";

/**
 * 분석 탭 하니스 — **개발 환경 전용**(프로덕션 404).
 *
 * 분석 탭은 로그인 + 워크스페이스 멤버십 뒤에 있고, 세그먼트·입소문 숫자는 실제 라이브를
 * 거쳐야 쌓인다. 그래서 AnalyticsTab **본체를 그대로** 태우고 API 만 가로챈다 —
 * 확인 대상(방송 전/후 화면 분기 · 2열 배치 · 입소문 섹션 게이트)이 전부 이 컴포넌트
 * 안의 판단이라 이 경계로 충분하다.
 *
 * fetch 패치를 렌더 본문에서 하는 이유: AnalyticsTab 은 자기 effect 에서 데이터를 부르고,
 * 부모 렌더는 자식 effect 보다 먼저 돈다. useEffect 로 패치하면 첫 요청을 놓친다.
 * (등록자 하니스와 같은 패턴)
 */

import { useRef } from "react";
import { notFound } from "next/navigation";
import AnalyticsTab from "@/app/(app)/webinar/[slug]/AnalyticsTab";

const EVALUATED_MINUTES = 75; // 예정 120분인데 실제 75분만 송출한 웨비나

/** 점수 근거는 실제 규칙(참석 25 + 체류 round(체류/75×35) + 행동 + 인텐트)과 맞춰 둔다. */
const TOP = [
  { name: "질문 폭격기", company: "아웃컴", score: 100, segment: "hot", watchMinutes: 75, chat: 4, pollVotes: 2, qaAsks: 7, qaUpvotes: 3, ctaClicks: 1, agreeMarketing: true,
    breakdown: { attend: 25, watch: 35, interact: 30, interactRaw: 63, intent: 10, evaluatedMinutes: EVALUATED_MINUTES } },
  { name: "끝까지 본 사람", company: "엑스포럼", score: 74, segment: "hot", watchMinutes: 75, chat: 0, pollVotes: 1, qaAsks: 0, qaUpvotes: 0, ctaClicks: 0, agreeMarketing: true,
    breakdown: { attend: 25, watch: 35, interact: 4, interactRaw: 4, intent: 10, evaluatedMinutes: EVALUATED_MINUTES } },
  { name: "조용한 완주자", company: null, score: 60, segment: "warm", watchMinutes: 75, chat: 0, pollVotes: 0, qaAsks: 0, qaUpvotes: 0, ctaClicks: 0, agreeMarketing: false,
    breakdown: { attend: 25, watch: 35, interact: 0, interactRaw: 0, intent: 0, evaluatedMinutes: EVALUATED_MINUTES } },
  { name: "중간 이탈", company: "테스트컴퍼니", score: 44, segment: "warm", watchMinutes: 40, chat: 1, pollVotes: 0, qaAsks: 0, qaUpvotes: 0, ctaClicks: 0, agreeMarketing: false,
    breakdown: { attend: 25, watch: 19, interact: 3, interactRaw: 3, intent: 0, evaluatedMinutes: EVALUATED_MINUTES } },
  { name: "잠깐 들른 사람", company: null, score: 28, segment: "cold", watchMinutes: 7, chat: 0, pollVotes: 0, qaAsks: 0, qaUpvotes: 0, ctaClicks: 0, agreeMarketing: false,
    breakdown: { attend: 25, watch: 3, interact: 0, interactRaw: 0, intent: 0, evaluatedMinutes: EVALUATED_MINUTES } },
];

const SCORING_ENDED = {
  total: 40, liveMinutes: EVALUATED_MINUTES, scheduledMinutes: 120, phase: "ended",
  distribution: { hot: 2, warm: 12, cold: 8, noShow: 18 },
  top: TOP,
  retargetCount: 11,
  leadQuality: { consented: 24, withEmail: 40, withPhone: 38, withCompany: 31 },
};

/** 방송 전 — 세그먼트는 전원 노쇼라 의미가 없어 '확보한 리드' 로 갈아탄다(실제 8/11 웨비나 규모). */
const SCORING_BEFORE = {
  total: 262, liveMinutes: 1, scheduledMinutes: 120, phase: "before",
  distribution: { hot: 0, warm: 0, cold: 0, noShow: 262 },
  top: [], retargetCount: 0,
  leadQuality: { consented: 142, withEmail: 262, withPhone: 262, withCompany: 258 },
};

const WORD_OF_MOUTH = {
  sharers: 6, shares: 9, clicks: 34, registered: 7,
  bySurface: [{ surface: "waiting", count: 5 }, { surface: "live", count: 3 }, { surface: "ended", count: 1 }],
  top: [
    { name: "질문 폭격기", company: "아웃컴", shares: 3, clicks: 18, registered: 4 },
    { name: "끝까지 본 사람", company: "엑스포럼", shares: 2, clicks: 9, registered: 2 },
    { name: "중간 이탈", company: "테스트컴퍼니", shares: 1, clicks: 4, registered: 1 },
  ],
};

/* 유입 표 — 등록 수만이 아니라 리드 품질(평균 점수·핫 비율)까지. meta 173명은 신뢰 가능하지만
   kakao 13명의 평균은 노이즈라 scoreReliable=false 로 흐리게 나와야 한다. */
const UTM = [
  { source: "meta", medium: "da", visits: 2100, registered: 173, entered: 96, regRate: 8, entryRate: 55, avgScore: 44, hot: 6, hotRate: 6, scoreReliable: true },
  { source: "kakao", medium: "content", visits: 240, registered: 13, entered: 9, regRate: 5, entryRate: 69, avgScore: 71, hot: 4, hotRate: 44, scoreReliable: false },
  { source: "newsletter", medium: "content", visits: 90, registered: 9, entered: 7, regRate: 10, entryRate: 78, avgScore: 66, hot: 3, hotRate: 43, scoreReliable: false },
  { source: "(direct)", medium: "(none)", visits: 320, registered: 44, entered: 21, regRate: 14, entryRate: 48, avgScore: 39, hot: 1, hotRate: 5, scoreReliable: true },
  { source: "eventus", medium: "content", visits: 20, registered: 2, entered: 0, regRate: 10, entryRate: 0, avgScore: 0, hot: 0, hotRate: 0, scoreReliable: false },
];

/** 리드 분석 — 실제 8/11 웨비나의 업종·직함 분포를 그대로 쓴다(하니스가 현실과 어긋나지 않게). */
const LEAD_ANALYSIS_BASE = {
  byIndustry: [
    { label: "K-뷰티", total: 109, entered: 61, avgScore: 47, hot: 5, reliable: true },
    { label: "K-푸드", total: 61, entered: 33, avgScore: 41, hot: 2, reliable: true },
    { label: "K-라이프스타일", total: 59, entered: 30, avgScore: 38, hot: 1, reliable: true },
    { label: "기타", total: 27, entered: 9, avgScore: 52, hot: 2, reliable: true },
  ],
  byRole: [
    { label: "의사결정권자", total: 137, entered: 79, avgScore: 51, hot: 8, reliable: true },
    { label: "중간관리자", total: 54, entered: 31, avgScore: 40, hot: 2, reliable: true },
    { label: "실무·기타", total: 65, entered: 23, avgScore: 33, hot: 0, reliable: true },
  ],
  minReliableSample: 20,
};

const LEAD_ANALYSIS_ENDED = {
  ...LEAD_ANALYSIS_BASE,
  // 60~69 칸이 가장 높다 = 끝까지 봤지만 아무 행동도 안 한 시청자가 제일 많다
  histogram: [
    { from: 0, to: 9, count: 0 }, { from: 10, to: 19, count: 3 }, { from: 20, to: 29, count: 11 },
    { from: 30, to: 39, count: 24 }, { from: 40, to: 49, count: 29 }, { from: 50, to: 59, count: 21 },
    { from: 60, to: 69, count: 34 }, { from: 70, to: 79, count: 8 }, { from: 80, to: 89, count: 2 },
    { from: 90, to: 100, count: 1 },
  ],
  composition: { attend: 3325, watch: 2618, interact: 412, intent: 940, total: 7295 },
  lift: [
    { action: "투표", withCount: 61, withAvg: 62, withoutAvg: 41, reliable: true },
    { action: "채팅", withCount: 31, withAvg: 66, withoutAvg: 43, reliable: true },
    { action: "질문", withCount: 12, withAvg: 71, withoutAvg: 45, reliable: false },
    { action: "질문 추천", withCount: 0, withAvg: 0, withoutAvg: 46, reliable: false },
    { action: "CTA 클릭", withCount: 18, withAvg: 69, withoutAvg: 44, reliable: false },
    { action: "공유", withCount: 6, withAvg: 73, withoutAvg: 45, reliable: false },
  ],
};

/** 방송 전 — 점수가 전부 0 이라 화면이 업종·직함 구성만 남긴다(분포·구성·리프트 카드 사라짐). */
const LEAD_ANALYSIS_BEFORE = {
  ...LEAD_ANALYSIS_BASE,
  byIndustry: LEAD_ANALYSIS_BASE.byIndustry.map((f) => ({ ...f, entered: 0, avgScore: 0, hot: 0 })),
  byRole: LEAD_ANALYSIS_BASE.byRole.map((f) => ({ ...f, entered: 0, avgScore: 0, hot: 0 })),
  histogram: Array.from({ length: 10 }, (_, i) => ({ from: i * 10, to: i === 9 ? 100 : i * 10 + 9, count: 0 })),
  composition: { attend: 0, watch: 0, interact: 0, intent: 0, total: 0 },
  lift: [],
};

function analyticsBody(before: boolean) {
  const registered = before ? 262 : 239;
  const attended = before ? 0 : 133;
  return {
    funnel: {
      visits: 2750, registered, attended,
      stay30: before ? 0 : 88, stay60: before ? 0 : 51,
      avgStayMinutes: before ? 0 : 41, maxStayMinutes: before ? 0 : 75,
      attendRate: before ? 0 : 56, stay30Rate: before ? 0 : 66, stay60Rate: before ? 0 : 38,
      regRate: 9,
    },
    utmBreakdown: UTM,
    campaignBreakdown: [],
    costScope: { from: "2026-07-20T00:00:00.000Z", to: "2026-08-11T00:00:00.000Z" },
    unmatchedAdCampaigns: [],
    registrationTrend: Array.from({ length: 14 }, (_, i) => ({
      date: `2026-07-${String(23 + i).padStart(2, "0")}`.replace("07-3", "08-0"),
      count: [4, 9, 12, 8, 21, 33, 27, 14, 11, 19, 24, 31, 18, 6][i],
    })),
    interactions: {
      polls: before ? [] : [{ id: "p1", question: "지금 가장 고민되는 건?", isActive: false, totalVotes: 61,
        options: [{ label: "리드 확보", voteCount: 34 }, { label: "전환율", voteCount: 19 }, { label: "운영 공수", voteCount: 8 }] }],
      qa: before
        ? { total: 0, answered: 0, pending: 0, dismissed: 0, answerRate: 0, top: [] }
        : { total: 14, answered: 9, pending: 3, dismissed: 2, answerRate: 64,
            top: [{ question: "연간 계약 할인도 있나요?", voteCount: 7, status: "answered", name: "김철수" }] },
      chat: before ? { messages: 0, participants: 0 } : { messages: 96, participants: 31 },
      cta: before ? { clicks: 0, clickers: 0 } : { clicks: 22, clickers: 18 },
      reminders: 118,
    },
    scoring: before ? SCORING_BEFORE : SCORING_ENDED,
    leadAnalysis: before ? LEAD_ANALYSIS_BEFORE : LEAD_ANALYSIS_ENDED,
    wordOfMouth: before ? { sharers: 0, shares: 0, clicks: 0, registered: 0, bySurface: [], top: [] } : WORD_OF_MOUTH,
    hasVisitData: true,
    generatedAt: "2026-08-11T04:30:00.000Z",
  };
}

const CURVE = {
  points: Array.from({ length: 16 }, (_, i) => ({
    label: `${String(10 + Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`,
    viewers: [12, 48, 91, 118, 126, 131, 128, 119, 112, 104, 97, 88, 74, 61, 44, 21][i],
    entered: [12, 39, 46, 28, 9, 6, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0][i],
    chat: [0, 4, 9, 12, 7, 14, 6, 8, 5, 9, 4, 7, 3, 5, 2, 1][i],
  })),
  peak: 131, avg: 89, bucketMinutes: 15, hasData: true,
};

const ACTIVITY = [
  { id: "a1", action: "webinar.updated", label: "상태를 라이브로 전환", at: "2026-08-11T01:00:00.000Z", actor: "엄재호" },
  { id: "a2", action: "webinar.poll_activated", label: "투표 시작", at: "2026-08-11T01:24:00.000Z", actor: "엄재호" },
  { id: "a3", action: "webinar.updated", label: "상태를 종료로 전환", at: "2026-08-11T02:15:00.000Z", actor: "엄재호" },
];

export default function AnalyticsHarnessPage() {
  if (process.env.NODE_ENV === "production") notFound();

  /* ?before=1 — 아직 방송 전(phase=before). '확보한 리드' 로 갈리고, 상위 참여자·입소문
     섹션이 사라져야 한다. 두 상태를 다 볼 수 있어야 게이트를 확인할 수 있다. */
  const before = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("before");

  const patched = useRef(false);
  if (typeof window !== "undefined" && !patched.current) {
    patched.current = true;
    const real = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("attendance-curve")) return Promise.resolve(Response.json(before ? { points: [], peak: 0, avg: 0, hasData: false } : CURVE));
      if (url.includes("/activity")) return Promise.resolve(Response.json({ items: before ? [] : ACTIVITY }));
      // 설문 결과 섹션 — 하니스에서는 설문 없음으로 둬 분석 본문에 집중한다
      if (url.includes("/surveys")) return Promise.resolve(Response.json({ surveys: [] }));
      if (url.includes("/analytics")) return Promise.resolve(Response.json(analyticsBody(before)));
      return real(input, init);
    };
  }

  return (
    <div className="p-4">
      <header className="mb-2 px-4 sm:px-6 lg:px-8">
        <h1 className="text-sm font-semibold">분석 탭 하니스</h1>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          개발 전용. 실제 AnalyticsTab + 모의 API. 내보내기·삭제는 서버에 닿지 않습니다.
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          토글: <a className="underline" href="?">방송 후(세그먼트·상위 참여자·입소문)</a> ·{" "}
          <a className="underline" href="?before=1">방송 전(확보한 리드)</a>
        </p>
      </header>
      <AnalyticsTab webinarId="harness" />
    </div>
  );
}
