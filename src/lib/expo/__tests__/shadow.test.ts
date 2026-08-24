// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EXPO_HOST_MARK, EXPO_HOST_TAG, findExpoShell, mountExpoShell, type ExpoShellHandle,
} from "@/lib/expo/shadow";
import { EXPO_HOST_RESET_CSS, EXPO_PORTAL_RESET_CSS } from "@/lib/expo/host-reset";
import { EXPO_SHEET_MARK, canAdoptStyleSheets, ensureExpoStyles, resetExpoSheetRegistry } from "@/lib/expo/sheet";
import { EXPO_SHELL_CSS } from "@/lib/expo/shell-css";
import { expoThemeVars } from "@/lib/expo/css";
import { resetExpoFontRegistry } from "@/lib/expo/font";

/**
 * Shadow 껍데기.
 *
 * 이 코드는 파트너 사이트(아임웹 등) 문서 안에서 돈다. 여기서 지키는 것은 두 가지다:
 * **그들의 CSS 가 우리를 못 깨는 것**, 그리고 **우리가 그들을 못 깨는 것**.
 * 두 번째가 더 중요하다 — 우리 화면이 안 보이는 것보다 그들 사이트가 망가지는 게 나쁘다.
 */

const THEME = { accent: "#ff8500", lightBg: "#ffffff", darkBg: "#111318" };
const ORIGIN = "https://mach.example.com";

const mount = (over: Partial<Parameters<typeof mountExpoShell>[0]> = {}) => {
  const container = over.container ?? document.createElement("div");
  if (!over.container) document.body.appendChild(container);
  return mountExpoShell({ container, pageId: "pg1", theme: THEME, origin: ORIGIN, ...over });
};

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  resetExpoSheetRegistry(globalThis as never);
  resetExpoFontRegistry(globalThis as never);
  delete (globalThis as Record<string, unknown>).__MACH_EXPO_MOUNTS_V1__;
});

describe("구조", () => {
  it("파트너 컨테이너 안에 우리 호스트를 만든다", () => {
    const container = document.createElement("div");
    container.setAttribute("class", "partner-widget");
    document.body.appendChild(container);

    const shell = mount({ container })!;
    expect(shell.host.tagName.toLowerCase()).toBe(EXPO_HOST_TAG);
    expect(shell.host.parentElement).toBe(container);
    // 컨테이너는 사이트 주인이 정한 폭·배치 계약이다 — 손대지 않는다.
    expect(container.getAttribute("class")).toBe("partner-widget");
    expect(container.getAttribute("style")).toBeNull();
  });

  /**
   * 하이픈 든 이름 하나로 파트너 테마의 **타입 선택자**가 위협 모델에서 사라진다 —
   * 아임웹 테마는 `div{…}`·`section{…}` 으로 가득하다.
   */
  it("호스트에 class 도 id 도 붙이지 않는다", () => {
    const shell = mount()!;
    expect(shell.host.hasAttribute("class")).toBe(false);
    expect(shell.host.hasAttribute("id")).toBe(false);
    expect(shell.host.getAttribute(EXPO_HOST_MARK)).toBe("1");
  });

  /**
   * `lang`·`dir` 은 속성이라 `all:initial` 이 되돌릴 수 없고 어떤 CSS 로도 못 덮는다.
   * `<html lang="en">` 페이지에서 없으면 한글이 라틴 폰트 폴백과 라틴 줄바꿈을 받는다.
   */
  it("lang 과 dir 을 속성으로 못 박는다", () => {
    const shell = mount()!;
    expect(shell.host.getAttribute("lang")).toBe("ko");
    expect(shell.renderRoot.getAttribute("dir")).toBe("ltr");
  });

  it("열린 ShadowRoot 안에 렌더 루트를 둔다", () => {
    const shell = mount()!;
    expect(shell.host.shadowRoot).toBe(shell.root);
    expect(shell.renderRoot.parentNode).toBe(shell.root);
    expect(shell.renderRoot.className).toBe("msx-root");
  });

  /** 슬롯은 **호스트의 라이트 자식**을 그린다 — 파트너 채팅·광고 스크립트가 끼워 넣은 것까지. */
  it("slot 을 만들지 않는다", () => {
    const shell = mount()!;
    expect(shell.root.querySelector("slot")).toBeNull();
  });

  it("떼어진 컨테이너에는 붙지 않는다", () => {
    expect(mountExpoShell({
      container: document.createElement("div"), pageId: "pg1", theme: THEME, origin: ORIGIN,
    })).toBeNull();
  });
});

