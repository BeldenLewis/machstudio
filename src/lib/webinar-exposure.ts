/**
 * 노출 판정 한 곳 — "어떤 요소가 어느 공개 면에 나가는가".
 *
 * ── 왜 만들었나 ─────────────────────────────────────────────────────────────
 * 같은 노출 질문에 답하는 코드가 네 곳에 흩어져 **서로 다른 답**을 내고 있었다:
 *   · 레일 상태 점(PageSetupTab.surfaceState) — 랜딩을 무조건 "공개 중" 으로 그렸다.
 *     랜딩이 꺼져 있어도 초록 점이라, 점이 답한다고 선언한 질문("지금 시청자가 닿을 수
 *     있는가")에 거짓을 말했다.
 *   · 준비 상태(checkWebinarReadiness) — 실제 뷰어 게이트의 절반 이하만 덮는다.
 *   · 각 뷰어 화면의 게이트 식(랜딩 7개 · 대기 5개 · 종료 5개 …) — 정본.
 *   · Blk 의 goes 태그 — 자유 문자열이라 렌더처가 없는 면을 약속해도 아무도 모른다.
 * 이 모듈은 **새 판정을 만들지 않는다.** 정본(normalize* · buildLandingModel · isRealSession)을
 * 그대로 호출해 한 자리에 모으고, 화면들이 여기서 파생하게 한다.
 *
 * ── 두 축을 분리한다 ────────────────────────────────────────────────────────
 * 면(surface)  : 시청자가 닿는 화면. 지금 쓰이는가 / 누구에게 열려 있는가.
 * 요소(element): 그 면 안의 덩어리. 켜졌는가 / 내용이 있는가 / 실제로 렌더되는가.
 * 준비 상태는 "문제만" 담는 희소한 부정 판정기지만 이 모듈은 **정상 칸도 그린다** —
 * 표는 빈칸이 있어야 무언가를 가르친다.
 *
 * 순수 함수인 이유: 만들기 탭은 로그인 뒤라 브라우저 자동화로 열 수 없다. 판정을 여기 두면
 * vitest 가 매 커밋마다 실제 조합을 검증한다(readiness 가 같은 이유로 순수 함수다).
 *
 * 런타임 값(지금 몇 명이 보고 있는가)은 **입력으로 받지 않는다.** 폴러를 늘리지 않기로
 * 했고, 표가 답하는 질문은 "조건이 맞는가" 이지 "지금 화면에 있는가" 가 아니다.
 */

import { buildLandingModel } from "./landing/build-model";
import type { LandingSession } from "./landing/types";
import { CHOICE_FIELD_TYPES, normalizeLandingPageConfig, normalizeLivePageConfig, normalizeRegistrationForm } from "./webinar-config";
import { getYouTubeVideoId } from "./youtube";

// ─────────────────────────────────────────────────────────────────────────────
// 면
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 공개 면 6개.
 *
 * 라우트는 3개(landing / live / survey)뿐이고 대기·입장·시청·종료는 live 한 라우트의 상태
 * 조합이다. 그래도 면으로 세는 이유: 운영자가 편집하는 단위이자 시청자가 **다른 화면으로
 * 인식하는** 단위다(대기와 종료는 같은 라우트지만 같은 화면이 아니다).
 *
 * 등록 폼은 라우트가 없고 대기 화면 위 모달이지만 별개 면으로 센다 — 개인정보를 받는
 * 유일한 면이고 만들기 레일에 자기 칸이 있다.
 *
 * 설문은 여기 없다. 4곳(독립 라우트·종료 카드·라이브 푸시·CTA 모달)에 동시 노출되는
 * **횡단 요소**라 면 축에 넣으면 다른 면들과 층위가 안 맞는다. 설문 노출은 요소 행으로 적는다.
 *
 * label 은 Blk 의 goes 태그에 쓰이는 문자열과 **글자까지 같아야 한다** — 그 태그를 이 표의
 * 면 이름으로 옮길 때 화면에 보이는 글자가 하나도 바뀌지 않게.
 */
