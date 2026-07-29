// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import LivePageTab from "@/app/(app)/webinar/[slug]/LivePageTab";
import PreLiveWaiting from "../PreLiveWaiting";
import { normalizeLivePageConfig } from "@/lib/webinar-config";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let host: HTMLDivElement | null = null;
let root: Root | null = null;

const webinar = {
  name: "대기 화면 테스트",
  description: null,
  liveStartAt: "2026-08-01T01:00:00.000Z",
  sessions: [],
};

function renderWaiting(
  config: Record<string, unknown>,
  waitingCount = 2,
  actions: { hasCalendar?: boolean; onCalendar?: () => void } = {},
) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <PreLiveWaiting
        webinar={webinar}
        accent="#6D28D9"
        text="#141320"
        surface="#FFFFFF"
        targetIso="2026-08-02T01:00:00.000Z"
        serverNowMs={Date.parse("2026-08-01T01:00:00.000Z")}
        live={normalizeLivePageConfig(config)}
        waitingCount={waitingCount}
        hasCalendar={actions.hasCalendar}
        onCalendar={actions.onCalendar}
      />,
    );
  });
  return host;
}

function renderWaitingEditor() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <LivePageTab
        webinar={{ id: "waiting-editor-test", theme: {}, config: {} }}
        slug="waiting-editor-test"
        state="waiting"
        onStateChange={vi.fn()}
        onSilentUpdate={vi.fn()}
      />,
    );
  });
  return host;
}

function changeInput(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  nativeSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllGlobals();
});

describe("대기 안내 CTA 편집", () => {
  it("중첩 설정을 자동 저장하고 안전하지 않은 URL은 해당 입력 아래에 알린다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ surveys: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    const editor = renderWaitingEditor();
    const toggle = editor.querySelector<HTMLButtonElement>('[role="switch"][aria-label="안내 영역 표시"]');
    const label = editor.querySelector<HTMLInputElement>('[aria-label="대기 CTA 버튼 문구"]');
    const url = editor.querySelector<HTMLInputElement>('[aria-label="대기 CTA 연결 URL"]');

    expect(toggle).toBeTruthy();
    expect(label).toBeTruthy();
    expect(url).toBeTruthy();

    act(() => {
      toggle?.click();
      changeInput(label!, "  행사 안내 보기  ");
      changeInput(url!, "  https://example.com/guide  ");
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    });

    const patch = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PATCH");
    expect(patch).toBeTruthy();
    const body = JSON.parse((patch![1] as RequestInit).body as string);
    expect(body.config.livePage.waiting.followUp).toEqual({
      enabled: true,
      text: "",
      ctaLabel: "  행사 안내 보기  ",
      ctaUrl: "https://example.com/guide",
    });

    act(() => changeInput(url!, "javascript:alert(1)"));

    expect(url?.nextElementSibling?.textContent).toBe("http:// 또는 https:// 주소를 입력해 주세요.");
  });
});

