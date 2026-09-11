import { describe, expect, it } from "vitest";
import { resolveVisitorBadgeLabel, visitorBadgePalette } from "@/lib/collect-badge";

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

describe("응답값 기반 배지 이름", () => {
  const config = {
    badgeRules: [{
      id: "ambassador",
      fieldKey: "media_type",
      operator: "contains" as const,
      value: "Korea Expo LA 2026 Ambassador",
      label: "Ambassador",
      backgroundColor: "#7C3AED",
    }],
  };

  it("일치하는 응답은 설정한 이름으로 바꾼다", () => {
    expect(resolveVisitorBadgeLabel(config, { media_type: "Korea Expo LA 2026 Ambassador" }, "Press"))
      .toBe("Ambassador");
  });

  it("대소문자를 구분하지 않고 배열 응답도 찾는다", () => {
    expect(resolveVisitorBadgeLabel(config, { media_type: ["News", "korea expo la 2026 ambassador"] }, "Press"))
      .toBe("Ambassador");
  });

  it("일치하지 않으면 기존 참가자 유형을 유지한다", () => {
    expect(resolveVisitorBadgeLabel(config, { media_type: "Broadcast" }, "Press")).toBe("Press");
  });

  it("규칙에서 지정한 색과 읽기 쉬운 글자색을 사용한다", () => {
    expect(visitorBadgePalette("Ambassador", config.badgeRules)).toEqual({
      background: "#7C3AED",
      foreground: "#FFFFFF",
    });
  });
});