describe("인라인 리셋", () => {
  it("all:initial 이 맨 앞이다", () => {
    expect(EXPO_HOST_RESET_CSS.startsWith("all:initial;")).toBe(true);
    expect(EXPO_PORTAL_RESET_CSS.startsWith("all:initial;")).toBe(true);
  });

  /** all:initial 은 display 를 inline 으로 만든다 — inline 호스트는 컨테이너가 못 된다. */
  it("display:block 을 되살린다", () => {
    expect(EXPO_HOST_RESET_CSS).toContain("display:block!important");
  });

  /**
   * `all` 은 `direction`·`unicode-bidi` **를 제외한** 모든 속성의 단축이다.
   * rtl 페이지에서 상속된 rtl 이 그대로 와 우리 박스가 float 반대쪽에 놓인다.
   */
  it("all 이 못 건드리는 둘을 따로 못 박는다", () => {
    for (const css of [EXPO_HOST_RESET_CSS, EXPO_PORTAL_RESET_CSS]) {
      expect(css).toContain("direction:ltr!important");
      expect(css).toContain("unicode-bidi:isolate!important");
    }
  });

  /**
   * 아임웹 스크롤 리빌 테마는 `.ani{opacity:0}` 로 시작해 **자기 요소만** 풀어 준다.
   * 이게 없으면 우리 구획은 라이브에서 영영 안 보이는데 미리보기는 완벽해 보인다.
   */
  it("비표시 시작 상태를 되돌린다", () => {
    expect(EXPO_HOST_RESET_CSS).toContain("visibility:visible!important");
    expect(EXPO_HOST_RESET_CSS).toContain("opacity:1!important");
    expect(EXPO_HOST_RESET_CSS).toContain("pointer-events:auto!important");
  });

  /** `*{animation:… both!important}` 는 첫 키프레임이 opacity:0 이면 영구 비표시다. */
  it("호스트의 애니메이션·트랜지션을 끊는다", () => {
    for (const css of [EXPO_HOST_RESET_CSS, EXPO_PORTAL_RESET_CSS]) {
      expect(css).toContain("animation:none!important");
      expect(css).toContain("transition:none!important");
    }
  });

  /**
   * **경계.** 선언은 "남이 우리 박스에 걸어 둔 제약을 무력화" 만 한다.
   * 크기나 위치를 주장하면 파트너 레이아웃을 우리가 깬다.
   */
  it("섹션 호스트는 크기·위치를 주장하지 않는다", () => {
    // 선언 단위로 본다 — `min-width`·`max-width` 는 우리 요소만 제약하므로 금지가 아니다.
    const banned: Array<[string, RegExp]> = [
      ["width", /(^|;)\s*width\s*:/],
      ["inline-size", /(^|;)\s*inline-size\s*:/],
      ["z-index", /(^|;)\s*z-index\s*:/],
      ["background", /(^|;)\s*background/],
      ["position:absolute", /position\s*:\s*absolute/],
      ["position:fixed", /position\s*:\s*fixed/],
      ["position:relative", /position\s*:\s*relative/],
      ["margin:auto", /margin[^;]*auto/],
      ["negative margin", /margin[^;]*:\s*-/],
      ["vw length", /\d(vw|vh)/],
    ];
    for (const [name, pattern] of banned) {
      expect(`${name}: ${pattern.test(EXPO_HOST_RESET_CSS)}`).toBe(`${name}: false`);
    }
    // 우리 요소만 제약하는 것은 경계 위반이 아니다.
    expect(EXPO_HOST_RESET_CSS).toContain("max-width:none!important");
    expect(EXPO_HOST_RESET_CSS).toContain("min-width:0!important");
  });

  /**
   * 포털은 다르다. body 직계라 static 이면 `body{display:flex}` 테마에서 **flex 항목**이
   * 되어 유령 칸을 만들고, 호스트 z-index 가 없으면 모달이 파트너 sticky 헤더 뒤로 간다.
   */
  it("포털 호스트는 0×0 고정 박스이고 z-index 를 갖는다", () => {
    expect(EXPO_PORTAL_RESET_CSS).toContain("position:fixed!important");
    expect(EXPO_PORTAL_RESET_CSS).toContain("width:0!important");
    expect(EXPO_PORTAL_RESET_CSS).toContain("height:0!important");
    expect(EXPO_PORTAL_RESET_CSS).toContain("z-index:2147483000!important");
  });

  /** transform 계열이 하나라도 걸리면 `.msx-portal{inset:0}` 이 0×0 기준으로 계산된다. */
  it("포털 호스트는 컨테이닝 블록이 되지 않는다", () => {
    for (const prop of ["transform:none", "filter:none", "backdrop-filter:none", "perspective:none", "will-change:auto", "contain:none"]) {
      expect(`${prop}: ${EXPO_PORTAL_RESET_CSS.includes(prop + "!important")}`).toBe(`${prop}: true`);
    }
  });

  it("호스트에 실제로 바른다", () => {
    expect(mount()!.host.getAttribute("style")).toBe(EXPO_HOST_RESET_CSS);
  });

  /** 파트너 스크립트가 style 을 지웠을 수 있다 — 재진입마다 다시 바른다. */
  it("재진입에서 다시 바른다", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const shell = mount({ container })!;
    shell.host.setAttribute("style", "display:none");
    mount({ container });
    expect(shell.host.getAttribute("style")).toBe(EXPO_HOST_RESET_CSS);
  });
});

