import { describe, expect, it } from "vitest";
import { visitorBadgePalette } from "@/lib/collect-badge";

describe("참관객 유형 배지 색상", () => {
  it("General, Buyer, Press를 서로 다른 고대비 색으로 구분한다", () => {
    const colors = ["General", "Buyer", "Press"].map((type) => visitorBadgePalette(type).background);
    expect(new Set(colors).size).toBe(3);
    expect(colors).toEqual(["#F28C18", "#2563EB", "#C026D3"]);
  });

  it("알 수 없는 유형도 이름이 같으면 항상 같은 색을 받는다", () => {
    expect(visitorBadgePalette("VIP")).toEqual(visitorBadgePalette("vip"));
  });
});
