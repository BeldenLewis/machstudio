import { describe, expect, it } from "vitest";
import { countryOfE164, toE164 } from "@/lib/collect-phone";

/**
 * **기준 국가를 잘못 잡으면 전화가 조용히 날아간다.**
 *
 * 제출은 방문자가 고른 국가로 파싱하는데 그 선택값이 저장되지 않는다. 그래서 레코드를
 * 나중에 고칠 때는 소스 기본 국가밖에 없고, 기본이 US 인 전시(LA)에 한국 번호로 등록한
 * 사람은 **이름 오타 하나를 고쳐 주는 순간** 전화가 사라졌다. 저장된 번호 자체가 국가를
 * 알고 있으므로 그걸 폴백으로 쓴다.
 */
describe("저장된 번호에서 국가를 되읽는다", () => {
  it("E.164 에서 국가를 알아낸다", () => {
    expect(countryOfE164("+821012345678")).toBe("KR");
    expect(countryOfE164("+819012345678")).toBe("JP");
    expect(countryOfE164("+12025550147")).toBe("US");
  });

  it("모양이 아니면 null — 던지지 않는다", () => {
    for (const v of ["", "01012345678", "not a number", null, undefined, 42, {}]) {
      expect(() => countryOfE164(v)).not.toThrow();
      expect(countryOfE164(v)).toBeNull();
    }
  });
});

/** 이게 실제로 벌어지던 손실이다 — 기본 국가만으로는 읽히지 않는다. */
describe("기본 국가가 다르면 손실이 난다", () => {
  it("한국 번호를 US 기준으로 읽으면 null 이다", () => {
    expect(toE164("01012345678", "US")).toBeNull();
  });

  it("저장된 번호의 국가로는 읽힌다", () => {
    const stored = "+821012345678";
    expect(countryOfE164(stored)).toBe("KR");
    expect(toE164("01012345678", countryOfE164(stored)!)).toBe(stored);
  });

  /** 라우트가 쓰는 순서를 그대로 재현한다: 기본 → 실패하면 옛 번호의 국가. */
  const rederive = (raw: string, fallback: string, stored: string | null) => {
    const prior = countryOfE164(stored);
    return toE164(raw, fallback) ?? (prior ? toE164(raw, prior) : null);
  };

  it("US 기본 전시에서 한국 번호가 살아남는다", () => {
    expect(rederive("01012345678", "US", "+821012345678")).toBe("+821012345678");
  });

  it("일본 번호도 마찬가지", () => {
    expect(rederive("09012345678", "US", "+819012345678")).toBe("+819012345678");
  });

  it("기본 국가로 읽히면 그쪽이 이긴다 — 폴백이 정상 경로를 가로채지 않는다", () => {
    expect(rederive("2025550147", "US", "+821012345678")).toBe("+12025550147");
  });

  it("`+` 로 시작하면 입력이 이긴다", () => {
    expect(rederive("+821012345678", "US", null)).toBe("+821012345678");
  });

  it("정말 못 읽는 값은 여전히 null", () => {
    expect(rederive("전화없음", "US", "+821012345678")).toBeNull();
  });

  it("저장된 번호가 없으면 기본 국가만 쓴다 — 옛 동작 그대로", () => {
    expect(rederive("01012345678", "US", null)).toBeNull();
    expect(rederive("01012345678", "KR", null)).toBe("+821012345678");
  });
});
