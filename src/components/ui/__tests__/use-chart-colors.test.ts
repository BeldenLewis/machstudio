import { describe, expect, it } from "vitest";
import { entityColor, resolveChannelColor, type ChartColors } from "@/components/ui/use-chart-colors";

/**
 * 도넛 차트가 기대는 계약: 색은 **정체성**을 따른다, 순위를 따르지 않는다(dataviz 원칙
 * "color follows the entity, never its rank"). 예전엔 정렬 순서(i번째로 큼)로 색을 배정해서
 * 카드마다 1등 채널이 항상 같은 색을 먹고, 정작 그 채널이 뭔지는 색이 말해주지 않았다.
 */

const COLORS: ChartColors = {
  viewers: "#000",
  entered: "#000",
  chat: "#000",
  grid: "#000",
  axis: "#000",
  series: ["#a", "#b", "#c", "#d", "#e"],
  brands: {
    naver: "#brand-naver",
    kakao: "#brand-kakao",
    google: "#brand-google",
    instagram: "#brand-instagram",
    youtube: "#brand-youtube",
    facebook: "#brand-facebook",
  },
};

describe("entityColor", () => {
  it("같은 라벨은 항상 같은 색 — 서로 다른(독립된) 차트에서도", () => {
    // 두 카드가 각자 빈 used 셋으로 시작 — 겹침이 없는 한(가장 흔한 경우) 같은 채널은
    // 카드가 달라도 같은 색을 유지해야 여러 카드를 나란히 볼 때 색이 신호가 된다.
    const first = entityColor(COLORS, "네이버", new Set());
    const second = entityColor(COLORS, "네이버", new Set());
    expect(first).toBe(second);
    expect(first).toBeDefined();
  });

  it("한 차트(같은 used 셋) 안에서는 라벨이 다르면 색도 겹치지 않는다", () => {
    const used = new Set<number>();
    const labels = ["네이버", "구글", "카카오", "direct", "이메일"];
    const colors = labels.map((label) => entityColor(COLORS, label, used));
    expect(colors.every((c) => c !== undefined)).toBe(true);
    expect(new Set(colors).size).toBe(labels.length);
  });

  it("함수 시그니처 자체가 순위를 받지 않는다 — 앞에 다른(겹치지 않는) 라벨이 슬롯을 먼저 차지해도 뒤 라벨의 색은 그대로", () => {
    // 예전 버그: 정렬된 배열의 인덱스(i)로 색을 뽑아 "1등 채널"이 항상 같은 색이었다.
    // "구글"(자연 슬롯 0)과 "direct"(자연 슬롯 1)는 서로 겹치지 않는다 — 어느 게 먼저 와도
    // 서로의 배정에 영향을 주지 않는다는 걸 확인한다.
    const directAlone = entityColor(COLORS, "direct", new Set());

    const used = new Set<number>();
    entityColor(COLORS, "구글", used); // 순위 1등이 먼저 슬롯을 차지
    const directAfterGoogle = entityColor(COLORS, "direct", used); // 순위 2등

    expect(directAfterGoogle).toBe(directAlone);
  });

  it("슬롯이 모두 찼으면 색을 새로 만들지 않고 undefined — 호출자가 접도록", () => {
    const used = new Set([0, 1, 2, 3, 4]);
    expect(entityColor(COLORS, "여섯번째", used)).toBeUndefined();
  });
});

describe("resolveChannelColor", () => {
  it("사용자 지정(override) > 브랜드 기본값 > 해시 폴백 순으로 우선한다", () => {
    // 오버라이드가 있으면 브랜드 기본값(naver=초록)을 무시하고 그 색을 쓴다.
    expect(resolveChannelColor(COLORS, "naver", { naver: "#ff00ff" }, new Set())).toBe("#ff00ff");
    // 오버라이드가 없으면 알려진 채널은 브랜드 기본값.
    expect(resolveChannelColor(COLORS, "naver", null, new Set())).toBe(COLORS.brands.naver);
    // 알려진 채널이 아니면 entityColor 해시 폴백(series 슬롯 중 하나).
    const fallback = resolveChannelColor(COLORS, "알수없는채널", null, new Set());
    expect(COLORS.series).toContain(fallback);
  });

  it("한/영 라벨이 같은 브랜드로 매칭된다 — 채널은 마케터가 자유 텍스트로 입력한다", () => {
    expect(resolveChannelColor(COLORS, "네이버", null, new Set())).toBe(COLORS.brands.naver);
    expect(resolveChannelColor(COLORS, "Naver", null, new Set())).toBe(COLORS.brands.naver);
    expect(resolveChannelColor(COLORS, "인스타그램", null, new Set())).toBe(COLORS.brands.instagram);
    expect(resolveChannelColor(COLORS, "IG", null, new Set())).toBe(COLORS.brands.instagram);
  });

  it("오버라이드 키도 대소문자를 가리지 않고 매칭된다", () => {
    expect(resolveChannelColor(COLORS, "Kakao", { kakao: "#123456" }, new Set())).toBe("#123456");
  });

  it("잘못된 hex 오버라이드는 무시하고 다음 단계(브랜드 기본값)로 넘어간다 — 임의 문자열이 그대로 inline style 에 들어가지 않게", () => {
    expect(resolveChannelColor(COLORS, "naver", { naver: "javascript:alert(1)" }, new Set())).toBe(COLORS.brands.naver);
    expect(resolveChannelColor(COLORS, "naver", { naver: "red" }, new Set())).toBe(COLORS.brands.naver);
  });

  it("오버라이드/브랜드 색은 categorical 슬롯(used)을 점유하지 않는다", () => {
    const used = new Set<number>();
    resolveChannelColor(COLORS, "네이버", null, used); // 브랜드 색 — 슬롯 미점유
    expect(used.size).toBe(0);
    const fallback1 = resolveChannelColor(COLORS, "미지채널A", null, used);
    const fallback2 = resolveChannelColor(COLORS, "미지채널B", null, used);
    expect(fallback1).not.toBe(fallback2); // 폴백끼리는 여전히 서로 겹치지 않는다
  });
});
