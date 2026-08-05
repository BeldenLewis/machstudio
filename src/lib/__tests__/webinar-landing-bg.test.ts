import { describe, expect, it } from "vitest";
import {
  normalizeLandingPageConfig,
  DEFAULT_LANDING_COLORS,
  DEFAULT_LANDING_SECTION_BG,
  LANDING_BG_SECTIONS,
} from "@/lib/webinar-config";

/**
 * 랜딩 섹션 배경 모드 + 배경 키컬러 두 개.
 *
 * 이 값은 **공개 페이지 CSS 에 인라인으로 들어간다**(mount 가 --bg-light/--bg-dark 로 심는다).
 * 그래서 정규화가 유일한 관문이다 — 여기서 새면 남의 사이트에 임의 문자열이 style 로 나간다.
 *
 * 그리고 기본값이 곧 **기존 웨비나들의 외관**이다. 저장한 적 없는 웨비나 수백 개가
 * 이 기본값으로 렌더되므로, 기본이 흔들리면 아무 조작도 안 한 페이지의 색이 바뀐다.
 */

const lp = (landingPage: unknown) => normalizeLandingPageConfig({ landingPage });

describe("기본값 — 저장한 적 없는 웨비나가 예전과 같아야 한다", () => {
  it("섹션 전부 다크", () => {
    const { sectionBg } = lp({});
    expect(sectionBg).toEqual(DEFAULT_LANDING_SECTION_BG);
    expect(Object.values(sectionBg).every((v) => v === "dark")).toBe(true);
  });

  it("배경 키컬러는 예전 --ink / --paper 값", () => {
    expect(lp({}).colors).toEqual({ lightBg: "#f6f8ff", darkBg: "#06080d" });
    expect(DEFAULT_LANDING_COLORS).toEqual({ lightBg: "#f6f8ff", darkBg: "#06080d" });
  });

  it("config 자체가 없거나 이상해도 기본값으로 떨어진다", () => {
    for (const bad of [undefined, null, "x", 42, [], { landingPage: [] }]) {
      const out = normalizeLandingPageConfig(bad);
      expect(out.colors, JSON.stringify(bad)).toEqual(DEFAULT_LANDING_COLORS);
      expect(out.sectionBg, JSON.stringify(bad)).toEqual(DEFAULT_LANDING_SECTION_BG);
    }
  });
});

describe("섹션 모드", () => {
  it("light 만 통과하고 나머지는 기본(dark)으로", () => {
    const { sectionBg } = lp({
      sectionBg: { hero: "light", intro: "LIGHT", faq: "bright", join: null, programs: 1 },
    });
    expect(sectionBg.hero).toBe("light");
    // 대소문자·유사어·타입 오류는 전부 기본값 — 공개 CSS 에 들어가는 값이라 관대하게 받지 않는다
    expect(sectionBg.intro).toBe("dark");
    expect(sectionBg.faq).toBe("dark");
    expect(sectionBg.join).toBe("dark");
    expect(sectionBg.programs).toBe("dark");
  });

  it("모르는 섹션 키는 버린다 — 맵에 정확히 선언된 섹션만 남는다", () => {
    const { sectionBg } = lp({ sectionBg: { hero: "light", nope: "light" } });
    expect(Object.keys(sectionBg).sort()).toEqual(LANDING_BG_SECTIONS.map((s) => s.key).sort());
  });

  it("세션·타임테이블도 모드를 가진다 — 키컬러 전환 전후에 보이는 바탕색이다", () => {
    expect(LANDING_BG_SECTIONS.some((s) => s.key === "sessions")).toBe(true);
    expect(lp({ sectionBg: { sessions: "light" } }).sectionBg.sessions).toBe("light");
  });

  it("편집 UI 목록 순서가 랜딩 렌더 순서와 같다", () => {
    expect(LANDING_BG_SECTIONS.map((s) => s.key)).toEqual([
      "hero", "intro", "sessions", "programs", "audience", "highlights", "join", "faq", "sponsors",
    ]);
  });

  /**
   * 혜택은 키컬러 구간(accent-zone)이라 **자기 배경을 칠하지 않는다** — 세션·타임테이블과 같다.
   * 그래서 편집 UI 에 자기 칸이 없다: 골라도 아무 일이 안 일어나는 칸이면 "설정했는데 안 먹는다"
   * 가 된다. 값은 sectionBg.sessions 하나를 공유하고, 라벨이 세 섹션을 함께 말한다.
   */
  /**
   * 혜택은 **일반 섹션**이다 — 자기 배경을 칠하고 지브라 교대에 참여한다. 한때 accent-zone 으로
   * 두었지만 키컬러 구간이 셋이 되어 전환이 잦고 위아래 색 경계가 읽히지 않아 되돌렸다.
   * 그래서 편집 UI 에 자기 칸이 있어야 한다 — 없으면 운영자가 이 섹션 색만 못 고친다.
   */
  it("혜택도 자기 배경 칸을 갖는다 — 일반 섹션이다", () => {
    expect(LANDING_BG_SECTIONS.some((s) => s.key === "highlights")).toBe(true);
    expect(lp({ sectionBg: { highlights: "light" } }).sectionBg.highlights).toBe("light");
    // 키컬러 구간 라벨에서 혜택이 빠졌다
    expect(LANDING_BG_SECTIONS.find((s) => s.key === "sessions")!.label).not.toContain("혜택");
  });
});

