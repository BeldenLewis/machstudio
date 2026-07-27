// 웨비나 config(JSON) 정규화 — 단일 정의.
// registrationForm 정규화가 live 페이지 / RegistrationFormTab / register 라우트 / EmbedTab 4곳에
// 중복돼 있던 것을 이 파일로 수렴한다. (UI 파일들의 마이그레이션은 어드민 재편 Phase 에서)
//
// - 공개/제출 경로: normalizeRegistrationForm(config)            → enabled 필드만
// - 어드민 편집 경로: normalizeRegistrationForm(config, { includeDisabled: true }) → 전체 필드

/**
 * 등록 폼 필드 유형.
 *
 * checkbox 와 multiple 은 다른 물건이다:
 *   checkbox — 체크 하나(동의용). 값은 "예/아니오" 성격이고 required 면 체크를 요구한다.
 *   multiple — 선택지 여러 개에서 **복수 선택**. 값은 고른 항목들을 합친 문자열이다.
 * 이름을 나누는 이유: 기존 checkbox 로 저장된 동의 필드가 이미 있어서 의미를 바꿀 수 없다.
 */
export type WebinarFieldType = "text" | "email" | "tel" | "select" | "checkbox" | "multiple";

export interface WebinarRegistrationField {
  id: string;
  key: string;
  label: string;
  type: WebinarFieldType;
  placeholder: string;
  required: boolean;
  enabled: boolean;
  options: string[];
  system: boolean;
  /**
   * multiple 전용 — 최대 선택 개수. 없으면 무제한.
   * 설문(webinar-survey.ts)의 maxSelect 와 같은 계약을 쓴다: 1 이상, 옵션 수보다 작을 때만
   * 의미가 있다(옵션 전체 이상이면 무제한과 같아서 저장하지 않는다).
   */
  maxSelect?: number;
  /**
   * select·multiple 전용 — '기타(직접입력)' 선택지를 켠다.
   *
   * 켜면 공개 폼에 선택지 맨 아래 "기타" 가 하나 더 생기고, 고르면 자유 입력칸이 함께 뜬다.
   * 저장 값에는 어드민이 정한 선택지가 아니라 **사용자가 쓴 문장**이 들어간다 — 그래서
   * 서버가 값을 선택지 목록과 대조해 거부할 수 없다(그 검증을 넣으면 기타 답이 전부 막힌다).
   */
  allowOther?: boolean;
}

export interface WebinarRegistrationFormConfig {
  fields: WebinarRegistrationField[];
  privacyText: string;
  marketingText: string;
  /** 동의 문구 클릭 시 팝업으로 보여줄 약관 전문 — 비어 있으면 팝업 없음 */
  privacyBody: string;
  marketingBody: string;
  /** 폼 진입 시 동의 체크박스를 기본으로 체크해둘지 — 사용자가 직접 만지면 그 값이 우선한다 */
  privacyDefaultChecked: boolean;
  marketingDefaultChecked: boolean;
  submitLabel: string;
}

const FIELD_TYPES: readonly WebinarFieldType[] = ["text", "email", "tel", "select", "checkbox", "multiple"];

/**
 * 복수 선택 답변을 한 문자열로 합친다 / 되읽는다.
 *
 * 왜 배열이 아니라 문자열인가: 등록 답변은 customFields JSON 에 들어가고 register 라우트가
 * 중첩 객체·배열을 거부한다(임의 구조가 그대로 직렬화돼 저장된 전례가 있어 막아 뒀다).
 * 그리고 CSV export·등록자 상세·임베드 로더가 전부 값을 문자열로 다룬다. 그 계약을 깨지 않고
 * 복수 선택을 담으려면 합친 문자열이 맞다.
 *
 * 구분자는 ", " — 사람이 CSV 에서 그대로 읽을 수 있어야 한다. 선택지 자체에 쉼표가 들어가면
 * 되읽을 때 쪼개지지만, 그건 **개수 검증에만** 쓰이고 저장된 원문은 그대로 보존된다.
 */
