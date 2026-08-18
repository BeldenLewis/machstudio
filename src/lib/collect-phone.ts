/**
 * 연락처 정규화 — 저장은 **E.164 한 형태**(+12025550147)로만 한다.
 *
 * 왜 직접 구현하지 않나(설계 §6.3): 나라마다 규칙이 다르고 반드시 틀린다.
 *  · 기존 상수 PHONE_MIN_DIGITS=10 은 한국 기준이라 프랑스 9자리 번호를 거부한다.
 *  · 한국은 앞 0 을 떼고(01012345678 → +821012345678), 이탈리아는 떼지 않는다.
 *  · 미국은 지역번호 첫 자리가 2~9 여야 하는 등 나라별 유효 범위가 따로 있다.
 * 이 판정을 libphonenumber-js 에 맡긴다.
 *
 * **정규화가 특히 중요한 이유는 등록 확인(§10)이 전화번호로도 조회하기 때문이다.**
 * 저장 표기가 제각각이면 `010-1234-5678` 로 찾는 사람이 자기 등록을 못 찾는다.
 * 그래서 조회 입력도 반드시 같은 함수를 거쳐 비교한다.
 */
import { getCountries, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/**
 * 입력을 E.164 로. 못 읽으면 null — 호출부가 검증 실패로 다룬다.
 *
 * `country` 는 국가번호가 없는 입력을 해석할 기준이다(빌더의 validation.defaultCountry).
 * 입력이 이미 `+` 로 시작하면 그 값이 이긴다 — 화면에서 국가를 US 로 두고 `+82…` 를
 * 붙여넣는 사람이 실제로 있다.
 */
export function toE164(value: unknown, country: string): string | null {
  // 문자열화도 try 안이다. 밖에 두면 원시 변환기가 망가진 객체(JSON 으로 얼마든지 온다)에서
  // TypeError 가 새어 나가 **등록 확인 조회가 500** 이 된다 — "못 읽으면 null" 계약이 깨진다.
  try {
    const raw = typeof value === "string" ? value.trim() : String(value ?? "").trim();
    if (!raw) return null;
    const cc = /^[A-Za-z]{2}$/.test(country) ? (country.toUpperCase() as CountryCode) : undefined;
    const parsed = parsePhoneNumberFromString(raw, raw.startsWith("+") ? undefined : cc);
    // isValid() 까지 봐야 한다. 파싱만 되고 그 나라에 없는 번호대인 경우가 흔하다.
    return parsed?.isValid() ? parsed.number : null;
  } catch {
    // 라이브러리가 던지는 경우까지 폼을 죽이지 않는다 — 검증 실패로만 다룬다.
    return null;
  }
}

/**
 * 실제로 지원되는 국가 코드인가 — 빌더가 **입력 시점에** 걸러야 하는 판정.
 *
 * 모양만 보면(2글자 대문자) "UK" 가 통과한다. 영국은 ISO 로 GB 라서 toE164 가 전부 null 을
 * 내고, 그러면 그 폼의 모든 전화 항목이 invalid_phone 이 되는데 화면엔 이유가 안 뜬다.
 * 같은 부류: 그리스를 EL 로 쓰는 경우.
 *
 * 이 판정을 collect-form-config(순수 모듈)에 두지 않는 이유는 그쪽이 임베드 번들에 통째로
 * 들어가기 때문이다 — 국가 메타데이터를 딸려 보내지 않으려고 여기 둔다.
 */
export function isSupportedCountry(code: unknown): boolean {
  const c = String(code ?? "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return false;
  return getCountries().includes(c as CountryCode);
}

/** 검증용. validateSubmission 에 주입한다(순수 모듈이 이 의존성을 안 갖게). */
export function isValidPhoneForCountry(value: unknown, country: string): boolean {
  return toE164(value, country) !== null;
}

/**
 * 입력칸에 남길 문자 — **숫자만**(선행 `+` 는 국가번호 직접 입력을 위해 허용).
 * 하이픈·괄호·공백은 타이핑 즉시 제거한다. 안내 문구가 아니라 입력 시점 강제다
 * (AGENTS.md "입력은 소스에서 정규화").
 */
export function stripPhoneInput(value: string): string {
  const plus = value.trimStart().startsWith("+") ? "+" : "";
  return plus + value.replace(/[^0-9]/g, "");
}
