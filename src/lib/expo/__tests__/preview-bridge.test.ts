// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EXPO_PREVIEW_CODE_READY_MESSAGE, EXPO_PREVIEW_SELECT_MESSAGE, EXPO_PREVIEW_THEME_MESSAGE,
  attachExpoPreviewBridge,
} from "@/lib/expo/preview-bridge";

/**
 * 편집기 ↔ 미리보기 프레임의 통로.
 *
 * 같은 오리진이라도 **아무 메시지나 받지 않는다** — 그 프레임 안에는 운영자가 붙여넣은
 * 코드가 도는 sandbox iframe 도 있다. 네 조건을 전부 만족해야 통과한다.
 */

const PARENT_ORIGIN = "https://machstudio.example.com";
const PAGE_ID = "pg1";
const CHANNEL = "chan-1";

interface Fake {
  win: Window;
  parent: { postMessage: ReturnType<typeof vi.fn> };
  listeners: Array<(event: MessageEvent) => void>;
  deliver(data: unknown, over?: { source?: unknown; origin?: string }): void;
}

/** 부모가 있는 프레임 흉내. jsdom 의 window.parent 는 자기 자신이라 직접 만든다. */
function fakeWindow(): Fake {
  const listeners: Array<(event: MessageEvent) => void> = [];
  const parent = { postMessage: vi.fn() };
  const win = {
    parent,
    /**
     * `{ signal }` 을 **실제로 존중한다.** 무시하면 destroy 테스트가 통과할 수 없고,
     * 목이 제품보다 관대해서 "정리가 된다" 를 증명하지 못한다.
     */
    addEventListener: (
      type: string,
      handler: (event: MessageEvent) => void,
      options?: { signal?: AbortSignal },
    ) => {
      if (type !== "message") return;
      listeners.push(handler);
      options?.signal?.addEventListener("abort", () => {
        const index = listeners.indexOf(handler);
        if (index >= 0) listeners.splice(index, 1);
      }, { once: true });
    },
  } as unknown as Window;

  return {
    win,
    parent,
    listeners,
    deliver(data, over = {}) {
      const event = {
        data,
        source: "source" in over ? over.source : parent,
        origin: over.origin ?? PARENT_ORIGIN,
      } as unknown as MessageEvent;
      for (const handler of listeners) handler(event);
    },
  };
}

const attach = (fake: Fake, onTheme = vi.fn()) => ({
  handle: attachExpoPreviewBridge({
    parentOrigin: PARENT_ORIGIN, pageId: PAGE_ID, channel: CHANNEL, onTheme, win: fake.win,
  }),
  onTheme,
});