export const MULTI_VALUE_SEPARATOR = ", ";

export function joinMultiValue(values: readonly string[]): string {
  return values.map((v) => v.trim()).filter(Boolean).join(MULTI_VALUE_SEPARATOR);
}

export function splitMultiValue(value: unknown): string[] {
  return typeof value === "string"
    ? value.split(",").map((v) => v.trim()).filter(Boolean)
    : [];
}

/** 선택지를 쓰는 유형 — 옵션 0개 게이트·기타 허용·최대 개수가 여기 걸린다. */
export const CHOICE_FIELD_TYPES: readonly WebinarFieldType[] = ["select", "multiple"];

/** 선택지를 몇 개까지 고를 수 있나. 무제한이면 null. */
export function maxSelectFor(field: Pick<WebinarRegistrationField, "type" | "maxSelect" | "options">): number | null {
  if (field.type !== "multiple") return null;
  const n = Number(field.maxSelect);
  return Number.isInteger(n) && n >= 1 && n < field.options.length ? n : null;
}

// ── 연락처 정규화·유효성 — 등록/중복확인/입장확인/임베드 로더의 단일 규칙 ──
// 레이어마다 임계값이 달라지는 드리프트 방지: 규칙 변경은 반드시 여기서만.
export const PHONE_MIN_DIGITS = 10;
export const PHONE_MAX_DIGITS = 15;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizePhone(value: unknown): string | null {
  const digits = String(value ?? "").replace(/[^0-9]/g, "");
  return digits || null;
}

export function normalizeEmail(value: unknown): string | null {
  const text = String(value ?? "").trim().toLowerCase();
  return text || null;
}

export function isValidPhone(digits: string): boolean {
  return digits.length >= PHONE_MIN_DIGITS && digits.length <= PHONE_MAX_DIGITS;
}

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email) && email.length <= 320;
}

// ── Q&A 공개 범위 ──
// components.qaMode 에 저장(chatEnabled 와 같은 자리 — 라이브 중에도 콘솔에서 바꾸는 운영 스위치라서).
//  open   = 시청자끼리 올라온 질문을 서로 보고 추천할 수 있다 (기존 동작)
//  closed = 질문은 주최자만 본다. 시청자에겐 질문하기 입력만 남는다.
// 기본값은 open — 기존 웨비나의 동작이 조용히 바뀌면 안 된다.
export type QaMode = "open" | "closed";

/**
 * 폐쇄형은 **서버에서** 막아야 한다. 뷰어에서 목록만 숨기면 /live-state 응답과 공개 GET /qa 에
 * 남의 질문이 그대로 실려 나가므로(개발자도구로 그대로 보인다) UI 게이팅은 게이팅이 아니다.
 */
export function normalizeQaMode(components: unknown): QaMode {
  const c = components && typeof components === "object" && !Array.isArray(components)
    ? (components as Record<string, unknown>)
    : {};
  return c.qaMode === "closed" ? "closed" : "open";
}

// ── 라이브 페이지 화면(대기·입장·종료) 구성 — 섹션별 on/off + 자료·넥스트 데이터 ──
// config.livePage 에 저장(JSON blob, 마이그레이션 불필요). 데이터가 없으면 토글이 켜져 있어도 뷰어에서 자동 숨김.
export interface LiveResource { title: string; meta: string; url: string }
export interface LiveNextWebinar { title: string; when: string; url: string }

/** 종료 화면 기본 문구 — 어드민이 비워 두면 이 값이 쓰인다(뷰어·미리보기 공통). */
export const DEFAULT_ENDED_TITLE = "함께해주셔서\n감사합니다";
export const DEFAULT_ENDED_DESCRIPTION =
  "오늘 라이브는 마무리됐어요. 다시보기와 자료를 준비해 등록하신 이메일로 보내드릴게요.";

