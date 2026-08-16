/**
 * 등록 확인(Find My QR)의 **순수 판정** (설계 §10).
 *
 * "내가 등록했나?" 와 "QR 을 잃어버렸다" 를 홈페이지에서 바로 푸는 화면이고, 이메일 연동
 * 전에는 등록자가 QR 을 되찾는 **유일한 경로**다(§2). 그래서 부가 기능이 아니다.
 *
 * DB 를 보지 않는다 — 조회 조건을 만드는 일과, 찾은 레코드에서 **보여줄 것만 추리는** 일만
 * 한다. 그 둘이 라우트 안에 섞여 있으면 "무엇을 노출하는가" 를 나중에 아무도 못 읽는다.
 */
import { toE164 } from "@/lib/collect-phone";
import { isValidCollectEmail, normalizeEmail } from "@/lib/collect-submit";
import type { CollectFormConfig, Localized } from "@/lib/collect-form-config";

/** 조회 입력 — 설정에 따라 둘 중 하나만 쓰일 수도 있다. */
export interface LookupInput {
  email?: unknown;
  phone?: unknown;
}

/** 정규화된 조회 조건. 둘 다 null 이면 조회 자체를 하지 않는다. */
export interface LookupCriteria {
  emailNormalized: string | null;
  phoneE164: string | null;
  /** `and` 면 둘 다 일치해야 한다(§10.1 — 유료 전시 전환 시 설정만 바꾼다). */
  logic: "or" | "and";
}

/**
 * 조회 조건을 만든다. **설정이 허용한 항목만** 본다 — `fields: ["email"]` 인데 전화로
 * 조회되면 운영자가 좁혀 놓은 것이 무의미해진다.
 *
 * 전화는 반드시 E.164 로 바꿔 비교한다(§10.1). `010-1234-5678` 로 친 사람과 `+8210…` 로
 * 저장된 값이 맞아야 하는데, 표기를 그대로 비교하면 **본인 번호로도 못 찾는다.**
 */
export function buildLookupCriteria(config: CollectFormConfig, input: LookupInput): LookupCriteria | null {
  const allowEmail = config.lookup.fields.includes("email");
  const allowPhone = config.lookup.fields.includes("phone");

  const rawEmail = allowEmail ? normalizeEmail(input.email) : null;
  const emailNormalized = rawEmail && isValidCollectEmail(rawEmail) ? rawEmail : null;

  const rawPhone = allowPhone ? String(input.phone ?? "").trim() : "";
  const phoneE164 = rawPhone ? toE164(rawPhone, config.validation.defaultCountry) : null;

  if (!emailNormalized && !phoneE164) return null;

  /**
   * `and` 인데 한쪽만 들어왔으면 **조회하지 않는다.**
   * 한쪽만으로 조회해 버리면 `and` 설정이 사실상 `or` 로 동작한다 — 유료 전시에서 남의
   * 티켓이 열리는 바로 그 실패다.
   */
  if (config.lookup.logic === "and" && !(emailNormalized && phoneE164)) return null;

  return { emailNormalized, phoneE164, logic: config.lookup.logic };
}

/** 화면에 내보내는 것 — **이게 전부다**(§10.2 "표시 정보는 최소화"). */
export interface LookupView {
  /**
   * **showQr 이 꺼져 있으면 null 이다.**
   *
   * 번호가 곧 티켓이다 — `/t/{regNo}` 는 번호만 알면 이름·유형·QR 을 전부 연다.
   * `or` + `showQr:false` 는 "이메일 하나만 아는 사람에게 티켓을 주지 않겠다" 는
   * 설정인데, 응답에 번호를 실어 보내면 화면에서 감춰도 그 의도가 무너진다(§10.1·§10.2).
   */
  registrationNo: string | null;
  /** 본인 확인용 표시 이름. 못 고르면 빈 문자열(화면에서 생략한다). */
  name: string;
  /** 참관객 유형 — 분기 기준 항목의 값. 분기가 없으면 빈 문자열. */
  visitorType: string;
  /** QR 을 보여줄 것인가. false 면 "메일로 재발송" 만 안내한다(§10.1). */
  showQr: boolean;
}