describe("스타일시트", () => {
  /**
   * **jsdom 29 는 `new CSSStyleSheet()` 와 `replaceSync()` 를 지원하지만
   * `adoptedStyleSheets` 접근자가 없다.** 생성 가능성만 보고 판정하면 채택 경로를 타고
   * 스타일이 하나도 안 붙은 채 모든 테스트가 통과한다.
   */
  it("채택 가능 판정에 adoptedStyleSheets 존재를 반드시 본다", () => {
    const shell = mount()!;
    const view = window as Window & typeof globalThis;
    expect(typeof view.CSSStyleSheet).toBe("function");
    expect(canAdoptStyleSheets(shell.root, view)).toBe("adoptedStyleSheets" in shell.root);
  });

  it("이 환경에서는 루트 안 <style> 로 떨어진다", () => {
    const shell = mount()!;
    expect(shell.styleMode).toBe("style-el");
    const style = shell.root.querySelector(`style[${EXPO_SHEET_MARK}]`)!;
    expect(style.textContent).toBe(EXPO_SHELL_CSS);
  });

  /** 문서 head 스타일은 파트너 문서 전역 규칙이다 — 이 시트가 존재하는 이유가 그걸 막는 것이다. */
  it("문서 head 에는 아무것도 넣지 않는다", () => {
    mount();
    expect(document.head.querySelectorAll("style")).toHaveLength(0);
  });

  /** 게이트(`[data-msx-ready="0"]{visibility:hidden}`)는 시트가 살아 있어야 동작한다. */
  it("시트가 렌더 루트보다 먼저 들어간다", () => {
    const shell = mount()!;
    expect(shell.root.firstChild).toBe(shell.root.querySelector(`style[${EXPO_SHEET_MARK}]`));
  });

  it("여러 번 불러도 한 벌이다", () => {
    const shell = mount()!;
    ensureExpoStyles(shell.root, window as never);
    ensureExpoStyles(shell.root, window as never);
    expect(shell.root.querySelectorAll(`style[${EXPO_SHEET_MARK}]`)).toHaveLength(1);
  });
});

describe("테마 토큰", () => {
  /**
   * 시트가 `.msx-root` 에 같은 이름의 기본값을 선언해 뒀다. 호스트에 얹으면
   * **선언값이 상속값을 이겨서** 조용히 안 먹는다 — 모든 사이트가 기본 남색이 된다.
   */
  it("렌더 루트에 얹는다 — 호스트가 아니다", () => {
    const shell = mount()!;
    const vars = expoThemeVars(THEME);
    expect(shell.renderRoot.style.getPropertyValue("--msx-accent")).toBe(vars["--msx-accent"]);
    expect(shell.host.style.getPropertyValue("--msx-accent")).toBe("");
  });

  it("여덟 토큰을 빠짐없이 얹는다", () => {
    const shell = mount()!;
    for (const key of Object.keys(expoThemeVars(THEME))) {
      expect(`${key}: ${shell.renderRoot.style.getPropertyValue(key) !== ""}`).toBe(`${key}: true`);
    }
  });
});

describe("준비 게이트", () => {
  it("처음에는 감춰져 있고, ready 로 보인다", () => {
    const shell = mount()!;
    expect(shell.renderRoot.getAttribute("data-msx-ready")).toBe("0");
    shell.ready();
    expect(shell.renderRoot.getAttribute("data-msx-ready")).toBe("1");
    shell.ready();
    expect(shell.renderRoot.getAttribute("data-msx-ready")).toBe("1");
  });
});