export interface LivePageConfig {
  waiting: { agenda: boolean; social: boolean; calendar: boolean; share: boolean; notify: boolean };
  entry: { viewerCount: boolean };
  ended: {
    replay: boolean; survey: boolean; resources: boolean; nextWebinar: boolean; share: boolean;
    /** 종료 화면 인사말. 빈 문자열이면 DEFAULT_ENDED_TITLE. 줄바꿈을 그대로 살려 렌더한다. */
    title: string;
    /** 인사말 아래 설명. 빈 문자열이면 DEFAULT_ENDED_DESCRIPTION. */
    description: string;
  };
  resources: LiveResource[];
  nextWebinar: LiveNextWebinar | null;
}

export function normalizeLivePageConfig(config: unknown): LivePageConfig {
  const c = config && typeof config === "object" && !Array.isArray(config) ? (config as Record<string, unknown>) : {};
  const lp = c.livePage && typeof c.livePage === "object" ? (c.livePage as Record<string, unknown>) : {};
  const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
  const bool = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);
  const w = obj(lp.waiting), e = obj(lp.entry), en = obj(lp.ended);

  const resources: LiveResource[] = Array.isArray(lp.resources)
    ? (lp.resources as unknown[])
        .map((r) => obj(r))
        .filter((r) => typeof r.url === "string" && (r.url as string).trim())
        .map((r) => ({ title: String(r.title ?? "자료"), meta: String(r.meta ?? ""), url: String(r.url) }))
    : [];

  const nwRaw = obj(lp.nextWebinar);
  const nextWebinar: LiveNextWebinar | null =
    typeof nwRaw.title === "string" && (nwRaw.title as string).trim()
      ? { title: String(nwRaw.title), when: String(nwRaw.when ?? ""), url: String(nwRaw.url ?? "") }
      : null;

  return {
    waiting: {
      agenda: bool(w.agenda, true),
      social: bool(w.social, true),
      calendar: bool(w.calendar, true),
      share: bool(w.share, true),
      notify: bool(w.notify, true),
    },
    entry: { viewerCount: bool(e.viewerCount, true) },
    ended: {
      replay: bool(en.replay, true),
      survey: bool(en.survey, true),
      resources: bool(en.resources, false), // 자료는 파일이 없을 수 있어 기본 OFF
      nextWebinar: bool(en.nextWebinar, false), // 다음 웨비나 없을 수 있어 기본 OFF
      share: bool(en.share, true),
      // 문구는 기본값을 여기서 채우지 않는다. 빈 값을 그대로 통과시켜 뷰어가 기본 문구를 쓰게 해야,
      // 나중에 기본 문구를 고치면 "저장 안 한 웨비나"에도 같이 반영된다(저장 시점 값이 굳지 않게).
      title: typeof en.title === "string" ? en.title : "",
      description: typeof en.description === "string" ? en.description : "",
    },
    resources,
    nextWebinar,
  };
}

// ── 랜딩 페이지(외부 사이트 임베드용 상세페이지) — config.landingPage ──
// 섹션은 "토글 ON + 실제 데이터 있음" 이중 게이트로만 노출된다(빈 껍데기 금지).
// 세션·타임테이블 데이터는 여기 저장하지 않고 실제 세션(webinar.sessions)에서 파생한다.
export interface LandingProgramItem { icon: string; title: string; description: string }
export interface LandingHighlightItem { title: string; description: string }
export interface LandingJoinStep { title: string; description: string }
export interface LandingFaqItem { category: string; question: string; answer: string }
export type LandingHeroMedia = { type: "image" | "video"; url: string } | null;

export interface LandingPageConfig {
  enabled: boolean;
  heroMedia: LandingHeroMedia;
  /** 히어로 상단 작은 브랜드 라벨 — 비우면 웨비나 이름 */
  brand: string;
  /** 히어로 대형 타이틀(줄 단위) — 비우면 웨비나 이름 한 줄 */
  titleLines: string[];
  /** 히어로 부제 — 비우면 웨비나 설명 첫 줄 */
  subtitle: string;
  /** 일시 옆 라벨 (예: ONLINE LIVE) */
  venue: string;
  ctaLabel: string;
  intro: { enabled: boolean; title: string; body: string };
  /** detailPopup: 세션 카드 클릭 시 연사 상세(주제·내용·사진·소속·약력) 팝업 열기 */
  sessions: { enabled: boolean; detailPopup: boolean };
  timetable: { enabled: boolean };
  programs: { enabled: boolean; items: LandingProgramItem[] };
  highlights: { enabled: boolean; items: LandingHighlightItem[] };
  join: { enabled: boolean; steps: LandingJoinStep[] };
  faq: { enabled: boolean; items: LandingFaqItem[] };
}