const themeMessage = (over: Record<string, unknown> = {}) => ({
  type: EXPO_PREVIEW_THEME_MESSAGE,
  pageId: PAGE_ID,
  channel: CHANNEL,
  theme: { accent: "#ff8500", lightBg: "#ffffff", darkBg: "#111318" },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("붙는 조건", () => {
  it("부모가 있으면 붙는다", () => {
    expect(attach(fakeWindow()).handle).not.toBeNull();
  });

  /** iframe 이 아니면 보낼 곳도 받을 곳도 없다. */
  it("부모가 자기 자신이면 붙지 않는다", () => {
    const win = { addEventListener: () => {} } as unknown as Window;
    (win as unknown as { parent: unknown }).parent = win;
    expect(attachExpoPreviewBridge({
      parentOrigin: PARENT_ORIGIN, pageId: PAGE_ID, channel: CHANNEL, onTheme: vi.fn(), win,
    })).toBeNull();
  });

  /** `postMessage` 의 targetOrigin 으로 쓸 수 없는 값이면 아예 시작하지 않는다. */
  it("부모 오리진이 절대 http(s) 가 아니면 붙지 않는다", () => {
    for (const bad of ["", "*", "machstudio.example.com", "//x.example.com"]) {
      const fake = fakeWindow();
      expect(attachExpoPreviewBridge({
        parentOrigin: bad, pageId: PAGE_ID, channel: CHANNEL, onTheme: vi.fn(), win: fake.win,
      })).toBeNull();
    }
  });
});

describe("들어오는 테마 — 네 조건 전부", () => {
  it("전부 맞으면 적용한다", () => {
    const fake = fakeWindow();
    const { onTheme } = attach(fake);
    fake.deliver(themeMessage());
    expect(onTheme).toHaveBeenCalledTimes(1);
    expect(onTheme.mock.calls[0][0]).toEqual({ accent: "#ff8500", lightBg: "#ffffff", darkBg: "#111318" });
  });

  /** 그 프레임 안에는 운영자가 붙여넣은 코드가 도는 sandbox iframe 도 있다. */
  it("부모가 아닌 창에서 온 것은 버린다", () => {
    const fake = fakeWindow();
    const { onTheme } = attach(fake);
    fake.deliver(themeMessage(), { source: { postMessage: vi.fn() } });
    fake.deliver(themeMessage(), { source: null });
    expect(onTheme).not.toHaveBeenCalled();
  });

  it("오리진이 다르면 버린다", () => {
    const fake = fakeWindow();
    const { onTheme } = attach(fake);
    fake.deliver(themeMessage(), { origin: "https://evil.example.com" });
    fake.deliver(themeMessage(), { origin: "null" });
    expect(onTheme).not.toHaveBeenCalled();
  });

  it("다른 페이지용 메시지는 버린다", () => {
    const fake = fakeWindow();
    const { onTheme } = attach(fake);
    fake.deliver(themeMessage({ pageId: "pg-other" }));
    expect(onTheme).not.toHaveBeenCalled();
  });

  it("채널이 다르면 버린다", () => {
    const fake = fakeWindow();
    const { onTheme } = attach(fake);
    fake.deliver(themeMessage({ channel: "other" }));
    fake.deliver(themeMessage({ channel: undefined }));
    expect(onTheme).not.toHaveBeenCalled();
  });

  it("모르는 타입·모양은 버린다", () => {
    const fake = fakeWindow();
    const { onTheme } = attach(fake);
    for (const data of [themeMessage({ type: "other" }), null, "문자열", 42, []]) {
      fake.deliver(data);
    }
    expect(onTheme).not.toHaveBeenCalled();
  });

  /** 편집기가 보낸 문자열을 그대로 CSS 에 넣지 않는다. */
  it("테마를 정규화해서 넘긴다", () => {
    const fake = fakeWindow();
    const { onTheme } = attach(fake);
    fake.deliver(themeMessage({ theme: { accent: "javascript:alert(1)", lightBg: 42, darkBg: null } }));
    const applied = onTheme.mock.calls[0][0];
    expect(applied.accent).toMatch(/^#[0-9a-f]{6}$/);
    expect(applied.lightBg).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("나가는 것", () => {
  /** `"*"` 로 보내면 미리보기가 남의 사이트 iframe 에 있을 때 그쪽이 내용을 읽는다. */
  it("targetOrigin 을 정확히 지정한다", () => {
    const fake = fakeWindow();
    attach(fake).handle!.notifySelect("sid-1");
    const [, targetOrigin] = fake.parent.postMessage.mock.calls[0];
    expect(targetOrigin).toBe(PARENT_ORIGIN);
    expect(targetOrigin).not.toBe("*");
  });

  it("구획 선택을 알린다", () => {
    const fake = fakeWindow();
    attach(fake).handle!.notifySelect("sid-1");
    expect(fake.parent.postMessage.mock.calls[0][0]).toEqual({
      type: EXPO_PREVIEW_SELECT_MESSAGE, pageId: PAGE_ID, channel: CHANNEL, sid: "sid-1",
    });
  });

  it("붙여넣은 코드가 떴다고 알린다", () => {
    const fake = fakeWindow();
    attach(fake).handle!.notifyCustomCodeReady("digest-1");
    expect(fake.parent.postMessage.mock.calls[0][0]).toEqual({
      type: EXPO_PREVIEW_CODE_READY_MESSAGE, pageId: PAGE_ID, channel: CHANNEL, codeDigest: "digest-1",
    });
  });

  /** 부모가 사라졌거나 오리진이 안 맞는다 — 편의 기능이므로 화면을 깨뜨리지 않는다. */
  it("보내다 던져도 조용히 넘어간다", () => {
    const fake = fakeWindow();
    fake.parent.postMessage.mockImplementation(() => { throw new Error("gone"); });
    expect(() => attach(fake).handle!.notifySelect("sid-1")).not.toThrow();
  });
});

describe("정리", () => {
  it("끊으면 더 이상 받지 않는다", () => {
    const fake = fakeWindow();
    const { handle, onTheme } = attach(fake);
    handle!.destroy();
    fake.deliver(themeMessage());
    expect(onTheme).not.toHaveBeenCalled();
  });
});
