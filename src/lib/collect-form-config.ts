/**
 * 빌더형 수집 소스(CollectSource.mode === "builder")의 폼 정의 한 곳.
 *
 * **이 파일은 임베드 런타임과 서버가 함께 읽는다.** 검증을 양쪽에 따로 쓰면 반드시 갈라진다 —
 * 브라우저에서는 통과하는데 서버가 400 을 주거나, 반대로 서버가 무르면 클라이언트만 믿게 된다.
 * 그래서 스키마·정규화·검증이 전부 여기 있고, 라우트와 번들이 같은 함수를 부른다(설계 §19).
 *
 * React·Next 에 의존하지 않는다(브라우저 번들에 그대로 들어간다).
 *
 * ── 정규화가 왜 필요한가 ──────────────────────────────────────────────
 * formConfig 는 JSONB 라 스키마 강제가 없다. 빌더가 자동저장하는 중간 상태, 예전 버전이 저장한
 * 모양, 손으로 고친 값이 전부 들어올 수 있다. 읽는 쪽에서 한 번 정규화해 **화면·검증이 항상
 * 같은 모양을 보게** 한다(웨비나 normalizeRegistrationForm 과 같은 계약).
 */

// ── 다국어 ────────────────────────────────────────────────────────────
/**
 * 라벨은 처음부터 로케일 맵으로 저장한다. 지금은 영어 단일이지만, 나중에 다국어를 얹을 때
 * 저장된 값을 통째로 마이그레이션하지 않아도 되게 하려는 것이다(설계 §11).
 * 예전 단일 문자열은 읽을 때 `{ [defaultLocale]: value }` 로 승격한다 — 아래 toLocalized.
 */
export type Localized = Record<string, string>;

export const DEFAULT_LOCALE = "en";

/** 문자열이든 로케일 맵이든 받아 맵으로 통일한다. 값이 없으면 빈 맵. */
export function toLocalized(value: unknown, locale: string = DEFAULT_LOCALE): Localized {
  // 문자열도 반드시 trim 한다 — 공백뿐인 값("  ")을 그냥 두면 truthy 라 살아남아서
  // 선택지 필터를 통과하고 공개 폼에 **빈 드롭다운 줄**이 생긴다(객체 분기와 규칙을 맞춘다).
  if (typeof value === "string") {
    const s = value.trim();
    return s ? { [locale]: s } : {};
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const out: Localized = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const s = String(v ?? "").trim();
      if (s) out[k] = s;
    }
    return out;
  }
  return {};
}

/**
 * 표시할 문자열 하나를 고른다. **폴백 사슬**: 요청 로케일 → 기본 로케일 → 채워진 첫 값.
 * 번역이 비었다고 화면이 비면 안 된다 — 빈 라벨은 사용자에게 "고장" 으로 보인다.
 */
export function localize(value: Localized | undefined, locale = DEFAULT_LOCALE): string {
  if (!value) return "";
  return value[locale] ?? value[DEFAULT_LOCALE] ?? Object.values(value)[0] ?? "";
}

// ── 항목 ──────────────────────────────────────────────────────────────
/** 웨비나 등록 폼과 **같은 유형 어휘**를 쓴다 — 빌더 컴포넌트를 공용화하기 위해서다. */
export type CollectFieldType = "text" | "email" | "tel" | "select" | "checkbox" | "multiple";

const FIELD_TYPES: readonly CollectFieldType[] = ["text", "email", "tel", "select", "checkbox", "multiple"];

export interface CollectField {
  id: string;
  /** 저장 키. CollectRecord.data 의 키가 된다 — 한 번 정하면 바꾸지 않는다(기존 레코드와 어긋난다). */
  key: string;
  label: Localized;
  type: CollectFieldType;
  placeholder: Localized;
  required: boolean;
  enabled: boolean;
  /** select·multiple 의 선택지. 빈 문자열은 걸러진다(빈 드롭다운 항목 방지). */
  options: Localized[];
  /** multiple 전용 — 최대 선택 개수. 옵션 수 이상이면 무제한과 같아 저장하지 않는다. */
  maxSelect?: number;
  /** select·multiple 전용 — '기타(직접입력)'. 켜면 저장 값이 선택지 밖 자유 문장이 된다. */
  allowOther?: boolean;
}