/** 온라인 웨비나 공통 참여 절차 — 사실 기반 기본값(어드민이 자유 수정) */
export const DEFAULT_LANDING_JOIN_STEPS: LandingJoinStep[] = [
  { title: "사전 등록", description: "이름과 연락처만 남기면 등록 완료.\n시작 전 입장 안내를 보내드려요." },
  { title: "입장 확인", description: "라이브 당일 등록한 연락처로\n본인 확인 후 바로 입장할 수 있어요." },
  { title: "라이브 시청", description: "실시간 Q&A와 채팅으로\n궁금한 점을 그 자리에서 해결하세요." },
];

// 공개 페이지에 들어가는 URL 은 http(s)만 — javascript: 등 스킴이 임베드된 외부 사이트에서 실행되는 것을 차단.
export function safeHttpUrl(value: unknown): string {
  const url = String(value ?? "").trim();
  if (!url) return "";
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? url : "";
  } catch {
    return "";
  }
}

export function normalizeLandingPageConfig(
  config: unknown,
  opts?: { keepEmptyRows?: boolean },
): LandingPageConfig {
  const c = config && typeof config === "object" && !Array.isArray(config) ? (config as Record<string, unknown>) : {};
  const lp = c.landingPage && typeof c.landingPage === "object" && !Array.isArray(c.landingPage)
    ? (c.landingPage as Record<string, unknown>)
    : {};
  const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  const bool = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  // keep 필터는 **공개 렌더용**이다(제목 없는 행을 시청자에게 그리지 않는다).
  // 어드민 편집에서 이걸 그대로 쓰면, 아직 제목을 안 쓴 행이 리마운트 때 사라지고
  // 다음 자동저장이 그 배열을 그대로 덮어써 DB 에서도 영구 소실된다 → keepEmptyRows 로 끈다.
  const keepEmpty = opts?.keepEmptyRows === true;
  const rows = <T>(v: unknown, map: (r: Record<string, unknown>) => T, keep: (t: T) => boolean): T[] =>
    Array.isArray(v) ? (v as unknown[]).map((r) => map(obj(r))).filter((t) => keepEmpty || keep(t)) : [];

  const mediaRaw = obj(lp.heroMedia);
  const mediaUrl = safeHttpUrl(mediaRaw.url);
  const heroMedia: LandingHeroMedia = mediaUrl
    ? { type: mediaRaw.type === "video" ? "video" : "image", url: mediaUrl }
    : null;

  const intro = obj(lp.intro);
  const programs = obj(lp.programs);
  const highlights = obj(lp.highlights);
  const join = obj(lp.join);
  const faq = obj(lp.faq);

  return {
    enabled: bool(lp.enabled, false),
    heroMedia,
    brand: str(lp.brand),
    titleLines: Array.isArray(lp.titleLines) ? (lp.titleLines as unknown[]).map(String).filter((s) => s.trim() !== "") : [],
    subtitle: str(lp.subtitle),
    venue: str(lp.venue) || "ONLINE LIVE",
    ctaLabel: str(lp.ctaLabel) || "사전 등록하기",
    intro: { enabled: bool(intro.enabled, true), title: str(intro.title), body: str(intro.body) },
    sessions: { enabled: bool(obj(lp.sessions).enabled, true), detailPopup: bool(obj(lp.sessions).detailPopup, true) },
    timetable: { enabled: bool(obj(lp.timetable).enabled, true) },
    programs: {
      enabled: bool(programs.enabled, true),
      items: rows(
        programs.items,
        (r) => ({ icon: str(r.icon), title: str(r.title), description: str(r.description) }),
        (r) => r.title.trim() !== "",
      ),
    },
    highlights: {
      enabled: bool(highlights.enabled, true),
      items: rows(
        highlights.items,
        (r) => ({ title: str(r.title), description: str(r.description) }),
        (r) => r.title.trim() !== "",
      ),
    },
    join: {
      enabled: bool(join.enabled, true),
      steps: Array.isArray(join.steps)
        ? rows(join.steps, (r) => ({ title: str(r.title), description: str(r.description) }), (r) => r.title.trim() !== "")
        : DEFAULT_LANDING_JOIN_STEPS,
    },
    faq: {
      enabled: bool(faq.enabled, true),
      items: rows(
        faq.items,
        (r) => ({ category: str(r.category).trim() || "일반", question: str(r.question), answer: str(r.answer) }),
        (r) => r.question.trim() !== "",
      ),
    },
  };
}