describe("배경 키컬러 — 6자리 hex 만", () => {
  it("정상 hex 는 소문자로 통과", () => {
    expect(lp({ colors: { lightBg: "#FFF5E6", darkBg: "#1A0F2E" } }).colors)
      .toEqual({ lightBg: "#fff5e6", darkBg: "#1a0f2e" });
  });

  it("공백은 다듬는다", () => {
    expect(lp({ colors: { lightBg: "  #abcdef  " } }).colors.lightBg).toBe("#abcdef");
  });

  /**
   * 이 값은 style 속성으로 나가므로 CSS 를 탈출할 수 있는 문자열이 절대 통과해선 안 된다.
   * 3자리 축약(#fff)도 막는다 — 통과 폭을 넓히면 검증 규칙이 두 갈래가 된다.
   */
  it("hex 가 아닌 것은 전부 기본값으로 — CSS 주입 경로를 남기지 않는다", () => {
    for (const bad of [
      "red", "#fff", "#ggghhh", "rgb(0,0,0)", "var(--x)",
      "#000; background:url(x)", "#000000 !important", "", "  ", null, 42, {}, ["#000000"],
    ]) {
      const out = lp({ colors: { lightBg: bad, darkBg: bad } });
      expect(out.colors, JSON.stringify(bad)).toEqual(DEFAULT_LANDING_COLORS);
    }
  });

  it("한쪽만 유효하면 그쪽만 반영된다", () => {
    expect(lp({ colors: { lightBg: "#ffffff", darkBg: "nope" } }).colors)
      .toEqual({ lightBg: "#ffffff", darkBg: DEFAULT_LANDING_COLORS.darkBg });
  });
});

describe("기존 필드를 건드리지 않는다", () => {
  it("배경 값을 추가해도 다른 섹션 설정은 그대로", () => {
    const out = lp({
      enabled: true,
      venue: "OFFLINE",
      sectionBg: { hero: "light" },
      colors: { lightBg: "#ffffff" },
      faq: { enabled: false, items: [] },
    });
    expect(out.enabled).toBe(true);
    expect(out.venue).toBe("OFFLINE");
    expect(out.faq.enabled).toBe(false);
    expect(out.ctaLabel).toBe("사전 등록하기");
  });
});

describe.each(["highlights", "sponsors"] as const)("%s 배경 — 나중에 생긴 칸의 기본값", (key) => {
  /**
   * 이 칸이 없던 웨비나에 전역 기본값("전부 다크")을 주면 나머지가 화이트인 페이지에서
   * 이 섹션만 검은 띠가 된다. FAQ 이웃(혜택은 위, 스폰서는 아래)을 따르게 해서 경계를 자연스럽게.
   */
  it("저장값이 없으면 FAQ 를 따른다", () => {
    expect(lp({ sectionBg: { faq: "light" } }).sectionBg[key]).toBe("light");
    expect(lp({ sectionBg: { faq: "dark" } }).sectionBg[key]).toBe("dark");
  });

  it("직접 고른 값이 FAQ 를 이긴다", () => {
    expect(lp({ sectionBg: { faq: "light", [key]: "dark" } }).sectionBg[key]).toBe("dark");
    expect(lp({ sectionBg: { faq: "dark", [key]: "light" } }).sectionBg[key]).toBe("light");
  });

  it("둘 다 없으면 전역 기본(다크)", () => {
    expect(lp({}).sectionBg[key]).toBe("dark");
  });
});