/**
 * 이름으로 쓸 만한 항목인가.
 *
 * **앵커를 건다.** 앵커 없는 정규식은 `family_members`(참관 인원수)나
 * `first_visit_company_name`(회사명)까지 잡아서 그 값이 티켓의 이름 자리에 인쇄된다 —
 * 최소 노출 원칙(§10.2)을 어기는 방향이다.
 *
 * key 와 **라벨을 함께 본다.** key 는 운영자가 손으로 적는 자유 문자열이고, 빌더가 주는
 * 기본값은 `field`·`field_2` 다(keyFromLabel 이 빈 라벨에 대해 그렇게 만든다). 라벨에
 * "First name" 이라고 적어 놓고 key 를 안 고친 폼이 기본 경로인데, key 만 보면 그런 폼은
 * **이름 줄이 통째로 사라진다** — 조회 결과가 내 것인지 확인할 유일한 표시다.
 */
const NAME_PATTERNS = [
  /^(first|last|given|family|full)[_-]?names?$/i,
  /^names?$/i,
  /^surnames?$/i,
  /^(first|last|given|family)$/i,
];
function looksLikeName(field: { key: string; label: Localized }): boolean {
  const candidates = [field.key, ...Object.values(field.label)]
    .map((v) => String(v).trim().replace(/\s+/g, "_"))
    .filter(Boolean);
  return candidates.some((c) => NAME_PATTERNS.some((re) => re.test(c)));
}

/**
 * 찾은 레코드에서 **보여줄 것만** 추린다.
 *
 * 연락처 전체·다른 문항 답변은 **절대 넣지 않는다**(§10.2). `or` 로 열어 둔 화면이라
 * 이메일 하나만 아는 사람에게도 열리는데, 거기에 회사·직함·응답이 딸려 나오면 그건
 * 명단 유출이다. 이름은 "본인이 맞구나" 를 확인할 최소치로만 쓴다.
 */
export function buildLookupView(
  config: CollectFormConfig,
  record: { registrationNo: string | null; data: unknown },
): LookupView | null {
  const base = buildTicketView(config, record);
  if (!base) return null;
  return {
    ...base,
    // 화면이 안 쓰는 값은 내보내지도 않는다(lookup-mount 는 showQr 가 false 면 번호를 그리지 않는다).
    registrationNo: config.lookup.showQr ? base.registrationNo : null,
    showQr: config.lookup.showQr,
  };
}

/**
 * 티켓 화면(`/t/{regNo}`)이 쓰는 표시 정보 — **번호를 이미 손에 쥔 사람**을 위한 것이라
 * 항상 번호가 들어 있다.
 *
 * 조회 화면과 정책이 다른 이유: `lookup.showQr` 는 "이메일 하나만 아는 사람에게 티켓을
 * 주지 않겠다" 는 설정이다. 번호로 직접 연 화면까지 그 설정으로 잠그면, 완료 화면에서
 * 이어지는 §2 의 **주 QR 전달 경로**가 조회 설정 하나로 같이 끊긴다.
 */
export function buildTicketView(
  config: CollectFormConfig,
  record: { registrationNo: string | null; data: unknown },
): (Omit<LookupView, "registrationNo" | "showQr"> & { registrationNo: string }) | null {
  if (!record.registrationNo) return null;
  const data = (record.data && typeof record.data === "object" ? record.data : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  // 이름은 정의된 항목 중 이름처럼 생긴 것들을 **폼 순서대로** 이어 붙인다.
  const name = config.fields
    .filter((f) => looksLikeName(f))
    .map((f) => str(data[f.key]))
    .filter(Boolean)
    .join(" ");

  const visitorType = config.branch.enabled ? str(data[config.branch.fieldKey]) : "";

  return { registrationNo: record.registrationNo, name, visitorType };
}
