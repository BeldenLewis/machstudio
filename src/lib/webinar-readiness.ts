// 만들기 준비 상태 — "시청자에게 빈 화면은 없어요" 검사.
//
// 이 검사가 보는 것은 **완성도가 아니라 이중 게이트**다. AGENTS 의 공개 페이지 원칙:
// "섹션은 config 토글 ON + 실제 데이터 있음 이중 게이트 — 빈 껍데기를 시청자에게 노출하지 않는다."
// 그래서 "설명을 더 쓰세요" 같은 잔소리는 하지 않고, **켜 놨는데 내용이 없어서 시청자 화면에서
// 조용히 사라지는 것**만 짚는다. 조용히 사라지는 게 문제인 이유: 운영자는 켰다고 믿는다.
//
// 순수 함수인 이유: 만들기 탭은 로그인 뒤에 있어 브라우저 자동화로 열 수 없다.
// 판정 로직을 여기 두면 vitest 가 매 커밋마다 실제 조합을 검증한다.

import { normalizeLivePageConfig } from "./webinar-config";

export type ReadinessSection = "source" | "landing" | "registration" | "watch" | "survey";
export type WatchStateId = "waiting" | "entry" | "live" | "ended";

export interface ReadinessIssue {
  section: ReadinessSection;
  /** 시청 화면 안의 어느 상태인지 — 클릭해서 그 자리로 보낼 때 쓴다. */
  watchState?: WatchStateId;
  title: string;
  detail: string;
  /**
   * blocking — 시청자 여정이 막힌다(영상 미연결, 이름 없음).
   * empty    — 켜 놨는데 내용이 없어 그 영역이 조용히 사라진다.
   */
  severity: "blocking" | "empty";
}