/**
 * 유형 분기 — **폼당 하나**(설계 §16).
 *
 * 분기 기준은 별도 항목이 아니라 **일반 항목 중 하나**(보통 select)다. 그 항목에서 값을 고르면
 * 해당 그룹의 문항이 **그 항목 바로 아래**에 삽입된다(§4). 유형을 바꾸면 이전 그룹 문항은
 * 사라지되 공통 입력값은 남는다 — 그 동작은 렌더러 몫이고 여기서는 정의만 든다.
 */
export interface CollectBranch {
  enabled: boolean;
  /** 기준이 되는 항목의 key. 비었거나 없는 key 면 분기가 꺼진 것으로 읽는다. */
  fieldKey: string;
  groups: Array<{ value: string; fields: CollectField[] }>;
}

// ── 행사 개요 ─────────────────────────────────────────────────────────
/**
 * 표시용이 아니라 **동작하는 데이터**(설계 §5.1). 개최 기간은 현장 체크인의 일자 판정에 쓰이고,
 * 사전등록 기간은 **폼을 자동으로 열고 닫는다.** 그래서 개요를 한 곳에 두고 폼·완료·티켓·이메일이
 * 같은 소스를 렌더한다 — 페이지마다 복사돼 있으면 날짜가 바뀔 때 또 여러 곳을 고친다.
 */
export interface CollectEventInfo {
  enabled: boolean;
  /** ["2026-10-22", "2026-10-23"] — 현장 체크인의 일자 판정 키. */
  eventDates: string[];
  openingHours: Array<{ date: string; open: string; close: string; lastEntrance: string }>;
  venue: Localized;
  /** ISO. null 이면 그 방향으로 제한 없음(열려 있음). */
  registrationWindow: { opensAt: string | null; closesAt: string | null };
  extraRows: Array<{ label: Localized; value: Localized }>;
}

// ── 안내 블록 ─────────────────────────────────────────────────────────
export type NoticePlacement = "top" | "above-consent" | "bottom" | "completion" | "email";
export type NoticeMode = "notice" | "checkbox-optional" | "checkbox-required";

const NOTICE_PLACEMENTS: readonly NoticePlacement[] = ["top", "above-consent", "bottom", "completion", "email"];
const NOTICE_MODES: readonly NoticeMode[] = ["notice", "checkbox-optional", "checkbox-required"];

/**
 * 초상권 안내 등. **mode 만 바꾸면 안내 → 동의로 승격**되게 설계했다 —
 * LA(미국)는 고지 + 사후 삭제 대응이 통상이지만, 파리는 droit à l'image 때문에 사전 동의가
 * 필요하다는 것이 통설이라 전시마다 갈린다(설계 §5.3). 코드를 고치지 않고 설정으로 넘긴다.
 */
export interface CollectNotice {
  id: string;
  enabled: boolean;
  placement: NoticePlacement;
  title: Localized;
  /** 줄바꿈을 보존해 표시한다(AGENTS.md). */
  body: Localized;
  mode: NoticeMode;
  /** 길면 접고 "자세히". */
  collapsible: boolean;
}

// ── 검증·동의·완료·등록 확인 ──────────────────────────────────────────
export interface CollectValidation {
  /** 연락처 기본 국가(ISO 3166-1 alpha-2). LA 파일럿은 "US". */
  defaultCountry: string;
  /** 이메일 중복이면 등록을 막는다. 지금은 block 만 쓴다 — allow 는 유료 전시에서 재검토. */
  onDuplicate: "block" | "allow";
}

export interface CollectConsentItem {
  enabled: boolean;
  label: Localized;
  /** "자세히" 팝업 본문. 줄바꿈 보존. */
  body: Localized;
  /**
   * 기본 체크. **기본값 false 다**(설계 §7).
   * 필수 동의는 어차피 체크해야 제출되므로 사전 체크의 실익이 없고, GDPR 관할(파리)에서는
   * 사전 체크가 유효한 동의로 인정되지 않는다. 빌더에서 켜면 경고를 띄운다.
   */
  defaultChecked: boolean;
}

export interface CollectCompletion {
  /**
   * 플레이스홀더 `{type}` `{regNo}` `{rid}` `{lang}`.
   * **비우면 이동하지 않고** 폼 자리에 완료 카드(QR 포함)를 그린다 — 이메일 연동 전에는
   * 이 화면이 등록자가 QR 을 받는 첫 경로다(설계 §2·§8).
   */
  redirectUrlTemplate: string;
  /** 완료 화면에 QR·등록번호를 보여준다. */
  showQr: boolean;
}

