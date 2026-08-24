// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { COLLECT_FORM_CSS, COLLECT_FORM_STYLE_ID, ensureFormStyles } from "@/lib/collect-form/css";

/**
 * 스타일을 **어디에** 넣는가.
 *
 * 단독 `/f` 는 문서 head 다(지금까지와 같다). 홈페이지 섹션은 그 ShadowRoot 안이다 —
 * 문서 head 에 넣으면 Shadow 안까지 닿지 않아 폼이 스타일 없이 그려지고, 동시에 파트너
 * 사이트의 전역 스타일을 우리가 늘리는 셈이 된다.
 */

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

function shadow(): ShadowRoot {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return host.attachShadow({ mode: "open" });
}

describe("설치 위치", () => {
  it("문서에는 head 에 한 벌만", () => {
    ensureFormStyles(document);
    ensureFormStyles(document);
    expect(document.head.querySelectorAll("style")).toHaveLength(1);
    expect(document.getElementById(COLLECT_FORM_STYLE_ID)?.textContent).toBe(COLLECT_FORM_CSS);
  });

  it("루트를 안 주면 문서다 — 지금까지와 같다", () => {
    ensureFormStyles();
    expect(document.head.querySelectorAll("style")).toHaveLength(1);
  });

  it("ShadowRoot 에는 그 안에 한 벌만, 문서에는 아무것도", () => {
    const root = shadow();
    ensureFormStyles(root);
    ensureFormStyles(root);
    expect(root.querySelectorAll("style")).toHaveLength(1);
    expect(document.head.querySelectorAll("style")).toHaveLength(0);
  });

  /** 섹션이 둘이면 각자 자기 Shadow 안에 필요하다 — 하나가 넣었다고 건너뛰면 안 된다. */
  it("Shadow 마다 따로 넣는다", () => {
    const a = shadow();
    const b = shadow();
    ensureFormStyles(a);
    ensureFormStyles(b);
    expect(a.querySelectorAll("style")).toHaveLength(1);
    expect(b.querySelectorAll("style")).toHaveLength(1);
  });
});

describe("서체 계약", () => {
  /**
   * 단독 `/f` 의 생김새는 바뀌지 않아야 한다 — 9/1 오픈이 그 화면 위에 있다.
   * `--msx-font` 가 없는 문서에서는 폴백 스택이 그대로 쓰인다.
   */
  it("단독 폴백 스택이 그대로다", () => {
    expect(COLLECT_FORM_CSS).toContain(
      'var(--msx-font,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Apple SD Gothic Neo","Malgun Gothic",sans-serif)',
    );
  });

  /** 등록번호는 단독에서 여전히 등폭이고, 홈페이지 안에서만 별칭을 물려받는다. */
  it("등록번호의 등폭 폴백이 그대로다", () => {
    expect(COLLECT_FORM_CSS).toContain(
      "var(--msx-font,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace)",
    );
    expect(COLLECT_FORM_CSS).toContain("font-variant-numeric:tabular-nums");
  });

  /**
   * 서체를 정하는 자리가 두 곳뿐이어야, 홈페이지 안의 **모든** 폼 자손이 별칭으로 간다.
   * 세 번째 자리가 생기면 그 부분만 시스템 서체로 남는다.
   */
  it("서체를 정하는 규칙이 그 둘뿐이다", () => {
    const declarations = [...COLLECT_FORM_CSS.matchAll(/font-family\s*:([^;}]+)/g)].map((m) => m[1].trim());
    expect(declarations).toHaveLength(2);
    for (const value of declarations) expect(value.startsWith("var(--msx-font,")).toBe(true);
  });

  /** `font:inherit` 로 물려받는 입력 칸들이 별칭까지 함께 받는다. */
  it("입력 칸은 서체를 물려받는다", () => {
    expect(COLLECT_FORM_CSS).toContain("font:inherit");
  });
});
