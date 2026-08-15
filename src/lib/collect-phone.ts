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
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/**
 * 입력을 E.164 로. 못 읽으면 null — 호출부가 검증 실패로 다룬다.
 *
 * `country` 는 국가번호가 없는 입력을 해석할 기준이다(빌더의 validation.defaultCountry).
 * 입력이 이미 `+` 로 시작하면 그 값이 이긴다 — 화면에서 국가를 US 로 두고 `+82…` 를
 * 붙여넣는 사람이 실제로 있다.
 */
export function toE164(value: unknown, country: string): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const cc = /^[A-Za-z]{2}$/.test(country) ? (country.toUpperCase() as CountryCode) : undefined;
  try {
    const parsed = parsePhoneNumberFromString(raw, raw.startsWith("+") ? undefined : cc);
    // isValid() 까지 봐야 한다. 파싱만 되고 그 나라에 없는 번호대인 경우가 흔하다.
    return parsed?.isValid() ? parsed.number : null;
  } catch {
    // 라이브러리가 던지는 경우까지 폼을 죽이지 않는다 — 검증 실패로만 다룬다.
    return null;
  }
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
