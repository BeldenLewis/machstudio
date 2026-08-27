// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { attachExpoForm } from "@/lib/expo/form-bridge";
import { getFormTarget, resetFormTargets } from "@/lib/collect-form/target-registry";

/**
 * 홈페이지 섹션 ↔ 폼 런타임의 다리.
 *
 * 순서가 규칙이다: **예약이 먼저, 스크립트가 나중.** 반대로 하면 스크립트가 먼저 실행돼
 * 예약을 못 찾고, 폼이 문서 탐색 경로로 떨어져 엉뚱한 자리에 앉는다.
 */

const ORIGIN = "https://mach.example.com";

function section() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  const container = document.createElement("div");
  shadow.appendChild(container);
  return { host, shadow, container };
}

const attach = (over: Partial<Parameters<typeof attachExpoForm>[0]> = {}) => {
  const { shadow, container } = section();
  return attachExpoForm({
    sourceId: "s1", mode: "live", container, styleRoot: shadow,
    origin: ORIGIN, instanceKey: "sec1", ...over,
  });
};

beforeEach(() => {
  resetFormTargets();
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

describe("예약과 스크립트", () => {
  it("자리를 예약하고 열쇠를 스크립트에 싣는다", () => {
    const handle = attach()!;
    expect(getFormTarget(handle.key)).not.toBeNull();

    const script = document.head.querySelector("script")!;
    expect(script.dataset.msFormTarget).toBe(handle.key);
    expect(script.src).toBe(`${ORIGIN}/f/s1`);
  });

  /** 스크립트가 실행될 때 예약이 이미 있어야 한다 — 순서가 뒤집히면 탐색 경로로 떨어진다. */
  it("예약이 스크립트보다 먼저다", () => {
    const order: string[] = [];
    const observer = new MutationObserver(() => order.push("script"));
    observer.observe(document.head, { childList: true });

    const handle = attach()!;
    // 스크립트가 붙기 전에 이미 예약이 있었다는 것을 동기적으로 확인한다.
    expect(getFormTarget(handle.key)).not.toBeNull();
    observer.disconnect();
  });

  it("등록 확인은 /check 를 부른다", () => {
    attach({ view: "check" });
    expect(document.head.querySelector("script")!.src).toBe(`${ORIGIN}/f/s1/check`);
  });

  /**
   * ShadowRoot 안의 스크립트는 실행돼도 `document.currentScript` 가 null 이다 —
   * 열쇠를 읽을 수 없다. `type="module"` 도 같은 이유로 안 된다.
   */
  it("스크립트는 문서 head 의 클래식 스크립트다", () => {
    const { shadow, container } = section();
    attachExpoForm({
      sourceId: "s1", mode: "live", container, styleRoot: shadow,
      origin: ORIGIN, instanceKey: "sec1",
    });
    expect(document.head.querySelectorAll("script")).toHaveLength(1);
    expect(shadow.querySelector("script")).toBeNull();
    expect(document.head.querySelector("script")!.type).toBe("");
  });

  it("같은 소스를 두 번 놓아도 열쇠가 다르다", () => {
    const a = attach({ instanceKey: "sec1" })!;
    const b = attach({ instanceKey: "sec2" })!;
    expect(a.key).not.toBe(b.key);
    expect(getFormTarget(a.key)).not.toBeNull();
    expect(getFormTarget(b.key)).not.toBeNull();
  });

  /** head 에 같은 스크립트가 쌓이면 무엇이 살아 있는지 알 수 없다. */
  it("다 쓴 스크립트 태그는 치운다", () => {
    attach();
    const script = document.head.querySelector("script")!;
    script.dispatchEvent(new Event("load"));
    expect(document.head.querySelector("script")).toBeNull();

    attach({ instanceKey: "sec2" });
    document.head.querySelector("script")!.dispatchEvent(new Event("error"));
    expect(document.head.querySelector("script")).toBeNull();
  });
});

describe("정리", () => {
  /** 아직 실행 전인 스크립트가 죽은 자리에 붙지 않게, 예약을 먼저 끊는다. */
  it("예약을 끊고 스크립트를 치운다", () => {
    const handle = attach()!;
    handle.destroy();
    expect(getFormTarget(handle.key)).toBeNull();
    expect(document.head.querySelector("script")).toBeNull();
  });
});

describe("주소를 지어내지 않는다", () => {
  it("절대 http(s) 가 아니면 아무것도 하지 않는다", () => {
    for (const bad of ["", "/", "//cdn.example.com", "mach.example.com"]) {
      document.head.innerHTML = "";
      expect(attach({ origin: bad })).toBeNull();
      expect(document.head.querySelector("script")).toBeNull();
    }
  });

  /** 소스 id 가 경로를 벗어나면 안 된다. */
  it("소스 id 를 이스케이프한다", () => {
    const handle = attach({ sourceId: "a/../b" })!;
    expect(document.head.querySelector("script")!.src).toBe(`${ORIGIN}/f/a%2F..%2Fb`);
    expect(handle.key.startsWith("a/../b:")).toBe(true);
  });
});

/**
 * **전문 팝업이 놓일 자리를 다리가 준다.**
 *
 * 이 경로의 `styleRoot` 는 ShadowRoot 라 스타일이 그 안에만 들어간다. 팝업이
 * `document.body` 로 나가면 CSS 를 하나도 못 받아 파트너 페이지 맨 아래에 서식 없는
 * 약관 텍스트가 그려진다(W1 기준 3 위반이기도 하다).
 *
 * 자리를 **여기서** 주는 이유: `registerFormTarget` 을 부르는 곳이 저장소에서 여기
 * 한 곳뿐이다. 호출부마다 넘기게 하면 세 번째 소비처가 생길 때 조용히 빠진다.
 */
describe("전문 팝업 자리", () => {
  const THEME = { "--msx-accent": "#1f3a5f" };

  it("테마와 sid 를 주면 예약에 자리가 실린다", () => {
    const handle = attach({ themeVars: THEME, sid: "sid-1" })!;
    const record = getFormTarget(handle.key)!;
    expect(typeof record.overlay).toBe("function");
  });

  it("그 자리는 실제로 빌려진다 — Shadow 를 가진 레이어가 나온다", () => {
    const handle = attach({ themeVars: THEME, sid: "sid-1" })!;
    const slot = getFormTarget(handle.key)!.overlay!(() => {});
    expect(slot).not.toBeNull();
    expect(slot!.root).toBeInstanceOf(ShadowRoot);
    // 잘림을 벗어나려면 body 직계여야 한다.
    expect((slot!.root as ShadowRoot).host.parentElement).toBe(document.body);
    slot!.release();
  });

  /** 테마를 모르면 자리를 만들지 않는다 — 색 없는 팝업을 그리느니 문서 경로가 낫다. */
  it("테마·sid 가 없으면 자리를 주지 않는다", () => {
    const handle = attach()!;
    expect(getFormTarget(handle.key)!.overlay).toBeUndefined();
  });
});
