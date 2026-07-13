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
  submitLabel: string;
}

const FIELD_TYPES: readonly WebinarFieldType[] = ["text", "email", "tel", "select", "checkbox"];

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
  { id: "phone", key: "phone", label: "연락처", type: "tel", placeholder: "010-0000-0000", required: false, enabled: true, options: [], system: true },
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

  const fields = [...merged, ...customFields];

  return {
    fields: opts?.includeDisabled ? fields : fields.filter((field) => field.enabled !== false),
    privacyText: typeof raw?.privacyText === "string" ? raw.privacyText : "[필수] 개인정보 수집 및 이용에 동의합니다",
    marketingText: typeof raw?.marketingText === "string" ? raw.marketingText : "[선택] 마케팅 정보 수신에 동의합니다",
    submitLabel: typeof raw?.submitLabel === "string" ? raw.submitLabel : "사전 등록하기",
  };
}