/**
 * 등록 확인(Find My QR) — 설계 §10.
 * 무료 전시는 `or`(둘 중 하나만 맞아도 열림)가 합리적이다. 티켓에 금전 가치가 없어 남의 티켓을
 * 얻을 동기가 약한 반면 조회 편의가 문의 응대를 크게 줄인다. **유료로 전환하면 `and`** 로 올린다 —
 * 설정만 바꾸면 되고 코드 수정이 없다.
 */
export interface CollectLookup {
  enabled: boolean;
  fields: Array<"email" | "phone">;
  logic: "or" | "and";
  showQr: boolean;
}

export interface CollectFormConfig {
  fields: CollectField[];
  branch: CollectBranch;
  eventInfo: CollectEventInfo;
  notices: CollectNotice[];
  validation: CollectValidation;
  consent: { privacy: CollectConsentItem; marketing: CollectConsentItem };
  completion: CollectCompletion;
  lookup: CollectLookup;
  /** 제출 버튼 문구. 비면 렌더러 기본 문구. */
  submitLabel: Localized;
  defaultLocale: string;
  /**
   * 접수 창 수동 전환. 시각 계산을 이기고 상태를 고정한다 — 마감을 앞당기거나 연장할 일이
   * 실제로 생긴다(웨비나 statusOverride 와 같은 이유). null 이면 시각으로 판정.
   */
  statusOverride: RegistrationStatus | null;
}

// ── 기본값 ────────────────────────────────────────────────────────────
/**
 * 빈 폼으로 시작한다 — **문항을 코드에 넣지 않는다**(설계 §23).
 * 전시마다 빌더에서 직접 채우는 것이 기본이고, 여기 기본 문항을 박으면 다음 전시에서
 * 지우는 일부터 하게 된다. 단 이름·이메일 없이 등록이 성립하지 않으므로 **신규 소스 생성 시**
 * 빌더가 씨앗 항목을 넣어 준다(그건 UI 몫이고 이 정규화의 기본값이 아니다).
 */
export const EMPTY_FORM_CONFIG: CollectFormConfig = {
  fields: [],
  branch: { enabled: false, fieldKey: "", groups: [] },
  eventInfo: {
    enabled: false,
    eventDates: [],
    openingHours: [],
    venue: {},
    registrationWindow: { opensAt: null, closesAt: null },
    extraRows: [],
  },
  notices: [],
  validation: { defaultCountry: "US", onDuplicate: "block" },
  consent: {
    privacy: { enabled: true, label: {}, body: {}, defaultChecked: false },
    marketing: { enabled: false, label: {}, body: {}, defaultChecked: false },
  },
  completion: { redirectUrlTemplate: "", showQr: true },
  lookup: { enabled: true, fields: ["email", "phone"], logic: "or", showQr: true },
  submitLabel: {},
  defaultLocale: DEFAULT_LOCALE,
  statusOverride: null,
};

// ── 정규화 ────────────────────────────────────────────────────────────
function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeFieldType(value: unknown): CollectFieldType {
  const t = String(value ?? "");
  return (FIELD_TYPES as readonly string[]).includes(t) ? (t as CollectFieldType) : "text";
}

/** 선택지 — 빈 값은 버린다. 빈 항목이 남으면 공개 폼에 빈 드롭다운 줄이 생기고 필수 검증이 꼬인다. */
function normalizeOptions(value: unknown, locale: string): Localized[] {
  if (!Array.isArray(value)) return [];
  return value.map((o) => toLocalized(o, locale)).filter((o) => Object.keys(o).length > 0);
}

function normalizeChoiceExtras(raw: Record<string, unknown>, optionCount: number) {
  const out: { maxSelect?: number; allowOther?: boolean } = {};
  const max = Number(raw.maxSelect);
  // 옵션 전체 이상이면 무제한과 같다 — 저장하지 않는다(웨비나 설문과 같은 계약).
  if (Number.isFinite(max) && max >= 1 && max < optionCount) out.maxSelect = Math.floor(max);
  if (raw.allowOther === true) out.allowOther = true;
  return out;
}

