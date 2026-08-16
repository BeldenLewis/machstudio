/**
 * 빌더형 제출을 **저장 직전 모양**까지 만드는 순수 함수 (설계 §19).
 *
 * DB 를 보지 않는다. 그래서 두 곳이 같은 함수를 쓸 수 있다:
 *  · 서버 라우트 — 이 결과를 그대로 INSERT 한다.
 *  · 미리보기 — 여기까지 **똑같이 돌리고 저장만 안 한다**(설계 §16.1 "검증까지는 실제와 똑같이
 *    돌리고 저장 직전에 멈춘 뒤"). 미리보기 전용 검증 경로를 따로 두면 "미리보기는 통과했는데
 *    실제는 400" 이 생긴다.
 *
 * 중복 판정만은 여기서 못 한다(DB 가 필요하다). 그건 라우트가 P2002 로 받는다 — 조회 후
 * INSERT 만으로는 동시 제출을 못 막기 때문에 **DB 제약이 최종 방어선**이다(설계 §6.2).
 */
import { isValidEmail } from "@/lib/webinar-config";
import { isValidPhoneForCountry, toE164 } from "@/lib/collect-phone";
import { generateRegistrationNo } from "@/lib/collect-registration-no";
import {
  resolveRegistrationStatus,
  validateSubmission,
  visibleFields,
  type CollectFormConfig,
  type SubmissionIssue,
} from "@/lib/collect-form-config";

/** 저장 직전의 레코드 조각 — 라우트가 공통 필드(utm·referrer 등)와 합쳐 INSERT 한다. */
export interface PreparedSubmission {
  /** CollectRecord.data 로 들어갈 값. **정의에 있는 키만** 남는다. */
  data: Record<string, unknown>;
  registrationNo: string;
  /** 소문자·trim. 이메일 항목이 없으면 null — 그러면 중복 차단도 걸리지 않는다. */
  emailNormalized: string | null;
  /** E.164. 파싱 실패면 null(원문은 data 에 남는다). */
  phoneE164: string | null;
  locale: string;
  entryChannel: "online";
  /** 동의 기록 — data 안에 넣지 않는다. 항목 키와 섞이면 CSV 열이 뒤죽박죽이 된다. */
  consent: { privacy: boolean; marketing: boolean };
}

export type PrepareResult =
  | { ok: true; prepared: PreparedSubmission }
  /** 접수 창 밖 — 403. 클라이언트가 마감 화면으로 바꿔야 하므로 상태를 함께 준다. */
  | { ok: false; code: "closed"; status: "before" | "closed" }
  /** 형식 검증 실패 — 400. 항목별 인라인 표시에 그대로 쓴다. */
  | { ok: false; code: "invalid"; issues: SubmissionIssue[] };

export interface SubmissionInput {
  values: Record<string, unknown>;
  consent?: { privacy?: unknown; marketing?: unknown };
  locale?: unknown;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/**
 * 이메일·전화의 **대표 항목**을 고른다.
 *
 * 정규화 컬럼(emailNormalized·phoneE164)은 하나씩뿐인데 폼에는 같은 유형이 여럿일 수 있다
 * (예: 본인 이메일 + 비서 이메일). **보이는 순서에서 처음 것**을 대표로 삼는다 — 화면에서
 * 위에 있는 것이 본인 것이라는 게 폼 작성의 통상이고, 규칙이 있어야 서버·런타임·조회가
 * 같은 값을 본다. 규칙 없이 "아무거나 이메일 하나" 로 두면 중복 차단이 폼 편집 순서에 따라
 * 조용히 다른 항목에 걸린다.
 */
export function primaryFieldKey(
  config: CollectFormConfig,
  values: Record<string, unknown>,
  type: "email" | "tel",
): string | null {
  const f = visibleFields(config, values).find((x) => x.type === type);
  return f ? f.key : null;
}

/** 이메일 정규화 — 중복 판정의 전제(설계 §6.2). trim + 소문자, 그 이상 조이지 않는다. */
export function normalizeEmail(value: unknown): string | null {
  const s = str(value).trim().toLowerCase();
  return s || null;
}

export function prepareBuilderSubmission(
  config: CollectFormConfig,
  input: SubmissionInput,
  now: Date,
): PrepareResult {
  // ── 1. 접수 창 ─────────────────────────────────────────────────────
  // **서버에서도 반드시 본다.** 클라이언트만 막으면 마감 후 API 로 등록이 들어온다(§5.1).
  const status = resolveRegistrationStatus(config, now);
  if (status !== "open") return { ok: false, code: "closed", status };

  const rawValues = input.values && typeof input.values === "object" ? input.values : {};

  // ── 2. 정의에 있는 키만 남긴다 ──────────────────────────────────────
  // 검증은 unknown_key 로 거부하지만, 그 전에 **분기 밖 값**을 떨어내야 한다. 유형을 바꿔
  // 가며 채운 사람의 요청에는 지금 안 보이는 그룹의 값이 남아 있고(런타임이 공통 입력값을
  // 유지하므로 정상 동작이다), 그대로 넘기면 고칠 칸도 없는 오류로 등록이 영영 막힌다.
  const fields = visibleFields(config, rawValues);
  const allowed = new Set(fields.map((f) => f.key));
  for (const n of config.notices) {
    if (n.enabled && n.mode !== "notice") allowed.add(`notice_${n.id}`);
  }
  const values: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawValues)) if (allowed.has(k)) values[k] = v;

  // ── 3. 형식 검증 — 런타임과 **같은 함수** ───────────────────────────
  const consent = {
    privacy: input.consent?.privacy === true,
    marketing: input.consent?.marketing === true,
  };
  const issues = validateSubmission(config, values, {
    isValidEmail,
    isValidPhone: (v, country) => isValidPhoneForCountry(v, country),
    consent,
  });
  if (issues.length > 0) return { ok: false, code: "invalid", issues };

  // ── 4. 정규화 컬럼 ─────────────────────────────────────────────────
  const emailKey = primaryFieldKey(config, values, "email");
  const phoneKey = primaryFieldKey(config, values, "tel");
  const emailNormalized = emailKey ? normalizeEmail(values[emailKey]) : null;
  const phoneRaw = phoneKey ? str(values[phoneKey]).trim() : "";
  const phoneE164 = phoneRaw ? toE164(phoneRaw, config.validation.defaultCountry) : null;

  // 로케일은 뷰어가 보낸 값을 **폼이 아는 것 중에서만** 받는다. 아무 문자열이나 저장하면
  // 나중에 언어별 재발송이 그 값으로 갈라져 보낼 수 없는 언어가 생긴다.
  const known = new Set<string>([config.defaultLocale]);
  for (const f of config.fields) for (const k of Object.keys(f.label)) known.add(k);
  const asked = str(input.locale).trim();
  const locale = asked && known.has(asked) ? asked : config.defaultLocale;

  return {
    ok: true,
    prepared: {
      data: values,
      registrationNo: generateRegistrationNo(),
      emailNormalized,
      phoneE164,
      locale,
      entryChannel: "online",
      consent,
    },
  };
}
