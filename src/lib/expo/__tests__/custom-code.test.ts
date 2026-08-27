// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EXPO_CODE_MAX_HEIGHT, EXPO_CODE_MIN_HEIGHT, mountExpoCustomCode,
} from "@/lib/expo/custom-code";

/**
 * 붙여넣은 코드.
 *
 * 이건 우리가 쓴 것도, 검사한 것도 아니다. 그대로 Shadow 안에 넣으면 **파트너 도메인의
 * 스크립트**로 실행되어 그 페이지의 쿠키와 DOM 에 전부 닿는다. 그래서 sandbox 에 가둔다.
 */

/**
 * 문서에 **붙여서** 만든다. 붙지 않은 iframe 은 jsdom 에서 `contentWindow` 가 null 이고,
 * 그러면 우리 검사가 모든 메시지를 거절해 검증 자체를 못 본다(실제 동작도 그게 맞다).
 */
const mount = (over: Partial<Parameters<typeof mountExpoCustomCode>[0]> = {}) => {
  const handle = mountExpoCustomCode({ code: "<div id=w>위젯</div>", allowRun: true, ...over });
  if (handle) document.body.appendChild(handle.el);
  return handle;
};

/** 프레임이 보낸 것처럼 흉내 낸다 — jsdom 은 srcdoc 스크립트를 실행하지 않는다. */
function post(frame: HTMLIFrameElement, data: unknown, source?: unknown) {
  const event = new MessageEvent("message", { data });
  // `source` 는 읽기 전용 접근자라 대입이 안 된다 — 정의해서 갈아 끼운다.
  Object.defineProperty(event, "source", {
    value: source === undefined ? frame.contentWindow : source,
    configurable: true,
  });
  window.dispatchEvent(event);
}

function channelOf(frame: HTMLIFrameElement): string {
  const match = /"([0-9a-f]{32}|fallback)"/.exec(frame.srcdoc);
  return match ? match[1] : "";
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("격리", () => {
  /** `allow-scripts` 와 `allow-same-origin` 을 같이 주는 것이 이 API 의 대표적 오용이다. */
  it("allow-same-origin 을 주지 않는다", () => {
    const frame = mount()!.el as HTMLIFrameElement;
    const sandbox = frame.getAttribute("sandbox")!;
    expect(sandbox).toBe("allow-scripts allow-popups allow-forms");
    expect(sandbox).not.toContain("allow-same-origin");
    expect(sandbox).not.toContain("allow-top-navigation");
  });

  it("원본을 srcdoc 에만 넣는다", () => {
    const code = "<div id=w>위젯</div>";
    const frame = mount({ code })!.el as HTMLIFrameElement;
    expect(frame.tagName).toBe("IFRAME");
    expect(frame.srcdoc).toContain(code);
    // src 로 새지 않는다.
    expect(frame.hasAttribute("src")).toBe(false);
  });

  /**
   * 우리 보고 스크립트가 운영자 코드보다 **앞**이다. 뒤에 두면 닫히지 않은 `<script>` 가
   * 우리 소스를 삼키고 우리 `</script>` 가 그걸 닫아, 보고기가 아예 실행되지 않는다.
   */
  it("보고 스크립트가 운영자 코드보다 앞이다", () => {
    const code = "<script>oops(";
    const frame = mount({ code })!.el as HTMLIFrameElement;
    expect(frame.srcdoc.indexOf("__msxCode")).toBeLessThan(frame.srcdoc.indexOf(code));
  });

  /** 원본을 이스케이프하지 않는 것이 설계다 — 안전은 sandbox 가 만든다. */
  it("원본을 이스케이프하지 않는다", () => {
    const code = '<img src=x onerror="1">&<b>진짜</b>';
    const frame = mount({ code })!.el as HTMLIFrameElement;
    expect(frame.srcdoc).toContain(code);
  });

  it("빈 코드는 아무것도 만들지 않는다", () => {
    expect(mount({ code: "" })).toBeNull();
    expect(mount({ code: "   \n " })).toBeNull();
  });
});

describe("높이 보고", () => {
  it("보고받은 높이를 적용한다", () => {
    const frame = mount()!.el as HTMLIFrameElement;
    post(frame, { __msxCode: channelOf(frame), height: 320 });
    expect(frame.style.height).toBe("320px");
  });

  it("상·하한으로 가둔다", () => {
    const frame = mount()!.el as HTMLIFrameElement;
    post(frame, { __msxCode: channelOf(frame), height: 1 });
    expect(frame.style.height).toBe(`${EXPO_CODE_MIN_HEIGHT}px`);
    post(frame, { __msxCode: channelOf(frame), height: 99999 });
    expect(frame.style.height).toBe(`${EXPO_CODE_MAX_HEIGHT}px`);
  });

  /** 늦게 오는 보고도 받아야 한다 — 이미지가 다 로드된 뒤에 커지는 위젯이 흔하다. */
  it("나중에 다시 보고해도 적용한다", () => {
    const frame = mount()!.el as HTMLIFrameElement;
    const ch = channelOf(frame);
    post(frame, { __msxCode: ch, height: 200 });
    post(frame, { __msxCode: ch, height: 640 });
    expect(frame.style.height).toBe("640px");
  });

  it("1px 떨림은 무시한다", () => {
    const frame = mount()!.el as HTMLIFrameElement;
    const ch = channelOf(frame);
    post(frame, { __msxCode: ch, height: 300 });
    post(frame, { __msxCode: ch, height: 301 });
    expect(frame.style.height).toBe("300px");
  });

  /**
   * 부모가 높이를 바꾸면 자식 뷰포트가 바뀌고, 자식이 다시 보고한다 — 되먹임 고리다.
   * 끊기지 않는 콘텐츠가 있으므로 마지막 방어로 횟수를 센다.
   */
  it("되먹임이 끊기지 않으면 고정하고 한 번만 알린다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const frame = mount()!.el as HTMLIFrameElement;
    const ch = channelOf(frame);
    for (let i = 0; i < 60; i++) post(frame, { __msxCode: ch, height: 200 + i * 10 });
    expect(warn).toHaveBeenCalledTimes(1);
    // 상한 뒤로는 더 안 커진다.
    expect(parseInt(frame.style.height, 10)).toBeLessThan(200 + 60 * 10);
    warn.mockRestore();
  });

  it("숫자가 아닌 높이는 버린다", () => {
    const frame = mount()!.el as HTMLIFrameElement;
    const ch = channelOf(frame);
    for (const bad of ["abc", NaN, Infinity, null, undefined, {}]) {
      post(frame, { __msxCode: ch, height: bad });
    }
    expect(frame.style.height).toBe("");
  });
});