export const DEFAULT_REGISTRATION_FIELDS: WebinarRegistrationField[] = [
  { id: "name", key: "name", label: "이름", type: "text", placeholder: "홍길동", required: true, enabled: true, options: [], system: true },
  { id: "phone", key: "phone", label: "연락처", type: "tel", placeholder: "01012345678", required: false, enabled: true, options: [], system: true },
  { id: "email", key: "email", label: "이메일", type: "email", placeholder: "hong@example.com", required: false, enabled: true, options: [], system: true },
  { id: "company", key: "company", label: "회사명", type: "text", placeholder: "", required: false, enabled: true, options: [], system: true },
  { id: "department", key: "department", label: "부서", type: "text", placeholder: "", required: false, enabled: true, options: [], system: true },
  { id: "jobTitle", key: "jobTitle", label: "직함", type: "text", placeholder: "", required: false, enabled: true, options: [], system: true },
  { id: "industry", key: "industry", label: "업종", type: "text", placeholder: "", required: false, enabled: true, options: [], system: true },
];

/**
 * 선택형 필드의 부가 값(maxSelect·allowOther)만 따로 정규화한다.
 *
 * maxSelect 는 옵션 수보다 작을 때만 저장한다 — 옵션 전체 이상이면 "최대 3개" 라고 적혀 있는데
 * 실제로는 아무 제한이 없는 상태가 되고, 그 문구가 화면에 그대로 나간다(설문과 같은 규칙).
 * 두 값 모두 없으면 키를 아예 넣지 않는다 — config JSON 에 undefined 를 남기지 않으려고.
 */
function normalizeChoiceExtras(
  saved: { maxSelect?: unknown; allowOther?: unknown } | undefined,
  optionCount: number,
): { maxSelect?: number; allowOther?: boolean } {
  const out: { maxSelect?: number; allowOther?: boolean } = {};
  const raw = Number(saved?.maxSelect);
  if (Number.isInteger(raw) && raw >= 1 && raw < optionCount) out.maxSelect = raw;
  if (saved?.allowOther === true) out.allowOther = true;
  return out;
}

function normalizeFieldType(value: unknown): WebinarFieldType {
  return FIELD_TYPES.includes(value as WebinarFieldType) ? (value as WebinarFieldType) : "text";
}