function normalizeField(raw: unknown, index: number, locale: string): CollectField | null {
  const r = obj(raw);
  const key = str(r.key);
  // key 없는 항목은 저장할 자리가 없다 — 그리면 값이 어디에도 안 들어간다.
  if (!key) return null;
  const options = normalizeOptions(r.options, locale);
  return {
    id: str(r.id) || key || `field_${index}`,
    key,
    label: toLocalized(r.label, locale),
    type: normalizeFieldType(r.type),
    placeholder: toLocalized(r.placeholder, locale),
    required: r.required === true,
    enabled: r.enabled !== false,
    options,
    ...normalizeChoiceExtras(r, options.length),
  };
}

function normalizeFields(raw: unknown, locale: string): CollectField[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CollectField[] = [];
  raw.forEach((item, i) => {
    const f = normalizeField(item, i, locale);
    // 중복 key 는 뒤엣것을 버린다 — 같은 키가 둘이면 저장 값이 서로를 덮어쓴다.
    if (!f || seen.has(f.key)) return;
    seen.add(f.key);
    out.push(f);
  });
  return out;
}

function normalizeNotice(raw: unknown, index: number, locale: string): CollectNotice {
  const r = obj(raw);
  const placement = str(r.placement) as NoticePlacement;
  const mode = str(r.mode) as NoticeMode;
  return {
    id: str(r.id) || `notice_${index}`,
    enabled: r.enabled !== false,
    placement: NOTICE_PLACEMENTS.includes(placement) ? placement : "top",
    title: toLocalized(r.title, locale),
    body: toLocalized(r.body, locale),
    mode: NOTICE_MODES.includes(mode) ? mode : "notice",
    collapsible: r.collapsible === true,
  };
}

function normalizeConsentItem(raw: unknown, locale: string, fallback: CollectConsentItem): CollectConsentItem {
  const r = obj(raw);
  return {
    enabled: r.enabled === undefined ? fallback.enabled : r.enabled !== false,
    label: toLocalized(r.label, locale),
    body: toLocalized(r.body, locale),
    // 명시적으로 true 일 때만 사전 체크한다 — 기본은 항상 미체크(설계 §7).
    defaultChecked: r.defaultChecked === true,
  };
}

