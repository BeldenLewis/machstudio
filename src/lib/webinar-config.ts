// 웨비나 config(JSON) 정규화 — 단일 정의.
// registrationForm 정규화가 live 페이지 / RegistrationFormTab / register 라우트 / EmbedTab 4곳에
// 중복돼 있던 것을 이 파일로 수렴한다. (UI 파일들의 마이그레이션은 어드민 재편 Phase 에서)
//
// - 공개/제출 경로: normalizeRegistrationForm(config)            → enabled 필드만
// - 어드민 편집 경로: normalizeRegistrationForm(config, { includeDisabled: true }) → 전체 필드

export type WebinarFieldType = "text" | "email" | "tel" | "select" | "checkbox";

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

const FIELD_TYPES: readonly WebinarFieldType[] = ["text", "email", "tel", "select", "checkbox"];

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

// ── 라이브 페이지 화면(대기·입장·종료) 구성 — 섹션별 on/off + 자료·넥스트 데이터 ──
// config.livePage 에 저장(JSON blob, 마이그레이션 불필요). 데이터가 없으면 토글이 켜져 있어도 뷰어에서 자동 숨김.
export interface LiveResource { title: string; meta: string; url: string }
export interface LiveNextWebinar { title: string; when: string; url: string }

export interface LivePageConfig {
  waiting: { agenda: boolean; social: boolean; calendar: boolean; share: boolean; notify: boolean };
  entry: { viewerCount: boolean };
  ended: { replay: boolean; survey: boolean; resources: boolean; nextWebinar: boolean; share: boolean };
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
    },
    resources,
    nextWebinar,
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
      options: Array.isArray(saved?.options) ? saved.options.map(String) : field.options,
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
      options: Array.isArray(item.options) ? item.options.map(String) : [],
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
    // 공개 화면에서는 비활성 필드와 "옵션 0개 드롭다운"(그릴 수 없어 필수면 등록을 막는다)을 제외한다.
    fields: opts?.includeDisabled
      ? fields
      : fields.filter((field) => field.enabled !== false && !(field.type === "select" && !(field.options ?? []).length)),
    privacyText: typeof raw?.privacyText === "string" ? raw.privacyText : "[필수] 개인정보 수집 및 이용에 동의합니다",
    marketingText: typeof raw?.marketingText === "string" ? raw.marketingText : "[선택] 마케팅 정보 수신에 동의합니다",
    privacyBody: typeof raw?.privacyBody === "string" ? raw.privacyBody : "",
    marketingBody: typeof raw?.marketingBody === "string" ? raw.marketingBody : "",
    privacyDefaultChecked: raw?.privacyDefaultChecked === true,
    marketingDefaultChecked: raw?.marketingDefaultChecked === true,
    submitLabel: typeof raw?.submitLabel === "string" ? raw.submitLabel : "사전 등록하기",
  };
}
