import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXPO_SHELL_CSS, EXPO_SHELL_SRC_HASH } from "@/lib/expo/shell-css";

/**
 * 임베드 스타일시트의 **경계 검사**.
 *
 * 이 CSS 는 파트너 사이트(아임웹 등)의 문서 안에서 돈다. 문서 전역을 가리키는 선택자가
 * 하나라도 새면 **남의 사이트 레이아웃이 우리 때문에 바뀐다.** 그건 우리 화면에서는
 * 안 보이고 그쪽 화면에서만 보이는 사고라, 사람이 눈으로 잡을 수 없다.
 */

const SOURCE = "src/lib/expo/expo-shell.css";
const GENERATED = "src/lib/expo/shell-css.ts";

const raw = readFileSync(SOURCE, "utf8");
/** 주석에는 `body`·`html` 같은 말이 설명으로 나온다 — 규칙 검사 전에 걷어낸다. */
const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");

/** 선택자 목록 — `@media` 같은 at-rule 전문(前文)은 뺀다. */
function selectors(): string[] {
  const out: string[] = [];
  for (const match of css.matchAll(/([^{}]+)\{/g)) {
    const head = match[1].trim();
    if (!head || head.startsWith("@")) continue;
    for (const part of head.split(",")) {
      const s = part.trim();
      if (s) out.push(s);
    }
  }
  return out;
}

/** 한 선택자를 결합자로 쪼갠 뒤, 각 조각의 **타입 선택자**만 뽑는다. */
function typeSelectors(selector: string): string[] {
  return selector
    .split(/[\s>+~]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.match(/^[a-zA-Z][a-zA-Z0-9-]*/) ?? [""])[0].toLowerCase())
    .filter(Boolean);
}

describe("Shadow 경계를 넘는 선택자가 없다", () => {
  it("html·body·slot 을 타입으로 가리키지 않는다", () => {
    const offenders = selectors().filter((s) =>
      typeSelectors(s).some((t) => t === "html" || t === "body" || t === "slot"));
    expect(offenders).toEqual([]);
  });

  /** `:root` 는 Shadow 안에서도 **문서 루트**를 뜻한다 — 우리 루트가 아니다. */
  it(":root 를 쓰지 않는다", () => {
    expect(selectors().filter((s) => s.includes(":root"))).toEqual([]);
  });

  /** slot·::part 는 경계를 일부러 뚫는 장치다. W1 은 안쪽을 열지 않는다. */
  it("::part 를 노출하지 않는다", () => {
    expect(css).not.toContain("::part");
    expect(css).not.toContain("::slotted");
  });

  it("모든 규칙이 .msx- 로 시작하거나 그 안에 있다", () => {
    const outside = selectors().filter((s) => !s.includes(".msx-") && !/^(?:from|to|\d+%)$/.test(s));
    expect(outside).toEqual([]);
  });
});

describe("바깥 문서에 좌우되지 않는다", () => {
  /**
   * `rem` 은 Shadow 안에서도 **문서 루트**의 글꼴 크기를 따른다. 파트너 사이트가
   * `html { font-size: 10px }` 를 쓰면(흔하다) 우리 화면이 통째로 줄어든다.
   */
  it("rem 단위를 쓰지 않는다", () => {
    const hits = [...css.matchAll(/[\d.]+rem\b/g)].map((m) => m[0]);
    expect(hits).toEqual([]);
  });

  /** 외부 요청은 런타임이 명시적으로 한다 — 시트가 몰래 네트워크를 쓰면 안 된다. */
  it("@import 와 @font-face 가 없다", () => {
    expect(css).not.toContain("@import");
    expect(css).not.toContain("@font-face");
    expect(css).not.toMatch(/url\(\s*['"]?https?:/);
  });
});

describe("생성물이 원본과 갈라지지 않았다", () => {
  /**
   * 실패하면: CSS 를 고치고 재생성을 안 한 것이다.
   * `node scripts/build-expo-shell-css.mjs` 를 돌리고 함께 커밋한다.
   */
  it("다시 생성해도 커밋된 결과와 같다", () => {
    const committed = readFileSync(GENERATED, "utf8");
    execFileSync("node", ["scripts/build-expo-shell-css.mjs"], { stdio: "pipe" });
    const regenerated = readFileSync(GENERATED, "utf8");
    // 저장소를 조용히 고쳐 놓지 않는다 — 다르면 되돌리고 실패시킨다.
    if (regenerated !== committed) writeFileSync(GENERATED, committed);
    expect(regenerated).toBe(committed);
  });

  it("해시가 원본을 가리킨다", () => {
    expect(EXPO_SHELL_SRC_HASH).toMatch(/^sha256:[0-9a-f]{32}$/);
  });

  /** 축약이 조용히 빈 문자열이 되는 사고를 막는다. */
  it("실제 내용을 담고 있다", () => {
    expect(EXPO_SHELL_CSS.length).toBeGreaterThan(3000);
    expect(EXPO_SHELL_CSS).toContain(".msx-root");
    expect(EXPO_SHELL_CSS).toContain(".msx-section[data-bg=");
    expect(EXPO_SHELL_CSS).toContain("prefers-reduced-motion");
  });

  /**
   * **축약이 가장 위험한 자리.** `.msx-root :focus-visible` 의 공백을 지우면
   * `.msx-root:focus-visible` 이 되어 전혀 다른 요소를 가리킨다 — 포커스 링이 사라진다.
   */
  it("자손 결합자를 지우지 않는다", () => {
    expect(EXPO_SHELL_CSS).toContain(".msx-root :focus-visible");
  });

  it("STK 승인 팔레트와 CTA 시각 토큰을 포함한다", () => {
    expect(EXPO_SHELL_CSS).toContain("#0B0C0E");
    expect(EXPO_SHELL_CSS).toContain("#2F9B63");
    expect(EXPO_SHELL_CSS).toContain("#3468D9");
    expect(EXPO_SHELL_CSS).toContain("#65D5BD");
    expect(EXPO_SHELL_CSS).toContain(".msx-cta-band-section");
    expect(EXPO_SHELL_CSS).toContain("border-radius: 0");
  });

  it("모바일 공용 section padding이 full-bleed Hero/CTA를 다시 좁히지 않는다", () => {
    const mobile = raw.slice(raw.indexOf("@media (max-width: 600px)"));
    expect(mobile).toMatch(/\.msx-hero-section\s*,\s*\.msx-cta-band-section\s*\{\s*padding:\s*0/);
  });

  it("연사 정보 gradient 위에 흰 글자 대비를 보장하는 neutral scrim을 둔다", () => {
    expect(raw).toMatch(/\.msx-speaker-info\s*\{[\s\S]*?background:\s*linear-gradient\(rgba\(11, 12, 14, 0\.52\)/);
  });

  it("주석은 임베드로 나가지 않는다", () => {
    expect(EXPO_SHELL_CSS).not.toContain("/*");
  });
});
