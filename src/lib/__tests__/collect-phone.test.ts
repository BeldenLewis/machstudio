import { describe, expect, it } from "vitest";
import { isValidPhoneForCountry, stripPhoneInput, toE164 } from "../collect-phone";

/**
 * 이 테스트가 지키는 것은 "라이브러리가 동작한다"가 아니라 **직접 구현했으면 틀렸을 지점들**이다.
 * 설계 §6.3 이 직접 구현을 말린 근거를 그대로 케이스로 만든다.
 */
describe("toE164 — 나라마다 규칙이 다르다", () => {
  it("US: 10자리 로컬 번호에 +1 을 붙인다", () => {
    expect(toE164("2025550147", "US")).toBe("+12025550147");
    expect(toE164("(202) 555-0147", "US")).toBe("+12025550147"); // 표기 문자는 무시
  });

  /** 한국은 앞 0 을 뗀다. 직접 구현하면 이 규칙을 나라별로 하드코딩하게 된다. */
  it("KR: 앞 0 을 떼고 +82 를 붙인다", () => {
    expect(toE164("01012345678", "KR")).toBe("+821012345678");
    expect(toE164("010-1234-5678", "KR")).toBe("+821012345678");
  });

  /** PHONE_MIN_DIGITS=10(한국 기준)으로 판정했으면 거부됐을 번호. */
  it("FR: 9자리 로컬 번호도 유효하다 — 최소 10자리 규칙이었으면 거부됐다", () => {
    expect(toE164("612345678", "FR")).toBe("+33612345678");
  });

  it("이미 +로 시작하면 그 국가번호가 이긴다 — 화면 기본 국가와 달라도 된다", () => {
    expect(toE164("+821012345678", "US")).toBe("+821012345678");
  });

  /**
   * 자릿수만 맞으면 통과시키는 구현이었다면 전부 유효로 봤을 값들이다.
   * (실측 확인: KR "1234567890" 은 오히려 **유효**하다 — 나라별 번호대는 직관과 다르다.
   *  이런 판정을 직접 짜지 않는 것이 이 모듈의 존재 이유다.)
   */
  it("파싱만 되고 그 나라에 없는 번호대는 null", () => {
    expect(toE164("0000000000", "US")).toBeNull();
    expect(toE164("1234567890", "US")).toBeNull(); // 미국 지역번호 첫 자리는 2~9
    expect(toE164("9999999999", "KR")).toBeNull();
    expect(toE164("0212345", "KR")).toBeNull(); // 자릿수 부족
  });

  it("빈 값·쓰레기·잘못된 국가코드에 던지지 않는다", () => {
    expect(toE164("", "US")).toBeNull();
    expect(toE164(null, "US")).toBeNull();
    expect(toE164("전화번호", "US")).toBeNull();
    expect(() => toE164("2025550147", "Korea")).not.toThrow();
  });

  /**
   * 등록 확인(§10)은 전화번호로도 조회한다. 표기가 달라도 **같은 E.164 로 수렴**해야
   * 저장된 값과 맞는다 — 이게 깨지면 등록자가 자기 등록을 못 찾는다.
   */
  it("표기가 달라도 같은 값으로 수렴한다 — 등록 확인 조회의 전제", () => {
    const forms = ["010-1234-5678", "010 1234 5678", "01012345678", "+82 10 1234 5678"];
    const out = new Set(forms.map((f) => toE164(f, "KR")));
    expect(out.size).toBe(1);
    expect([...out][0]).toBe("+821012345678");
  });
});

describe("isValidPhoneForCountry — validateSubmission 에 주입되는 판정", () => {
  it("E.164 로 못 바꾸면 유효하지 않다", () => {
    expect(isValidPhoneForCountry("2025550147", "US")).toBe(true);
    expect(isValidPhoneForCountry("123", "US")).toBe(false);
  });
});

describe("stripPhoneInput — 입력 시점에 강제한다", () => {
  it("하이픈·괄호·공백을 즉시 제거한다", () => {
    expect(stripPhoneInput("(202) 555-0147")).toBe("2025550147");
    expect(stripPhoneInput("010 1234 5678")).toBe("01012345678");
  });

  it("선행 +는 남긴다 — 국가번호를 직접 치는 사람이 있다", () => {
    expect(stripPhoneInput("+82 10-1234-5678")).toBe("+821012345678");
    // 중간의 + 는 남기지 않는다(의미가 없다)
    expect(stripPhoneInput("202+555")).toBe("202555");
  });
});
