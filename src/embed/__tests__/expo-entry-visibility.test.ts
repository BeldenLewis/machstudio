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
 * **못 막는 것이 딱 하나 남는다: 붙여넣은 자리의 조상이 숨겨진 경우.** 마운트 자리 자체의
 * 직접 opacity/visibility/display 공격은 인라인 리셋으로 끊는다. 접힌 아코디언·숨은 탭처럼
 * 더 바깥 조상이 숨겨진 경우는 구조상 이길 수 없으므로 0×0 진단이 계속 필요하다.
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

const mountExpo = vi.hoisted(() => vi.fn(() => ({ destroy: vi.fn() })));

/** 실제 렌더 대신 마운트 성공만 흉내낸다 — 여기서 볼 것은 마운트 뒤의 판정이다. */
vi.mock("@/lib/expo/mount", () => ({
  mountExpo,
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
  mountExpo.mockClear();
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
  it("같은 인스턴스를 두 번 boot하면 이전 마운트를 정리하고 destroy는 최신 마운트도 정리한다", () => {
    mountPoint({ width: 980, height: 802 });
    boot(payload, null);
    const first = mountExpo.mock.results[0].value;

    boot(payload, null);
    const second = mountExpo.mock.results[1].value;

    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(second.destroy).not.toHaveBeenCalled();
    destroy(payload);
    expect(second.destroy).toHaveBeenCalledTimes(1);
  });

  it("DOMContentLoaded 대기 중 destroy하면 뒤늦게 다시 마운트하지 않는다", () => {
    const readyState = vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    mountPoint({ width: 980, height: 802 });
    boot(payload, null);
    expect(mountExpo).not.toHaveBeenCalled();

    destroy(payload);
    document.dispatchEvent(new Event("DOMContentLoaded"));

    expect(mountExpo).not.toHaveBeenCalled();
    readyState.mockRestore();
  });

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

  it("붙여넣은 자리 자체의 테마 숨김은 풀되 관계없는 인라인 스타일은 보존한다", () => {
    const host = mountPoint({ width: 980, height: 802 });
    host.style.setProperty("opacity", "0", "important");
    host.style.setProperty("visibility", "hidden", "important");
    host.style.setProperty("transform", "translateY(40px)", "important");
    host.style.setProperty("filter", "blur(2px)", "important");
    host.style.setProperty("background-color", "rgb(1, 2, 3)");

    boot(payload, null);

    expect(host.style.getPropertyValue("opacity")).toBe("1");
    expect(host.style.getPropertyValue("visibility")).toBe("visible");
    expect(host.style.getPropertyValue("transform")).toBe("none");
    expect(host.style.getPropertyValue("filter")).toBe("none");
    expect(host.style.getPropertyPriority("opacity")).toBe("important");
    expect(host.style.backgroundColor).toBe("rgb(1, 2, 3)");
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

/**
 * **아임웹 위젯 풀기 — 이 줄들은 지금까지 한 번도 실행된 적이 없다.**
 *
 * 위 `mountPoint` 는 호스트를 `document.body` 에 바로 붙이므로 `._widget_data` 조상이 없어
 * `unhideWidget` 이 첫 줄에서 돌아간다. 남의 문서 요소를 만지는 코드가 무검증이었다.
 *
 * 아임웹 스크롤 리빌 테마는 위젯을 `._widget_data.wg_animated { visibility:hidden }` 으로
 * 시작시키고 자기 요소만 풀어 준다. 우리 호스트 리셋은 **우리 요소에만** 걸리므로,
 * 우리를 담은 파트너 래퍼가 숨겨져 있으면 구획이 라이브에서 영영 안 보인다.
 */
describe("숨겨진 아임웹 래퍼", () => {
  function widgetMount() {
    const widget = document.createElement("div");
    widget.className = "_widget_data wg_animated";
    widget.style.visibility = "hidden";
    widget.style.opacity = "0";
    const host = document.createElement("div");
    host.setAttribute("data-mach-expo", "");
    host.getBoundingClientRect = () => ({
      width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}),
    }) as DOMRect;
    widget.appendChild(host);
    document.body.appendChild(widget);
    return { widget, host };
  }

  it("숨겨진 래퍼를 풀어 준다", () => {
    const { widget } = widgetMount();
    boot(payload);

    expect(widget.style.visibility).toBe("visible");
    expect(widget.style.opacity).toBe("1");
    expect(widget.classList.contains("wg_animated")).toBe(false);
    expect(widget.classList.contains("_ds_animated_except")).toBe(true);
  });

  /**
   * **되돌리지 않는 것이 계약이다.** 되돌리면 아임웹의 리빌 패스가 이미 지나간 위젯에
   * `wg_animated` 가 되붙어 **파트너 자신의 콘텐츠가 영영 숨는다** — 떠나면서 남의 페이지를
   * 지우는 셈이다. 원래 인라인 값도 우리는 모른다.
   *
   * 이 테스트는 "정리를 안 하네" 하고 되돌리려는 다음 사람을 이유와 함께 막으려고 있다.
   */
  it("destroy 뒤에도 되돌리지 않는다 — 일부러다", () => {
    const { widget } = widgetMount();
    boot(payload);
    destroy(payload);

    expect(widget.style.visibility).toBe("visible");
    expect(widget.classList.contains("wg_animated")).toBe(false);
  });

  /** 래퍼가 없으면 아무것도 안 만진다 — 남의 문서에서 찾지 못한 것을 지어내지 않는다. */
  it("래퍼가 없으면 손대지 않는다", () => {
    const host = mountPoint({ width: 800, height: 600 });
    expect(() => boot(payload)).not.toThrow();
    expect(host.parentElement).toBe(document.body);
  });
});