describe("재진입", () => {
  /** 두 번째 `attachShadow` 는 던진다 — 던지면 옛 화면이 그대로 남고 예외가 파트너 도메인에 뜬다. */
  it("같은 컨테이너를 다시 부트하면 같은 껍데기를 쓴다", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const first = mount({ container })!;
    const second = mount({ container })!;

    expect(second).toBe(first);
    expect(container.querySelectorAll(EXPO_HOST_TAG)).toHaveLength(1);
    expect(findExpoShell(container)).toBe(first);
  });

  it("재진입은 렌더 루트를 비우고 다시 감춘다", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const shell = mount({ container })!;
    shell.renderRoot.appendChild(document.createElement("p"));
    shell.ready();

    mount({ container });
    expect(shell.renderRoot.children).toHaveLength(0);
    expect(shell.renderRoot.getAttribute("data-msx-ready")).toBe("0");
  });

  /**
   * DOM 을 먼저 비우면, 날아오던 폼 스크립트가 예약을 찾고 → 컨테이너가 떼어진 걸 보고
   * → 예약을 지우고 → 문서 탐색으로 떨어져 **다른 자리에 폼을 하나 더** 만든다.
   */
  it("정리를 비우기보다 먼저 돌린다", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const shell = mount({ container })!;
    const child = document.createElement("p");
    shell.renderRoot.appendChild(child);

    const order: string[] = [];
    shell.addCleanup(() => order.push(`cleanup:children=${shell.renderRoot.children.length}`));
    mount({ container });
    expect(order).toEqual(["cleanup:children=1"]);
    expect(child.parentNode).toBeNull();
  });

  /** 대상이 달라졌으면 통째로 버린다 — 옛 design 속성이 남으면 섞인 화면이 된다. */
  it("섹션이 달라지면 새로 만든다", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const first = mount({ container, sectionId: "sid-a" })!;
    const second = mount({ container, sectionId: "sid-b" })!;

    expect(second).not.toBe(first);
    expect(first.host.isConnected).toBe(false);
    expect(container.querySelectorAll(EXPO_HOST_TAG)).toHaveLength(1);
    expect(second.host.getAttribute("data-msx-section")).toBe("sid-b");
  });

  /** 등록부가 없어도 지난 로드의 호스트가 남아 있을 수 있다 — 둘이 되면 화면이 겹친다. */
  it("등록부 없이 남은 호스트를 물려받는다", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const first = mount({ container })!;
    delete (globalThis as Record<string, unknown>).__MACH_EXPO_MOUNTS_V1__;

    const second = mount({ container })!;
    expect(second.host).toBe(first.host);
    expect(container.querySelectorAll(EXPO_HOST_TAG)).toHaveLength(1);
  });
});

describe("정리", () => {
  it("역순으로 정리한다", () => {
    const order: string[] = [];
    const shell = mount()!;
    shell.addCleanup(() => order.push("first"));
    shell.addCleanup(() => order.push("second"));
    shell.destroy();
    // 포털은 보통 마지막에 열린다 — 역순이면 가장 먼저 닫힌다.
    expect(order).toEqual(["second", "first"]);
  });

  it("호스트를 지우고 컨테이너는 남긴다", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const shell = mount({ container })!;
    shell.destroy();

    expect(container.isConnected).toBe(true);
    expect(container.querySelector(EXPO_HOST_TAG)).toBeNull();
    expect(findExpoShell(container)).toBeNull();
  });

  it("두 번 불러도 한 번만 돈다", () => {
    const shell = mount()!;
    const cleanup = vi.fn();
    shell.addCleanup(cleanup);
    shell.destroy();
    shell.destroy();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("리스너 신호를 끊는다", () => {
    const shell = mount()!;
    expect(shell.signal.aborted).toBe(false);
    shell.destroy();
    expect(shell.signal.aborted).toBe(true);
  });

  /** 정리 하나가 던져도 나머지가 돌아야 한다 — 안 그러면 스크롤 잠금이 남는다. */
  it("정리가 던져도 나머지를 계속한다", () => {
    const shell = mount()!;
    const later = vi.fn();
    shell.addCleanup(later);
    shell.addCleanup(() => { throw new Error("boom"); });
    shell.destroy();
    expect(later).toHaveBeenCalledTimes(1);
    expect(shell.host.isConnected).toBe(false);
  });

  /** 둘 다 문서 단위 단일체다 — 한 섹션이 치우면 다음 마운트가 8KB 를 다시 파싱한다. */
  it("공용 시트와 폰트 약속은 놓지 않는다", () => {
    const shell = mount()!;
    shell.destroy();
    expect((globalThis as Record<string, unknown>).__MACH_EXPO_FONT_V1__).toBeDefined();
  });
});