export function normalizeRegistrationForm(
  config: unknown,
  opts?: { includeDisabled?: boolean },
): WebinarRegistrationFormConfig {
  const configRaw =
    config && typeof config === "object" && !Array.isArray(config)
      ? (config as Record<string, unknown>)
      : {};
  const raw = configRaw.registrationForm as Partial<WebinarRegistrationFormConfig> | undefined;
  const savedFields = Array.isArray(raw?.fields) ? (raw.fields as Array<Partial<WebinarRegistrationField> & { key?: unknown }>) : [];

  const merged = DEFAULT_REGISTRATION_FIELDS.map((field) => {
    const saved = savedFields.find((item) => item && item.key === field.key);
    return {
      ...field,
      ...(saved ?? {}),
      id: field.id,
      key: field.key,
      type: saved?.type != null ? normalizeFieldType(saved.type) : field.type,
      // 빈 옵션은 그릴 수 없다 — 편집 중 자동저장으로 빈 행이 저장돼도 읽기에서 걸러
      // 공개 폼에 빈 드롭다운 항목이 뜨거나(중복 key) 필수 검증이 등록을 막는 일을 방지.
      options: Array.isArray(saved?.options) ? saved.options.map(String).filter((s) => s.trim() !== "") : field.options,
      ...normalizeChoiceExtras(saved, Array.isArray(saved?.options) ? saved.options.length : field.options.length),
      system: true,
    } satisfies WebinarRegistrationField;
  });

  const customFields = savedFields
    .filter((item) => item && !DEFAULT_REGISTRATION_FIELDS.some((field) => field.key === item.key))
    .map((item, index) => ({
      id: String(item.id ?? item.key ?? `custom_${index}`),
      key: String(item.key ?? `custom_${index}`),
      label: String(item.label ?? item.key ?? "커스텀 필드"),
      type: normalizeFieldType(item.type),
      placeholder: String(item.placeholder ?? ""),
      required: Boolean(item.required),
      enabled: item.enabled !== false,
      options: Array.isArray(item.options) ? item.options.map(String).filter((s) => s.trim() !== "") : [],
      ...normalizeChoiceExtras(item, Array.isArray(item.options) ? item.options.length : 0),
      system: false,
    } satisfies WebinarRegistrationField));

  // 레거시 기본 placeholder 만 새 기본 예시로 교체 — "01000000000" 은 옛 기본값("010-0000-0000")이
  // 과거 읽기시점 정규화로 손상돼 재저장된 값(전부 0이라 실제 안내 문구일 수 없음).
  // 커스텀 안내 문구는 어드민이 정한 그대로 보존한다 — 하이픈 제거는 입력 '값'에만 적용되는 규칙이다.
  const fields = [...merged, ...customFields].map((field) =>
    field.key === "phone" && (field.placeholder === "010-0000-0000" || field.placeholder === "01000000000")
      ? { ...field, placeholder: "01012345678" }
      : field,
  );

  // 저장된 배열 순서를 존중(어드민에서 드래그로 변경). 저장에 없는 필드는 기본 순서대로 뒤에.
  const savedOrder = new Map(savedFields.map((item, index) => [item?.key, index]));
  fields.sort(
    (a, b) =>
      ((savedOrder.get(a.key) as number | undefined) ?? Number.MAX_SAFE_INTEGER) -
      ((savedOrder.get(b.key) as number | undefined) ?? Number.MAX_SAFE_INTEGER),
  );

  return {
    /**
     * 공개 화면에서는 비활성 필드와 **선택지 0개인 선택형**을 제외한다.
     * 그릴 수 없는 항목을 필수로 두면 등록 자체가 막히기 때문이다(드롭다운·복수 선택 공통).
     * 단, '기타(직접입력)' 이 켜져 있으면 선택지가 없어도 자유 입력으로 답할 수 있으므로 남긴다.
     */
    fields: opts?.includeDisabled
      ? fields
      : fields.filter((field) =>
          field.enabled !== false
          && !(CHOICE_FIELD_TYPES.includes(field.type) && !(field.options ?? []).length && field.allowOther !== true)),
    privacyText: typeof raw?.privacyText === "string" ? raw.privacyText : "[필수] 개인정보 수집 및 이용에 동의합니다",
    marketingText: typeof raw?.marketingText === "string" ? raw.marketingText : "[선택] 마케팅 정보 수신에 동의합니다",
    privacyBody: typeof raw?.privacyBody === "string" ? raw.privacyBody : "",
    marketingBody: typeof raw?.marketingBody === "string" ? raw.marketingBody : "",
    privacyDefaultChecked: raw?.privacyDefaultChecked === true,
    marketingDefaultChecked: raw?.marketingDefaultChecked === true,
    submitLabel: typeof raw?.submitLabel === "string" ? raw.submitLabel : "사전 등록하기",
  };
}