export interface ReadinessInput {
  name: string;
  sessionCount: number;
  config: Record<string, unknown> | null | undefined;
  /** 종료 화면에 연결된(열려 있고 마감 전) 자체 설문이 있는가 — 서버 조건과 같은 판정을 넘겨받는다. */
  hasLinkedEndedSurvey: boolean;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** 공개 폼에 실제로 뜨는 선택지 개수 — 저장·정규화와 같은 trim 기준으로 센다. */
function liveOptionCount(options: unknown): number {
  return Array.isArray(options) ? options.filter((o) => typeof o === "string" && o.trim() !== "").length : 0;
}

export function checkWebinarReadiness(input: ReadinessInput): ReadinessIssue[] {
  const { name, sessionCount, config, hasLinkedEndedSurvey } = input;
  const cfg = (config ?? {}) as Record<string, unknown>;
  const out: ReadinessIssue[] = [];

  // ── 원본 ──────────────────────────────────────────────
  if (!name.trim()) {
    out.push({
      section: "source",
      severity: "blocking",
      title: "웨비나 이름이 비어 있어요",
      detail: "이름이 없으면 저장되지 않고, 모든 공개 화면의 제목도 비어요.",
    });
  }

  const screens = normalizeLivePageConfig(cfg);

  // ── 시청 › 대기 ────────────────────────────────────────
  if (screens.waiting.agenda && sessionCount === 0) {
    out.push({
      section: "watch", watchState: "waiting", severity: "empty",
      title: "대기 화면 아젠다를 켰지만 세션이 없어요",
      detail: "원본 정보 › 진행 순서에 세션을 넣지 않으면 이 영역은 시청자 화면에서 사라져요.",
    });
  }
  if (screens.waiting.calendar && !str(cfg.calendarUrl)) {
    out.push({
      section: "watch", watchState: "waiting", severity: "empty",
      title: "‘캘린더에 추가’ 를 켰지만 링크가 없어요",
      detail: "시청 화면 › 대기의 캘린더 URL 을 채워야 버튼이 보여요.",
    });
  }

  // ── 시청 › 라이브 ──────────────────────────────────────
  if (!str(cfg.youtubeId)) {
    out.push({
      section: "watch", watchState: "live", severity: "blocking",
      title: "라이브 영상이 연결되지 않았어요",
      detail: "방송이 시작돼도 시청 화면에 영상이 나오지 않아요.",
    });
  }

  // ── 시청 › 종료 ────────────────────────────────────────
  if (screens.ended.resources && screens.resources.length === 0) {
    out.push({
      section: "watch", watchState: "ended", severity: "empty",
      title: "자료 다운로드를 켰지만 자료가 없어요",
      detail: "자료를 1개 이상 넣어야 종료 화면에 표시돼요.",
    });
  }
  if (screens.ended.nextWebinar && !str(screens.nextWebinar?.title)) {
    out.push({
      section: "watch", watchState: "ended", severity: "empty",
      title: "다음 웨비나를 켰지만 제목이 없어요",
      detail: "제목을 입력해야 종료 화면에 카드가 표시돼요.",
    });
  }
  // 종료 설문의 이중 조건 — 영역만 켜고 대상이 없으면 버튼이 안 뜬다.
  if (screens.ended.survey && !hasLinkedEndedSurvey && !str(cfg.surveyUrl)) {
    out.push({
      section: "watch", watchState: "ended", severity: "empty",
      title: "설문 영역을 켰지만 연결된 설문이 없어요",
      detail: "시청 화면 › 종료 › 설문 연결에서 자체 설문이나 외부 링크를 골라야 버튼이 보여요.",
    });
  }

  // ── 등록 ──────────────────────────────────────────────
  // 공백만 남은 선택지는 저장·정규화 단계에서 걸러져 **그 항목 자체가 공개 폼에서 사라진다.**
  // 어드민에는 '필수' 로 켜져 있는데 시청자 폼에는 없는 상태가 만들어지므로 반드시 짚는다.
  const regForm = (cfg.registrationForm ?? {}) as Record<string, unknown>;
  const fields = Array.isArray(regForm.fields) ? (regForm.fields as Record<string, unknown>[]) : [];
  for (const f of fields) {
    if (f.type !== "select" || f.enabled === false) continue;
    if (liveOptionCount(f.options) > 0) continue;
    out.push({
      section: "registration", severity: "empty",
      title: `‘${str(f.label) || "선택 항목"}’ 에 선택지가 없어요`,
      detail: f.required === true
        ? "선택지가 없으면 이 항목은 시청자 폼에서 아예 빠져요 — 필수로 켜 뒀어도 등록은 막히지 않아요."
        : "선택지가 없으면 이 항목은 시청자 폼에 표시되지 않아요.",
    });
  }

  // ── 랜딩 ──────────────────────────────────────────────
  const landing = (cfg.landingPage ?? {}) as Record<string, unknown>;
  if (landing.enabled === true) {
    const titleLines = Array.isArray(landing.titleLines)
      ? (landing.titleLines as unknown[]).filter((s) => typeof s === "string" && s.trim() !== "")
      : [];
    const sectionRows = (key: string, inner: string) => {
      const o = (landing[key] ?? {}) as Record<string, unknown>;
      return Array.isArray(o[inner]) ? (o[inner] as unknown[]).length : 0;
    };
    const bodyCount =
      sectionRows("programs", "items") + sectionRows("highlights", "items") +
      sectionRows("faq", "items") + sectionRows("join", "steps");
    if (titleLines.length === 0 && bodyCount === 0) {
      out.push({
        section: "landing", severity: "empty",
        title: "랜딩 페이지를 공개했지만 내용이 없어요",
        detail: "제목도 본문 섹션도 비어 있어서 방문자에게 빈 페이지가 보여요.",
      });
    }
  }

  return out;
}

/** 섹션별 미완 개수 — 내비의 상태 점에 쓴다. */
export function readinessBySection(issues: ReadinessIssue[]): Record<ReadinessSection, number> {
  const base: Record<ReadinessSection, number> = { source: 0, landing: 0, registration: 0, watch: 0, survey: 0 };
  for (const i of issues) base[i.section] += 1;
  return base;
}