/** ISO 문자열만 통과시킨다. 못 읽는 값은 null(= 그 방향 제한 없음)로 떨어뜨린다. */
function isoOrNull(value: unknown): string | null {
  const s = str(value);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/**
 * 저장된 formConfig 를 화면·검증이 믿고 쓸 수 있는 모양으로 만든다.
 * **어떤 입력이 와도 던지지 않는다** — 임베드 런타임에서 예외가 나면 폼이 통째로 안 그려진다.
 */
export function normalizeCollectForm(raw: unknown): CollectFormConfig {
  const c = obj(raw);
  const locale = str(c.defaultLocale) || DEFAULT_LOCALE;

  const branchRaw = obj(c.branch);
  const branchGroups = Array.isArray(branchRaw.groups) ? branchRaw.groups : [];
  const fields = normalizeFields(c.fields, locale);
  const fieldKey = str(branchRaw.fieldKey);

  const eventRaw = obj(c.eventInfo);
  const windowRaw = obj(eventRaw.registrationWindow);
  const validationRaw = obj(c.validation);
  const consentRaw = obj(c.consent);
  const completionRaw = obj(c.completion);
  const lookupRaw = obj(c.lookup);

  const lookupFields = Array.isArray(lookupRaw.fields)
    ? (lookupRaw.fields.map(String).filter((f) => f === "email" || f === "phone") as Array<"email" | "phone">)
    : EMPTY_FORM_CONFIG.lookup.fields;

  const override = str(c.statusOverride);

  return {
    fields,
    branch: {
      // 기준 항목이 실제로 존재할 때만 분기를 켠다 — 항목을 지웠는데 분기가 남으면
      // 렌더러가 없는 key 를 기다리며 유형 문항을 영영 안 그린다.
      enabled: branchRaw.enabled === true && fields.some((f) => f.key === fieldKey),
      fieldKey,
      groups: branchGroups.map((g) => {
        const gr = obj(g);
        return { value: str(gr.value), fields: normalizeFields(gr.fields, locale) };
      }).filter((g) => g.value !== ""),
    },
    eventInfo: {
      enabled: eventRaw.enabled === true,
      eventDates: Array.isArray(eventRaw.eventDates) ? eventRaw.eventDates.map(String).filter(Boolean) : [],
      openingHours: Array.isArray(eventRaw.openingHours)
        ? eventRaw.openingHours.map((h) => {
            const hr = obj(h);
            return { date: str(hr.date), open: str(hr.open), close: str(hr.close), lastEntrance: str(hr.lastEntrance) };
          }).filter((h) => h.date !== "")
        : [],
      venue: toLocalized(eventRaw.venue, locale),
      registrationWindow: { opensAt: isoOrNull(windowRaw.opensAt), closesAt: isoOrNull(windowRaw.closesAt) },
      extraRows: Array.isArray(eventRaw.extraRows)
        ? eventRaw.extraRows.map((r) => {
            const rr = obj(r);
            return { label: toLocalized(rr.label, locale), value: toLocalized(rr.value, locale) };
          })
        : [],
    },
    notices: Array.isArray(c.notices) ? c.notices.map((n, i) => normalizeNotice(n, i, locale)) : [],
    validation: {
      // 대문자 2글자만 국가 코드로 인정한다 — 소문자·전체 이름이 들어오면 기본값으로.
      defaultCountry: /^[A-Za-z]{2}$/.test(str(validationRaw.defaultCountry))
        ? str(validationRaw.defaultCountry).toUpperCase()
        : EMPTY_FORM_CONFIG.validation.defaultCountry,
      onDuplicate: validationRaw.onDuplicate === "allow" ? "allow" : "block",
    },
    consent: {
      privacy: normalizeConsentItem(consentRaw.privacy, locale, EMPTY_FORM_CONFIG.consent.privacy),
      marketing: normalizeConsentItem(consentRaw.marketing, locale, EMPTY_FORM_CONFIG.consent.marketing),
    },
    completion: {
      redirectUrlTemplate: str(completionRaw.redirectUrlTemplate),
      showQr: completionRaw.showQr !== false,
    },
    lookup: {
      enabled: lookupRaw.enabled !== false,
      // 조회 항목이 하나도 없으면 열 수 없는 화면이 된다 — 기본으로 되돌린다.
      fields: lookupFields.length ? lookupFields : EMPTY_FORM_CONFIG.lookup.fields,
      logic: lookupRaw.logic === "and" ? "and" : "or",
      showQr: lookupRaw.showQr !== false,
    },
    submitLabel: toLocalized(c.submitLabel, locale),
    defaultLocale: locale,
    statusOverride: REGISTRATION_STATUSES.includes(override as RegistrationStatus)
      ? (override as RegistrationStatus)
      : null,
  };
}

// ── 접수 창 ───────────────────────────────────────────────────────────
export type RegistrationStatus = "before" | "open" | "closed";

const REGISTRATION_STATUSES: readonly RegistrationStatus[] = ["before", "open", "closed"];

/**
 * 지금 등록을 받는가. 웨비나 resolveWebinarStatus 와 같은 구조다 — 시각으로 판정하되
 * **수동 override 가 시각을 이긴다.**
 *
 * `now` 를 인자로 받는 이유: 서버와 클라이언트가 서로 다른 시계를 갖는다. 임베드 런타임은
 * 응답의 serverNow 로 보정한 값을 넣어 호출하고, 서버는 자기 시각을 넣는다. 여기서 new Date()
 * 를 부르면 그 보정이 무의미해진다.
 *
 * **서버에서도 반드시 부른다.** 클라이언트만 막으면 마감 후 API 로 등록이 들어온다(설계 §5.1).
 */
export function resolveRegistrationStatus(
  config: Pick<CollectFormConfig, "eventInfo" | "statusOverride">,
  now: Date,
): RegistrationStatus {
  if (config.statusOverride) return config.statusOverride;
  const { opensAt, closesAt } = config.eventInfo.registrationWindow;
  const t = now.getTime();
  if (opensAt && t < Date.parse(opensAt)) return "before";
  if (closesAt && t >= Date.parse(closesAt)) return "closed";
  return "open";
}

// ── 제출 검증 ─────────────────────────────────────────────────────────
/** 안내 블록 체크박스가 values 에 실려 오는 키. 렌더러·검증이 같은 규칙을 쓰게 한 곳에 둔다. */
export function noticeValueKey(noticeId: string): string {
  return `notice_${noticeId}`;
}

export interface SubmissionIssue {
  /** 어느 항목의 문제인가. 폼이 이 key 아래에 인라인으로 붙인다(AGENTS.md). */
  key: string;
  code: "required" | "invalid_email" | "invalid_phone" | "unknown_key" | "too_many" | "not_an_option" | "consent_required";
}

/** 분기 그룹까지 펼친 "지금 이 응답에 유효한 항목" 목록. */
export function visibleFields(config: CollectFormConfig, values: Record<string, unknown>): CollectField[] {
  const base = config.fields.filter((f) => f.enabled);
  if (!config.branch.enabled) return base;
  const chosen = String(values[config.branch.fieldKey] ?? "");
  const group = config.branch.groups.find((g) => g.value === chosen);
  if (!group) return base;
  // 기준 항목 **바로 아래**에 끼워 넣는다 — 화면 순서와 검증 순서가 같아야 한다(§4).
  const at = base.findIndex((f) => f.key === config.branch.fieldKey);
  const extra = group.fields.filter((f) => f.enabled);
  if (at < 0) return [...base, ...extra];
  return [...base.slice(0, at + 1), ...extra, ...base.slice(at + 1)];
}

/**
 * 런타임과 서버가 **같이** 부르는 검증. 서버는 이걸 통과한 뒤에도 접수 창과 중복을 따로 본다
 * (창은 시각, 중복은 DB 라 순수 함수로 못 본다).
 *
 * `isValidEmail`·`normalizePhoneToE164` 를 주입받는 이유: 전화 정규화는 libphonenumber-js 에
 * 의존하는데 그걸 이 순수 모듈에 묶으면 임베드 번들이 통째로 커진다. 호출부가 넣는다.
 */
export function validateSubmission(
  config: CollectFormConfig,
  values: Record<string, unknown>,
  deps: {
    isValidEmail: (v: string) => boolean;
    isValidPhone: (v: string, country: string) => boolean;
    consent: { privacy?: boolean; marketing?: boolean };
  },
): SubmissionIssue[] {
  const issues: SubmissionIssue[] = [];
  const fields = visibleFields(config, values);
  const allowed = new Set(fields.map((f) => f.key));
  // 체크박스로 쓰이는 안내 블록도 **정당한 폼 입력**이다. 항목 key 만 허용하면 필수 안내에
  // 동의한 제출이 unknown_key 로 거부된다(등록이 통째로 막힌다).
  for (const n of config.notices) {
    if (n.enabled && n.mode !== "notice") allowed.add(noticeValueKey(n.id));
  }

  // 정의에 없는 키는 거부한다 — 받아 두면 CollectRecord.data 가 임의 입력으로 오염된다.
  for (const key of Object.keys(values)) {
    if (!allowed.has(key)) issues.push({ key, code: "unknown_key" });
  }

  for (const f of fields) {
    const raw = values[f.key];
    const isEmptyArray = Array.isArray(raw) && raw.length === 0;
    const empty = raw == null || String(raw).trim() === "" || isEmptyArray;

    if (f.required && empty) {
      issues.push({ key: f.key, code: "required" });
      continue;
    }
    if (empty) continue;

    if (f.type === "email" && !deps.isValidEmail(String(raw).trim())) {
      issues.push({ key: f.key, code: "invalid_email" });
    }
    if (f.type === "tel" && !deps.isValidPhone(String(raw), config.validation.defaultCountry)) {
      issues.push({ key: f.key, code: "invalid_phone" });
    }
    if (f.type === "multiple") {
      const arr = Array.isArray(raw) ? raw : [raw];
      if (f.maxSelect != null && arr.length > f.maxSelect) issues.push({ key: f.key, code: "too_many" });
      // allowOther 면 선택지 대조를 하지 않는다 — 하면 '기타' 자유 입력이 전부 막힌다.
      if (!f.allowOther && f.options.length) {
        const labels = new Set(f.options.flatMap((o) => Object.values(o)));
        if (arr.some((v) => !labels.has(String(v)))) issues.push({ key: f.key, code: "not_an_option" });
      }
    }
    if (f.type === "select" && !f.allowOther && f.options.length) {
      const labels = new Set(f.options.flatMap((o) => Object.values(o)));
      if (!labels.has(String(raw))) issues.push({ key: f.key, code: "not_an_option" });
    }
  }

  if (config.consent.privacy.enabled && deps.consent.privacy !== true) {
    issues.push({ key: "consent_privacy", code: "consent_required" });
  }
  // 안내 블록 중 필수 체크로 승격된 것(파리의 초상권 등)도 같은 규칙으로 본다.
  for (const n of config.notices) {
    if (n.enabled && n.mode === "checkbox-required" && (values[`notice_${n.id}`] as unknown) !== true) {
      issues.push({ key: `notice_${n.id}`, code: "consent_required" });
    }
  }

  return issues;
}
