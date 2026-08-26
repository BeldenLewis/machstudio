import { describe, expect, it } from "vitest";
import { toColorInputValue } from "../DonutChart";

/**
 * <input type="color"> 는 3자리 축약 hex(예: "#0f0")를 안 받아 검게 리셋해 버린다.
 * 도넛 범례의 색 점을 그대로 <input type="color"> 의 value 로 넣으므로, 브랜드/오버라이드
 * 색이 우연히 3자리로 저장돼 있으면 피커를 열자마자 검은색으로 보이는 버그가 난다.
 */
describe("toColorInputValue", () => {
  it("6자리 hex는 그대로 통과한다", () => {
    expect(toColorInputValue("#0a9e6e")).toBe("#0a9e6e");
  });

  it("3자리 축약 hex는 6자리로 편다", () => {
    expect(toColorInputValue("#0f0")).toBe("#00ff00");
    expect(toColorInputValue("#abc")).toBe("#aabbcc");
  });

  it("앞뒤 공백은 무시한다", () => {
    expect(toColorInputValue("  #123456  ")).toBe("#123456");
  });

  it("hex가 아닌 값(rgb·이름·빈 문자열)은 검은색으로 안전하게 떨어진다", () => {
    expect(toColorInputValue("red")).toBe("#000000");
    expect(toColorInputValue("rgb(0,0,0)")).toBe("#000000");
    expect(toColorInputValue("")).toBe("#000000");
  });
});
