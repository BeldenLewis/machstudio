// @vitest-environment jsdom
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useExpoPreviewChannel } from "@/lib/expo/use-preview-channel";

/**
 * 미리보기 통로의 **편집기 쪽 절반** — 받을 것만 받는가.
 *
 * ── 왜 이게 보안 문제인가 ─────────────────────────────────────────────
 * 미리보기 문서 안에는 **운영자가 붙여넣은 코드가 도는 sandbox iframe** 이 있다.
 * 그쪽도 부모에게 `postMessage` 를 보낼 수 있고, 우리가 그걸 우리 프레임의 것으로
 * 착각하면 **남이 준 코드가 편집기를 조작한다.** 그래서 네 가지를 전부 확인한다:
 * ① 정확히 그 프레임 ② 서버가 정한 오리진 ③ 지금 페이지 ④ 이 프레임의 채널.
 *
 * 이 파일은 **하나만 어긋나도 버리는가**를 각각 확인한다 — 넷 중 하나가 빠져도
 * 나머지 셋이 통과하면 조용히 열린다.
 */

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const ORIGIN = "https://machstudio.example.com";
const PAGE = "pg1";

let host: HTMLDivElement;
let root: Root;
let selected: string[] = [];
let codeReady: string[] = [];
let channel = "";
let push: ((theme: { accent: string; lightBg: string; darkBg: string }) => void) | null = null;
/** 프레임의 contentWindow 를 흉내낸다 — postMessage 를 가로채 본다. */
let frameWindow: { postMessage: (msg: unknown, origin: string) => void };
let posted: Array<{ msg: unknown; origin: string }> = [];

function Probe() {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  // 실제 iframe 대신 contentWindow 만 흉내낸 객체를 물린다.
  frameRef.current = { contentWindow: frameWindow } as unknown as HTMLIFrameElement;
  const api = useExpoPreviewChannel({
    pageId: PAGE,
    origin: ORIGIN,
    frameRef,
    onSelectSection: (sid) => { selected.push(sid); },
    onCustomCodeReady: (digest) => { codeReady.push(digest); },
  });
  channel = api.channel;
  push = api.pushTheme;
  return null;
}

/** 프레임이 보낸 것처럼 메시지를 쏜다. `source` 는 getter 전용이라 defineProperty 로 심는다. */
async function send(over: Record<string, unknown> = {}, opts: { origin?: string; source?: unknown } = {}) {
  const event = new MessageEvent("message", {
    data: { type: "mach-expo-select-section", pageId: PAGE, channel, sid: "sid-1", ...over },
    origin: opts.origin ?? ORIGIN,
  });
  Object.defineProperty(event, "source", {
    value: "source" in opts ? opts.source : frameWindow,
    configurable: true,
  });
  await act(async () => { window.dispatchEvent(event); });
}

beforeEach(async () => {
  selected = [];
  codeReady = [];
  posted = [];
  frameWindow = { postMessage: (msg, origin) => { posted.push({ msg, origin }); } };
  host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    root = createRoot(host);
    root.render(<Probe />);
  });
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  host?.remove();
  vi.restoreAllMocks();
});

describe("받을 것만 받는다", () => {
  it("네 조건이 다 맞으면 받는다", async () => {
    await send();
    expect(selected).toEqual(["sid-1"]);
  });

  /** ① sandbox 안의 붙여넣은 코드가 보낸 것은 여기서 걸린다. */
  it("다른 창이 보낸 것은 버린다", async () => {
    await send({}, { source: { postMessage: () => {} } });
    expect(selected).toEqual([]);
  });

  it("다른 오리진에서 온 것은 버린다", async () => {
    await send({}, { origin: "https://evil.example.com" });
    expect(selected).toEqual([]);
  });

  it("다른 페이지 것은 버린다", async () => {
    await send({ pageId: "다른페이지" });
    expect(selected).toEqual([]);
  });

  /** ④ 앞 프레임이 뒤늦게 보낸 메시지를 새 화면에 적용하지 않는다. */
  it("다른 채널 것은 버린다", async () => {
    await send({ channel: "옛채널" });
    expect(selected).toEqual([]);
  });

  it("모르는 종류는 버린다", async () => {
    await send({ type: "mach-expo-무언가" });
    expect(selected).toEqual([]);
    expect(codeReady).toEqual([]);
  });

  /** 타입이 맞아도 값이 문자열이 아니면 받지 않는다. */
  it("sid 가 문자열이 아니면 버린다", async () => {
    await send({ sid: { evil: true } });
    expect(selected).toEqual([]);
  });

  it("붙여넣은 코드가 떴다는 알림도 같은 조건이다", async () => {
    await send({ type: "mach-expo-custom-code-ready", codeDigest: "digest-1" });
    expect(codeReady).toEqual(["digest-1"]);

    await send({ type: "mach-expo-custom-code-ready", codeDigest: "digest-2" }, { origin: "https://evil.example.com" });
    expect(codeReady).toEqual(["digest-1"]);
  });
});

describe("보내기", () => {
  /** 색은 프레임에 밀어 넣는다 — 주소를 바꿔 다시 띄우지 않는다. */
  it("테마를 그 프레임에만, 정확한 오리진으로 보낸다", async () => {
    await act(async () => {
      push!({ accent: "#ff0000", lightBg: "#ffffff", darkBg: "#111318" });
    });

    expect(posted).toHaveLength(1);
    expect(posted[0].origin).toBe(ORIGIN);
    expect(posted[0].msg).toMatchObject({
      type: "mach-expo-preview-theme",
      pageId: PAGE,
      channel,
      theme: { accent: "#ff0000" },
    });
  });

  /**
   * `"*"` 로 보내면 미리보기가 남의 사이트 iframe 에 있을 때 그쪽이 내용을 읽는다.
   * 프레임 쪽 주석이 같은 이유로 targetOrigin 을 못박아 두었다.
   */
  it("와일드카드 오리진으로 보내지 않는다", async () => {
    await act(async () => {
      push!({ accent: "#ff0000", lightBg: "#ffffff", darkBg: "#111318" });
    });
    expect(posted[0].origin).not.toBe("*");
  });

  it("채널은 마운트 내내 변하지 않는다", async () => {
    const first = channel;
    await send();
    await act(async () => { root.render(<Probe />); });
    expect(channel).toBe(first);
  });
});
