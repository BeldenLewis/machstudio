import { describe, expect, it } from "vitest";
import { expoThemeVars, expoThemeVarsCss, EXPO_FONT_FAMILY, EXPO_FONT_PATH } from "@/lib/expo/css";
import { onAccentColor, paperFor } from "@/lib/color";
import { EXPO_SHELL_CSS } from "@/lib/expo/shell-css";

/**
 * 테마 → 토큰.
 *
 * 색 판정은 `lib/color.ts` 한 벌만 쓴다. 여기서 다시 계산하면 같은 키컬러가 화면마다
 * 다른 글자색을 받는다 — 이 저장소가 실제로 겪은 갈라짐이다.
 */

const THEME = { accent: "#ff8500", lightBg: "#ffffff", darkBg: "#111318" };

describe("테마 토큰", () => {
  it("글자색·대비를 공용 계산에서 가져온다", () => {
    const vars = expoThemeVars(THEME);
    expect(vars["--msx-on-accent"]).toBe(onAccentColor(THEME.accent));
    expect(vars["--msx-text"]).toBe(paperFor(THEME.lightBg));
    expect(vars["--msx-dark-text"]).toBe(paperFor(THEME.darkBg));
  });

  /** 보조 문구는 본문 색의 알파다 — 어느 배경에서든 같은 관계가 유지된다. */
  it("보조 문구는 본문 색에서 파생한다", () => {
    const vars = expoThemeVars(THEME);
    expect(vars["--msx-muted"]).toContain("rgba(");
    expect(vars["--msx-dark-muted"]).toContain("rgba(");
    expect(vars["--msx-muted"]).not.toBe(vars["--msx-dark-muted"]);
  });

  it("시트가 쓰는 색 토큰을 빠짐없이 낸다", () => {
    const provided = new Set(Object.keys(expoThemeVars(THEME)));
    // 시트에서 실제로 참조하는 색 토큰만 추린다(반경·그림자·서체는 시트에 고정값이 있다).
    const referenced = new Set(
      [...EXPO_SHELL_CSS.matchAll(/var\((--msx-[a-z-]+)/g)].map((m) => m[1]),
    );
    const colorTokens = [...referenced].filter((t) =>
      !["--msx-radius", "--msx-shadow", "--msx-shadow-lifted", "--msx-font"].includes(t));
    expect(colorTokens.filter((t) => !provided.has(t))).toEqual([]);
  });

  it("문자열 형태도 같은 값을 준다", () => {
    const css = expoThemeVarsCss(THEME);
    for (const [key, value] of Object.entries(expoThemeVars(THEME))) {
      expect(css).toContain(`${key}:${value}`);
    }
  });
});

describe("서체 계약", () => {
  /**
   * 별칭이 `Pretendard` 면, 그 이름으로 자기 폰트를 이미 등록해 둔 파트너 사이트에서
   * 우리 화면이 **남의 파일**을 쓴다.
   */
  it("흔한 이름을 쓰지 않는다", () => {
    expect(EXPO_FONT_FAMILY).toBe("__mach_expo_pretendard_v1");
    expect(EXPO_FONT_FAMILY).not.toBe("Pretendard");
  });

  /** 경로에 버전이 박혀야 1년 불변 캐시가 안전하다. */
  it("경로에 버전이 박혀 있다", () => {
    expect(EXPO_FONT_PATH).toMatch(/^\/fonts\/pretendard\/v\d+\.\d+\.\d+\/[\w.-]+\.woff2$/);
  });

  it("시트가 그 별칭을 쓴다", () => {
    expect(EXPO_SHELL_CSS).toContain(EXPO_FONT_FAMILY);
  });
});