export const SURFACES = [
  { id: "landing", label: "랜딩", hint: "외부 사이트에 임베드하는 상세페이지" },
  { id: "signup", label: "등록 폼", hint: "대기 화면 위 모달 — 개인정보를 받는 유일한 면" },
  { id: "waiting", label: "대기 화면", hint: "라이브 시작 전" },
  { id: "entry", label: "입장 확인", hint: "라이브 중 미인증 방문자 — 대기 화면을 재사용한다" },
  { id: "live", label: "라이브 시청", hint: "등록자만" },
  { id: "ended", label: "종료 화면", hint: "방송 후" },
] as const;

export type SurfaceId = (typeof SURFACES)[number]["id"];

/** 이 면을 지금 쓰는가. unknown = 아직 모른다(로딩·실패) — 추측한 점보다 안 그리는 게 낫다. */
export type SurfaceUse = "on" | "off" | "unknown";

export interface SurfaceReport {
  id: SurfaceId;
  label: string;
  hint: string;
  use: SurfaceUse;
  /** 누가 닿는가. 면 단위 사실이다 — 요소 단위 제약(영상은 등록자만)은 요소 행이 말한다. */
  audience: "누구나" | "등록자" | "-";
  /** off 인 이유 한 줄. on 이면 null. */
  offReason: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 요소
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 요소 하나의 상태.
 *   on      — 켜져 있고 내용도 있다 → 시청자가 본다
 *   empty   — 켜져 있는데 내용이 없다 → 조용히 사라진다(준비 상태가 짚는 것)
 *   off     — 껐다 → 의도된 부재
 *   default — 입력하지 않았지만 **기본값이 나간다**. empty 와 반드시 구분해야 한다 —
 *             종료 인사말·알림 문구는 빈 값을 일부러 통과시켜 뷰어가 기본 문구를 쓰게
 *             해 뒀고(webinar-config.ts 주석), 랜딩 참여 절차는 기본 3스텝이 주입된다.
 *             이걸 empty 로 세면 정상 웨비나에 없던 경고가 쏟아진다.
 *   broken  — 편집 UI 는 이 면에 나간다고 약속하는데 **렌더하는 코드가 없다.**
 *             운영자 잘못이 아니라 코드 결함이라 '확인할 것' 카운트에 넣지 않는다.
 */
export type ElementState = "on" | "empty" | "off" | "default" | "broken";

export interface ElementRow {
  id: string;
  label: string;
  /** 어느 면에 나가는가. 여러 면에 걸치는 요소가 있다(아젠다는 대기·입장 둘 다). */
  surfaces: SurfaceId[];
  /** 이 값을 고치는 자리 — 만들기 섹션 id. 표에서 그 자리로 보낸다. */
  owner: "source" | "landing" | "registration" | "watch" | "survey";
  /** 시청 화면 안의 어느 상태인지(owner === "watch" 일 때만). */
  watchState?: "waiting" | "entry" | "live" | "ended";
  state: ElementState;
  /** state 의 근거 한 줄. empty·broken·default 는 반드시 채운다. */
  why: string | null;
  /**
   * empty 일 때 **시청자 여정이 막히는가**. 준비 상태가 severity 를 여기서 파생한다.
   * 켰는데 비어서 한 영역이 사라지는 것(false)과 이름·영상이 없어 화면이 성립하지 않는 것(true)은
   * 급한 정도가 다르다 — 둘을 같은 점으로 그리면 목록에서 급한 것이 묻힌다.
   */
  blocks?: boolean;
}

export interface ExposureReport {
  surfaces: SurfaceReport[];
  elements: ElementRow[];
  /** 켜 놨는데 내용이 없어 조용히 사라지는 것 — 표의 한 줄 판정에 쓴다. */
  emptyCount: number;
  /** 코드 결함(약속만 있고 렌더처 없음) — 운영자 카운트와 섞지 않는다. */
  brokenCount: number;
}

export interface ExposureInput {
  name: string;
  description: string | null;
  slug: string;
  liveStartAt: string;
  theme: Record<string, string>;
  config: Record<string, unknown> | null | undefined;
  sessions: readonly LandingSession[];
  /** 서버(resolveWebinarStatus) 판정 — 넘기지 않으면 랜딩 CTA 가 '등록중' 을 가정해 틀린 문구를 적는다. */
  status?: string;
  entryOpen?: boolean;
  canRegister?: boolean;
  /**
   * 라이브 중 운영자가 콘솔에서도 바꾸는 스위치들은 config 가 아니라 components 에 저장된다
   * (chatEnabled·qaMode). 그래서 config 와 따로 받는다.
   */
  components?: Record<string, unknown> | null;
  /** 열려 있는 설문이 하나라도 있는가. null = 아직 모른다(fetch 중·실패). */
  hasOpenSurvey: boolean | null;
  /** 종료 화면에 연결된(열려 있고 마감 전) 설문이 있는가. null = 아직 모른다. */
  hasLinkedEndedSurvey: boolean | null;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * 편집 UI 가 "이 면에 나간다" 고 약속하지만 렌더하는 코드가 없는 값.
 *
 * 손으로 유지하는 목록이다 — config 로는 계산할 수 없는 **코드 사실**이라서. 그래서
 * 렌더처가 나중에 생기면 이 목록이 조용히 거짓이 되고, 그걸 막는 장치는
 * "broken 개수가 정확히 2" 를 고정한 vitest 하나뿐이다. 목록을 고칠 때 그 테스트도 고쳐라.
 */
const BROKEN: Record<string, string> = {
  "waiting.social": "‘N명이 함께 기다려요’ 밴드는 등록자 수를 넘기는 코드가 없어 어떤 면에서도 렌더되지 않아요.",
  "live.infoContact": "문의처는 저장되지만 시청 화면에 그리는 코드가 없어요.",
};

/**
 * 면이 지금 쓰이는가 — 기존 신호에서 파생한다. **새 플래그를 만들지 않는다.**
 *
 * 랜딩만 진짜 on/off 스위치가 있고(landingPage.enabled), 등록은 접수 창(canRegister)이,
 * 시청 3면은 웨비나의 본체라 끌 수단이 없다(끌 수 있는 건 그 안의 영역들이다).
 */
function buildSurfaces(input: ExposureInput, landingEnabled: boolean): SurfaceReport[] {
  const meta = (id: SurfaceId) => SURFACES.find((s) => s.id === id)!;
  const of = (id: SurfaceId, use: SurfaceUse, audience: SurfaceReport["audience"], offReason: string | null) => ({
    ...meta(id), use, audience, offReason,
  });

  return [
    of("landing", landingEnabled ? "on" : "off", landingEnabled ? "누구나" : "-",
      landingEnabled ? null : "랜딩 페이지 공개가 꺼져 있어요 — 링크·임베드 모두 비공개 안내만 보여요."),
    // canRegister 는 page.tsx 의 resolveWebinarStatus 가 준 값. 여기서 다시 계산하지 않는다.
    of("signup", input.canRegister === undefined ? "unknown" : input.canRegister ? "on" : "off",
      input.canRegister ? "누구나" : "-",
      input.canRegister === false ? "접수가 닫혀 있어요 — 마감 시각이 지났거나 ‘시작 시 마감’ 이에요." : null),
    /**
     * 대기·입장·종료는 **누구나** 닿는다. 예전 레일 점은 시청 화면을 통째로 "등록자만" 으로
     * 그렸는데 그건 면 단위로 거짓이다 — 히어로·카운트다운·아젠다는 등록 여부와 무관하게
     * 그려지고, 입장 확인은 애초에 미인증 방문자용 화면이다. '등록자만' 은 요소(영상·
     * 다시보기·시작 알림)의 속성이다.
     */
    of("waiting", "on", "누구나", null),
    of("entry", "on", "누구나", null),
    of("live", "on", "등록자", null),
    of("ended", "on", "누구나", null),
  ];
}

/**
 * 노출 리포트를 만든다.
 *
 * 랜딩 부분은 buildLandingModel 을 **그대로 호출**해서 얻는다 — 판정 사본을 만들지 않으려고.
 * 그 함수는 React/Next 를 import 하지 않는 순수 TS 라 어드민에서 부를 수 있고, 같은 픽스처로
 * 두 결론이 일치하는지 vitest 가 대조한다.
 */
export function buildExposureReport(input: ExposureInput): ExposureReport {
  const cfg = (input.config ?? {}) as Record<string, unknown>;
  const live = normalizeLivePageConfig(cfg);
  const reg = normalizeRegistrationForm(cfg, { includeDisabled: false });
  const comps = (input.components ?? {}) as Record<string, unknown>;

  const lm = buildLandingModel(
    {
      id: "", name: input.name, slug: input.slug, description: input.description,
      liveStartAt: input.liveStartAt, theme: input.theme, config: cfg,
      sessions: [...input.sessions],
      // 상태를 반드시 넘긴다 — 빠지면 buildLandingModel 이 '등록중' 을 가정해
      // 종료된 웨비나의 표가 '사전 등록하기' 를 그린다.
      status: input.status, entryOpen: input.entryOpen, canRegister: input.canRegister,
    },
    { uid: "exposure", embedded: false, isPreview: true, origin: "" },
  );
  // LandingModel 에는 enabled 가 없다(뷰가 그걸 몰라도 되게 설계돼 있다) — 정규화에서 읽는다.
  const lp = normalizeLandingPageConfig(cfg);
  const landingEnabled = lp.enabled;

  const rows: ElementRow[] = [];
  const add = (r: ElementRow) => rows.push(r);
  /** 토글 × 내용 → 상태. 기본값이 나가는 요소는 emptyState 를 "default" 로 넘긴다. */
  const gate = (
    on: boolean, hasContent: boolean, emptyWhy: string,
    emptyState: Extract<ElementState, "empty" | "default"> = "empty",
  ): { state: ElementState; why: string | null } =>
    !on ? { state: "off", why: null }
      : hasContent ? { state: "on", why: null }
        : { state: emptyState, why: emptyWhy };

  // ── 사실(원본 정보)이 여러 면으로 나가는 것 ──────────────────────────────
  // 종료 화면은 이름을 쓰지 않는다(자체 인사말 + 기본 문구만) — 실측으로 확인한 빈칸이다.
  add({ id: "name", label: "웨비나 이름", surfaces: ["landing", "signup", "waiting", "entry", "live"], owner: "source",
    blocks: true,
    ...(input.name.trim() ? { state: "on" as const, why: null } : { state: "empty" as const, why: "이름이 비면 모든 공개 화면의 제목이 비어요." }) });
  // 일시를 실제로 찍는 곳은 랜딩·대기(그리고 대기를 재사용하는 입장) 셋뿐이다.
  add({ id: "startAt", label: "라이브 일시", surfaces: ["landing", "waiting", "entry"], owner: "source", state: "on", why: null });
  add({ id: "brand", label: "브랜드 색", surfaces: ["landing", "signup", "waiting", "entry", "live", "ended"], owner: "source", state: "on", why: null });
  add({ id: "sessions", label: "진행 순서", surfaces: ["landing", "waiting", "entry", "live"], owner: "source",
    // 행이 하나라도 있으면 나간다 — 대기 아젠다·타임테이블은 유형을 가리지 않는다(연사 카드만 실제 세션).
    // 예전엔 `realSessions > 0 || sessions.length > 0` 이었는데 좌항이 우항에 포함돼 죽은 계산이었다.
    ...(input.sessions.length > 0
      ? { state: "on" as const, why: null }
      : { state: "empty" as const, why: "세션이 없으면 아젠다·타임테이블·세션 카드가 모두 사라져요." }) });

  // ── 랜딩 ────────────────────────────────────────────────────────────────
  /**
   * 랜딩 요소 — **토글 축과 내용 축을 갈라서** 받는다.
   *
   * 예전엔 `on` 하나만 받아 `lm.show*` 를 넘겼는데, 그 값은 이미 `enabled && hasItems` 라
   * 섹션을 **일부러 끈** 랜딩이 "켰지만 항목이 없어요" 라는 거짓 경고를 냈다(off 상태가 나올
   * 길이 아예 없었다). FAQ·하이라이트를 안 쓰는 정상 웨비나가 경고 3건을 받고 한 줄 판정도
   * 같이 거짓말했다. 그래서 sectionOn(그 섹션 토글)과 hasContent(내용 유무)를 따로 넘긴다.
   */
  const L = (id: string, label: string, sectionOn: boolean, hasContent: boolean, why: string): ElementRow => ({
    id: `landing.${id}`, label, surfaces: ["landing"], owner: "landing",
    ...(!landingEnabled || !sectionOn
      ? { state: "off" as const, why: null }
      : hasContent ? { state: "on" as const, why: null } : { state: "empty" as const, why }),
  });
  add(L("hero", "히어로", true, true, ""));
  add(L("intro", "소개", lp.intro.enabled, lm.showIntro, "소개를 켰지만 제목·본문이 모두 비어 있어요."));
  add(L("audience", "이런 분들께 추천합니다", lp.audience.enabled, lm.showAudience, "추천 대상을 켰지만 대상이 있는 항목이 없어요."));
  // 연사 카드·타임테이블은 섹션 토글이 없다 — 세션 표에서 파생되는 자리라 항상 켜져 있다.
  add(L("sessions", "연사 카드", true, lm.sessionCards.length > 0, "연사 카드에 표시할 세션이 없어요(오프닝·휴식·Q&A·클로징은 카드에서 빠져요)."));
  add(L("timetable", "타임테이블", true, lm.timetableRows.length > 0, "타임테이블에 표시할 세션이 없어요."));
  add(L("programs", "프로그램", lp.programs.enabled, lm.showPrograms, "프로그램을 켰지만 제목이 있는 항목이 없어요."));
  add(L("highlights", "하이라이트", lp.highlights.enabled, lm.showHighlights, "하이라이트를 켰지만 제목이 있는 항목이 없어요."));
  add(L("join", "참여 방법", lp.join.enabled, true, ""));
  add(L("faq", "FAQ", lp.faq.enabled, lm.showFaq, "FAQ를 켰지만 질문이 있는 항목이 없어요."));
  // 참여 방법은 이중 게이트의 유일한 예외 — 입력하지 않아도 기본 3스텝이 주입된다.
  const join = rows.find((r) => r.id === "landing.join")!;
  if (join.state === "on" && !Array.isArray((((cfg.landingPage ?? {}) as Record<string, unknown>).join as Record<string, unknown> | undefined)?.steps)) {
    join.state = "default";
    join.why = "입력하지 않아 기본 참여 절차 3단계가 나가요.";
  }

  // ── 등록 폼 ─────────────────────────────────────────────────────────────
  /**
   * 등록 폼은 **필드당 한 행**이다. 폼 전체로 한 행만 두면 "공개 폼에 항목이 하나라도 있나" 만
   * 답하는데, 기본 필드 7개가 늘 있어서 그 판정은 사실상 항상 on 이다 — 개별 항목이 조용히
   * 사라지는 것(선택지 0개인 선택형)을 잡을 칸이 없었다. 정본의 판정 단위도 필드다
   * (normalizeRegistrationForm 의 공개 필터가 필드마다 걸린다).
   *
   * includeDisabled 로 **끈 필드까지** 읽는 이유: 켠 필드가 선택지 0개로 사라지는 것을 잡으려면
   * 공개 필터가 이미 걸러낸 뒤의 목록으로는 알 수 없다(사라진 필드는 목록에 없다).
   */
  const allFields = normalizeRegistrationForm(cfg, { includeDisabled: true }).fields;
  for (const f of allFields) {
    const isChoice = CHOICE_FIELD_TYPES.includes(f.type);
    // 공개 폼 필터와 **같은 조건**이어야 한다 — 어긋나면 표가 없는 항목을 있다고 하거나 반대로 말한다.
    const droppedForNoOptions = isChoice && (f.options ?? []).length === 0 && f.allowOther !== true;
    add({
      id: `signup.field.${f.key}`, label: f.label || f.key, surfaces: ["signup"], owner: "registration",
      ...(f.enabled === false
        ? { state: "off" as const, why: null }
        : droppedForNoOptions
          ? { state: "empty" as const,
              why: f.required
                ? "선택지가 없어 항목이 폼에서 빠져요 — 필수로 켜 뒀지만 답을 한 건도 못 받아요."
                : "선택지가 없어 이 항목은 폼에 표시되지 않아요." }
          : { state: "on" as const, why: null }),
    });
  }
  add({ id: "signup.privacy", label: "개인정보 동의", surfaces: ["signup"], owner: "registration", state: "on", why: null });

  // ── 시청 화면 ───────────────────────────────────────────────────────────
  const W = (id: string, label: string, surfaces: SurfaceId[], watchState: ElementRow["watchState"], g: { state: ElementState; why: string | null }): ElementRow =>
    ({ id, label, surfaces, owner: "watch", watchState, ...g });

  add(W("waiting.agenda", "아젠다", ["waiting", "entry"], "waiting",
    gate(live.waiting.agenda, input.sessions.length > 0, "아젠다를 켰지만 세션이 없어요.")));
  add(W("waiting.calendar", "캘린더에 추가", ["waiting", "entry"], "waiting",
    gate(live.waiting.calendar, !!str(cfg.calendarUrl), "버튼을 켰지만 캘린더 URL이 없어요.")));
  add(W("waiting.share", "초대 공유", ["waiting", "entry"], "waiting", gate(live.waiting.share, true, "")));
  /**
   * 시작 알림은 **면마다 관객이 다르다** — 대기 화면에서는 등록자에게만 버튼이 가고
   * (onNotify={hasRegistration ? … : undefined}), 입장 확인 화면에서는 모두에게 간다.
   * 면 목록에 entry 가 빠져 있던 동안 표는 "대기 화면에만 나간다" 고 답했다.
   */
  add({ ...W("waiting.notify", "시작 알림 받기", ["waiting", "entry"], "waiting", gate(live.waiting.notify, true, "")),
    ...(live.waiting.notify ? { why: "대기 화면에서는 등록자에게만 보여요(입장 확인 화면에서는 누구나)." } : {}) });
  add({ ...W("waiting.social", "함께 기다리는 사람 수", ["waiting"], "waiting", { state: "broken", why: BROKEN["waiting.social"] }) });

  /**
   * 영상은 "값이 있나" 가 아니라 **뷰어가 파싱할 수 있나** 로 판정한다.
   * 뷰어는 getYouTubeVideoId 로 11자 ID 를 뽑아내야 iframe 을 그리고, 못 뽑으면 포스터만 띄운다.
   * 빈 문자열만 보던 동안 `youtube.com/@brand/live` 같은 값이 초록 'on' 으로 읽혔고
   * 운영자는 영상이 연결된 줄 알고 방송에 들어갔다. blocks — 시청자 여정이 여기서 끊긴다.
   */
  add({ ...W("live.video", "라이브 영상", ["live"], "live",
    gate(true, !!getYouTubeVideoId(str(cfg.youtubeId)),
      str(cfg.youtubeId)
        ? "영상 주소에서 유튜브 ID를 읽지 못했어요 — 시청자에게는 포스터만 보여요."
        : "영상이 연결되지 않아 방송이 시작돼도 화면에 아무것도 안 나와요.")), blocks: true });
  add(W("live.chat", "채팅 탭", ["live"], "live", gate(comps.chatEnabled === true, true, "")));
  add({ ...W("live.infoContact", "문의처", ["live"], "live", { state: "broken", why: BROKEN["live.infoContact"] }) });
  /**
   * ⚠ 예전엔 `livePage.lpNotice` 를 읽었다. 그건 **편집 폼의 필드 이름**이고 저장 키는
   * `livePage.notice` 다(LivePageTab: `lp.notice = form.lpNotice.trim()`). 그래서 이 행은
   * 값이 있어도 언제나 undefined 를 읽어 "비우면 기본 문구가 나가요" 를 말했다 —
   * 직접 쓴 문구가 있는 웨비나와 없는 웨비나를 표가 구분하지 못했다. 뷰어는 `live.notice` 를 읽는다.
   */
  add(W("live.notice", "안내 문구", ["live"], "live",
    gate(true, !!str((cfg.livePage as Record<string, unknown> | undefined)?.notice), "비우면 기본 안내 문구가 나가요.", "default")));

  add(W("ended.title", "종료 인사말", ["ended"], "ended",
    gate(true, !!live.ended.title.trim(), "비우면 기본 인사말이 나가요.", "default")));
  // 다시보기 버튼은 등록 이메일이 있어야 보낼 수 있어 미등록 방문자에게는 아예 없다 —
  // 면 audience 는 '누구나' 지만 이 요소는 그렇지 않다(요소 단위 제약은 요소 행이 말한다).
  add({ ...W("ended.replay", "다시보기 신청", ["ended"], "ended", gate(live.ended.replay, true, "")),
    ...(live.ended.replay ? { why: "등록자에게만 보여요 — 종료 후 처음 들어온 방문자에게는 카드가 없어요." } : {}) });
  add(W("ended.resources", "자료 다운로드", ["ended"], "ended",
    gate(live.ended.resources, live.resources.length > 0, "자료 영역을 켰지만 자료가 없어요.")));
  add(W("ended.nextWebinar", "다음 웨비나", ["ended"], "ended",
    gate(live.ended.nextWebinar, !!str(live.nextWebinar?.title), "다음 웨비나를 켰지만 제목이 없어요.")));
  add(W("ended.share", "공유", ["ended"], "ended", gate(live.ended.share, true, "")));

  // ── 설문 — 면이 아니라 횡단 요소다 ──────────────────────────────────────
  // 모르는 값(fetch 중·실패)은 empty 로 단정하지 않는다. 열린 설문을 '없음' 으로
  // 오답하면 이 화면이 스스로 세운 규칙("모르는 값은 점을 안 그린다")을 깬다.
  const surveyLinked = input.hasLinkedEndedSurvey;
  add({
    id: "ended.survey", label: "설문 참여 버튼", surfaces: ["ended"], owner: "survey", watchState: "ended",
    ...(!live.ended.survey
      ? { state: "off" as const, why: null }
      : surveyLinked === null
        ? { state: "on" as const, why: "연결된 설문을 확인하는 중이에요." }
        : surveyLinked || !!str(cfg.surveyUrl)
          ? { state: "on" as const, why: null }
          : { state: "empty" as const, why: "설문 영역을 켰지만 연결된 설문이 없어요." }),
  });

  const emptyCount = rows.filter((r) => r.state === "empty").length;
  const brokenCount = rows.filter((r) => r.state === "broken").length;
  return { surfaces: buildSurfaces(input, landingEnabled), elements: rows, emptyCount, brokenCount };
}

/** Blk 의 goes 태그를 자유 문자열이 아니라 이 표에서 가져온다 — 없는 면을 약속할 수 없게. */
export function goesFor(...ids: SurfaceId[]): string[] {
  return ids.map((id) => SURFACES.find((s) => s.id === id)!.label);
}