describe("PreLiveWaiting 안내 CTA", () => {
  it("캘린더는 모바일 전용 하단 배너 마크업으로 표시한다", () => {
    const onCalendar = vi.fn();
    const view = renderWaiting(
      { livePage: { waiting: { calendar: true } } },
      2,
      { hasCalendar: true, onCalendar },
    );

    const banner = view.querySelector<HTMLElement>(".plw-calendar-banner")!;
    const button = banner.querySelector<HTMLButtonElement>("button")!;
    const css = view.querySelector("style")?.textContent ?? "";
    expect(banner).toBeTruthy();
    expect(view.querySelector(".live-inner")?.classList.contains("has-calendar-banner")).toBe(true);
    expect(view.querySelector(".plw-ctas .calendar")).toBeNull();
    expect(css).toContain("@media (min-width:601px)");
    expect(css).toContain(".stk-live .live-inner.has-calendar-banner");
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain(".stk-live .plw-calendar-banner button:hover");
    expect(css).toContain(".stk-live .plw-calendar-banner button:active");
    expect(css).toContain(".stk-live .plw-calendar-banner button:focus-visible");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(getComputedStyle(button).minHeight).toBe("44px");

    act(() => button.click());
    expect(onCalendar).toHaveBeenCalledTimes(1);
  });

  it("추가 카드는 이 웨비나는 소개 카드 다음에 놓이고 아젠다 없이도 보인다", () => {
    const view = renderWaiting({
      livePage: {
        waiting: {
          agenda: false,
          followUp: {
            enabled: true,
            text: "자료는 종료 후 보내드려요.",
            ctaLabel: "행사 안내",
            ctaUrl: "https://example.com",
          },
        },
      },
    });

    const stack = view.querySelector(".plw-info-stack")!;
    const card = stack.querySelector<HTMLElement>(".plw-follow-up-card")!;
    const css = view.querySelector("style")?.textContent ?? "";
    expect(stack.children[0]?.classList.contains("plw-panel")).toBe(true);
    expect(stack.children[1]?.classList.contains("plw-follow-up-card")).toBe(true);
    expect(view.querySelector(".plw-ag")).toBeNull();
    expect(css).toContain("background:var(--card)");
    expect(css).toContain("border-radius:var(--radius)");
    expect(css).toContain("box-shadow:var(--card-shadow)");
    expect(getComputedStyle(card).padding).toBe("24px");
  });

  it("인원 밴드가 켜져 있고 현재 대기 인원이 2명이면 실제 밴드를 표시한다", () => {
    const view = renderWaiting({
      livePage: { waiting: { social: true } },
    }, 2);

    expect(view.querySelector(".plw-together")?.textContent).toContain("2명이 함께 기다려요");
  });

  it("인원 밴드를 꺼도 독립 안내문은 표시한다", () => {
    const view = renderWaiting({
      livePage: { waiting: { social: false, followUp: { enabled: true, text: "자료는 종료 후 보내드려요." } } },
    });

    expect(view.querySelector(".plw-together")).toBeNull();
    expect(view.querySelector(".plw-follow-up-card")?.textContent).toContain("자료는 종료 후 보내드려요.");
  });

  it.each([0, 1])("대기 인원이 %i명이면 밴드는 숨기고 안내문은 남긴다", (waitingCount) => {
    const view = renderWaiting({
      livePage: { waiting: { followUp: { enabled: true, text: "잠시 후 시작합니다." } } },
    }, waitingCount);

    expect(view.querySelector(".plw-together")).toBeNull();
    expect(view.querySelector(".plw-follow-up-card")?.textContent).toContain("잠시 후 시작합니다.");
  });

  it("안내 영역을 끄면 채운 내용도 숨긴다", () => {
    const view = renderWaiting({
      livePage: { waiting: { followUp: { enabled: false, text: "숨겨야 하는 안내" } } },
    });

    expect(view.querySelector(".plw-follow-up-card")).toBeNull();
  });

  it.each([
    { ctaLabel: "행사 안내", ctaUrl: "javascript:alert(1)" },
    { ctaLabel: "", ctaUrl: "https://example.com/guide" },
  ])("문구 없이 안전하지 않거나 불완전한 CTA만 있으면 안내 영역을 숨긴다", (followUp) => {
    const view = renderWaiting({
      livePage: { waiting: { followUp: { enabled: true, text: "", ...followUp } } },
    });

    expect(view.querySelector(".plw-follow-up-card")).toBeNull();
  });

  it("완성된 CTA는 새 탭 보안 속성과 함께 표시한다", () => {
    const view = renderWaiting({
      livePage: {
        waiting: {
          followUp: { enabled: true, text: "", ctaLabel: "행사 안내 보기", ctaUrl: "https://example.com/guide" },
        },
      },
    });

    const cta = view.querySelector<HTMLAnchorElement>(".plw-follow-up-card a");
    expect(cta?.textContent).toBe("행사 안내 보기");
    expect(cta?.href).toBe("https://example.com/guide");
    expect(cta?.target).toBe("_blank");
    expect(cta?.rel).toBe("noopener noreferrer");
  });
});
