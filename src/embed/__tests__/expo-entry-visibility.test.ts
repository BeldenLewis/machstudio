// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 붙었는데 **자리가 없는** 경우를 알리는가.
 *
 * ── 이 검사가 왜 있나 ─────────────────────────────────────────────────
 * 적대적 CSS 실측(`/dev/expo-hostile-harness`, 2026-08-25)에서 아임웹 테마가 할 법한 공격은
 * 전부 Shadow 격리와 호스트 리셋이 막았다 — 전역 리셋·스크롤 리빌(opacity:0/visibility:hidden)·
 * 전역 transition·transform/filter·타이포 상속(폰트·크기·행간·자간·색·대문자)·body flex·
 * 쌓임/클리핑·빈 div 숨김·CSS 변수(--msx-*) 충돌까지. 그림자 안쪽 계산값이 기준선과 같았다.
 *
 * **못 막는 것이 딱 하나 남는다: 붙여넣은 자리 자체가 숨겨진 경우.** 우리는 그 안에 있어서
 * 구조적으로 못 이긴다. 실측에서도 `[data-mach-expo]{display:none!important}` 하나만 통과했고
 * 호스트가 0×0 이 됐다. 접힌 아코디언·숨은 탭·템플릿 블록에 붙여도 같은 결과다.
 *
 * 막을 수 없으면 **진단할 수 있게** 한다. 그게 이 경고이고, 이 파일은 두 방향을 지킨다:
 * 진짜 안 보일 때 말하는가, 그리고 **멀쩡할 때 조용한가**(거짓 경고는 없느니만 못하다).
 */

const warns: string[] = [];

/**
 * jsdom 에는 `CSS.escape` 가 없다. 마운트 자리 찾기가 그걸 쓰므로, 없으면 부트가 통째로
 * 예외로 끝나고 **경고가 안 뜬 것을 "정상" 으로 오독하게 된다**(실제로 그렇게 한 바퀴 돌았다).
 */
if (typeof CSS === "undefined" || typeof CSS.escape !== "function") {
  Object.defineProperty(globalThis, "CSS", {
    value: { ...(globalThis as { CSS?: object }).CSS, escape: (v: string) => String(v).replace(/["\\]/g, "\\$&") },
    writable: true, configurable: true,
  });
}

/** 실제 렌더 대신 마운트 성공만 흉내낸다 — 여기서 볼 것은 마운트 뒤의 판정이다. */
vi.mock("@/lib/expo/mount", () => ({
  mountExpo: () => ({ destroy: () => {} }),
}));

const { boot, destroy } = await import("@/embed/expo-entry");

const payload = {
  pageId: "pg1",
  theme: { accent: "#1f3a5f", lightBg: "#ffffff", darkBg: "#111318" },
  origin: "https://machstudio.example.com",
  sections: [],
};

/** 컨테이너의 크기를 우리가 정한다 — jsdom 은 언제나 0 을 준다. */
function mountPoint(size: { width: number; height: number }) {
  const host = document.createElement("div");
  host.setAttribute("data-mach-expo", "");
  host.getBoundingClientRect = () => ({
    width: size.width, height: size.height, top: 0, left: 0, right: size.width,
    bottom: size.height, x: 0, y: 0, toJSON: () => ({}),
  }) as DOMRect;
  document.body.appendChild(host);
  return host;
}

beforeEach(() => {
  warns.length = 0;
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warns.push(args.map(String).join(" "));
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  try { destroy(payload); } catch { /* 이미 정리됐으면 그만 */ }
});

const invisibleWarnings = () => warns.filter((w) => w.includes("자리가 보이지 않습니다"));

describe("자리가 없으면 알린다", () => {
  it("호스트가 0×0 이면 경고한다", () => {
    mountPoint({ width: 0, height: 0 });
    boot(payload, null);
    vi.advanceTimersByTime(2000);

    expect(invisibleWarnings()).toHaveLength(1);
    // 무엇을 확인해야 하는지 말한다 — "안 나와요" 만으로는 아무도 못 고친다.
    expect(invisibleWarnings()[0]).toContain("display:none");
    expect(invisibleWarnings()[0]).toContain("pg1");
  });

  /** 높이만 0 인 경우가 실제로 더 흔하다(접힌 영역). */
  it("높이만 0 이어도 경고한다", () => {
    mountPoint({ width: 980, height: 0 });
    boot(payload, null);
    vi.advanceTimersByTime(2000);
    expect(invisibleWarnings()).toHaveLength(1);
  });

  /** **거짓 경고는 없느니만 못하다.** */
  it("멀쩡히 보이면 아무 말도 안 한다", () => {
    mountPoint({ width: 980, height: 802 });
    boot(payload, null);
    vi.advanceTimersByTime(2000);
    expect(invisibleWarnings()).toEqual([]);
  });

  /**
   * 나중에 보이게 되는 자리(탭·아코디언)를 거짓으로 고발하지 않으려고 지연을 둔다.
   * 지연 전에는 아직 아무 말도 하지 않아야 한다.
   */
  it("레이아웃이 끝나기 전에는 말하지 않는다", () => {
    mountPoint({ width: 0, height: 0 });
    boot(payload, null);
    vi.advanceTimersByTime(200);
    expect(invisibleWarnings()).toEqual([]);
  });

  /** 그 사이 정리됐으면 없는 것에 대해 말하지 않는다. */
  it("정리된 뒤에는 말하지 않는다", () => {
    mountPoint({ width: 0, height: 0 });
    boot(payload, null);
    destroy(payload);
    vi.advanceTimersByTime(2000);
    expect(invisibleWarnings()).toEqual([]);
  });
});