describe("메시지 검증 — 두 검사를 둘 다", () => {
  /** 파트너 페이지의 다른 프레임(광고·채팅)이 보낸 것을 받으면 안 된다. */
  it("다른 창에서 온 것은 버린다", () => {
    const frame = mount()!.el as HTMLIFrameElement;
    post(frame, { __msxCode: channelOf(frame), height: 900 }, window);
    post(frame, { __msxCode: channelOf(frame), height: 900 }, null);
    expect(frame.style.height).toBe("");
  });

  /**
   * `srcdoc` 은 부모 문서에서 **읽을 수 있다** — 파트너 스크립트가 토큰을 꺼내 자기
   * 창에서 보낼 수 있다. 토큰만으로는 이 프레임에서 왔다는 증거가 못 된다.
   */
  it("채널이 틀리면 버린다", () => {
    const frame = mount()!.el as HTMLIFrameElement;
    post(frame, { __msxCode: "wrong", height: 900 });
    post(frame, { height: 900 });
    post(frame, "문자열");
    post(frame, null);
    expect(frame.style.height).toBe("");
  });

  /** `contentWindow` 는 srcdoc 을 다시 넣어도 같은 객체다 — 채널이 매번 달라야 한다. */
  it("프레임마다 채널이 다르다", () => {
    const a = mount()!.el as HTMLIFrameElement;
    const b = mount()!.el as HTMLIFrameElement;
    expect(channelOf(a)).toMatch(/^[0-9a-f]{32}$/);
    expect(channelOf(a)).not.toBe(channelOf(b));
  });

  it("정리한 뒤에는 아무것도 받지 않는다", () => {
    const handle = mount()!;
    const frame = handle.el as HTMLIFrameElement;
    const ch = channelOf(frame);
    handle.destroy();
    post(frame, { __msxCode: ch, height: 900 });
    expect(frame.style.height).toBe("");
    expect(frame.isConnected).toBe(false);
  });
});

describe("미리보기 게이트", () => {
  /**
   * 샌드박스는 파트너 페이지를 지키지만 프레임에서 나가는 요청은 막지 않는다.
   * 미리보기를 열 때마다 남의 추적 스크립트가 발화하면 통계가 오염된다.
   */
  it("실행 허가가 없으면 iframe 을 만들지 않는다", () => {
    const handle = mount({ allowRun: false })!;
    expect(handle.el.querySelector("iframe")).toBeNull();
    expect(handle.el.className).toBe("msx-code-placeholder");
  });

  it("자리표가 무슨 일이 일어나는지 말해 준다", () => {
    const text = mount({ allowRun: false })!.el.textContent ?? "";
    expect(text).toContain("자동 실행하지 않아요");
    expect(text).toContain("추적");
  });

  it("실행 버튼은 콜백이 있을 때만 그린다", () => {
    expect(mount({ allowRun: false })!.el.querySelector("button")).toBeNull();
    const run = vi.fn();
    const withButton = mount({ allowRun: false, onRequestRun: run })!;
    const button = withButton.el.querySelector<HTMLButtonElement>("button")!;
    expect(button.textContent).toBe("외부 코드 미리보기 실행");
    button.click();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("자리표 정리는 무해하다", () => {
    expect(() => mount({ allowRun: false })!.destroy()).not.toThrow();
  });
});
