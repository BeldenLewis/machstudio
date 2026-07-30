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
  registrantCount = 2,
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
        registrantCount={registrantCount}
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
      title: "",
      text: "",
      items: [],
      ctaLabel: "  행사 안내 보기  ",
      ctaUrl: "https://example.com/guide",
    });

    act(() => changeInput(url!, "javascript:alert(1)"));

    expect(url?.nextElementSibling?.textContent).toBe("http:// 또는 https:// 주소를 입력해 주세요.");
  });
});

describe("PreLiveWaiting 안내 CTA", () => {
  /**
   * 캘린더는 **초대 공유와 같은 줄의 형제 버튼**이다. 예전에는 화면 하단 고정 배너였는데,
   * 늘 떠 있어 콘텐츠를 가리면서도 다른 CTA 들과 위계가 끊겨 있었다.
   * 모바일 전용이지만 렌더가 아니라 CSS 로 가린다 — 조건부 렌더면 리사이즈마다 노드가
   * 붙었다 떨어지며 옆 버튼들이 튄다.
   */
  it("캘린더는 초대 공유와 같은 줄의 버튼으로, 모바일에서만 보인다", () => {
    const onCalendar = vi.fn();
    const view = renderWaiting(
      { livePage: { waiting: { calendar: true, share: true } } },
      2,
      { hasCalendar: true, onCalendar },
    );

    const row = view.querySelector<HTMLElement>(".plw-ctas")!;
    const cal = row.querySelector<HTMLButtonElement>(".plw-btn.cal")!;
    const css = view.querySelector("style")?.textContent ?? "";
    expect(cal).toBeTruthy();
    // 하단 고정 배너는 더 이상 없다 — 본문 패딩 보정도 함께 사라졌다
    expect(view.querySelector(".plw-calendar-banner")).toBeNull();
    expect(view.querySelector(".live-inner")?.classList.contains("has-calendar-banner")).toBe(false);
    // 초대 공유와 같은 줄 안에 있다(이 하네스는 onShare 를 넘기지 않아 공유 버튼 자체는 안 그려진다)
    expect(cal.parentElement).toBe(row);
    expect(css).toContain("@media (min-width:768px) { .stk-live .plw-btn.cal { display:none; } }");
    // .plw-btn 규격을 그대로 물려받는다(터치 타깃 46px)
    expect(getComputedStyle(cal).height).toBe("46px");

    act(() => cal.click());
    expect(onCalendar).toHaveBeenCalledTimes(1);
  });

  /** 설정이 비면 웨비나 기본정보가 나가고, 채우면 이 화면에서만 그 값을 쓴다. */
  it("소개 카드는 비면 웨비나 이름·설명으로 떨어진다", () => {
    const view = renderWaiting({ livePage: { waiting: { social: true } } }, 9);
    const panel = view.querySelector<HTMLElement>(".plw-panel")!;
    expect(panel.querySelector("h3")?.textContent).toBe("이 웨비나는");
    expect(panel.querySelector(".big")?.textContent).toBe(webinar.name);
  });

  it("소개 카드 설정을 채우면 그 값이 이긴다", () => {
    const view = renderWaiting({
      livePage: {
        waiting: {
          social: true,
          about: { eyebrow: "이번 세션은", title: "LA 진출 실전", body: "첫 줄\n둘째 줄" },
        },
      },
    }, 9);
    const panel = view.querySelector<HTMLElement>(".plw-panel")!;
    expect(panel.querySelector("h3")?.textContent).toBe("이번 세션은");
    expect(panel.querySelector(".big")?.textContent).toBe("LA 진출 실전");
    // 줄바꿈은 pre-line 으로 보존한다(AGENTS 공통 규칙)
    expect(panel.querySelector(".desc")?.textContent).toContain("둘째 줄");
    expect(getComputedStyle(panel.querySelector(".desc")!).whiteSpace).toBe("pre-line");
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

    /* 배치가 바뀌었다 — 왼쪽 열은 CTA 카드만, 오른쪽 열은 소개 카드 위 · 세션 순서 아래.
       세션 순서를 볼 때 "무슨 웨비나였나" 가 바로 위에 있어야 읽히고, CTA 는 그 흐름 밖의 제안이다. */
    const side = view.querySelector(".plw-info-stack.side")!;
    const main = view.querySelector(".plw-info-stack.main")!;
    const card = side.querySelector<HTMLElement>(".plw-follow-up-card")!;
    const css = view.querySelector("style")?.textContent ?? "";
    expect(side.children[0]?.classList.contains("plw-follow-up-card")).toBe(true);
    expect(side.querySelector(".plw-panel")).toBeNull();
    expect(main.children[0]?.classList.contains("plw-panel")).toBe(true);
    expect(view.querySelector(".plw-ag")).toBeNull();
    // 한 열로 접히면 소개·아젠다가 먼저 오도록 order 를 뒤집는다(DOM 순서는 CTA 가 먼저다)
    expect(css).toContain(".stk-live .plw-info-stack.main { order:1; }");
    expect(css).toContain(".stk-live .plw-info-stack.side { order:2; }");
    expect(css).toContain("background:var(--card)");
    expect(css).toContain("border-radius:var(--radius)");
    expect(css).toContain("box-shadow:var(--card-shadow)");
    // 좌우는 형제 패널과 같은 24px, 위아래만 조금 좁다 — 이 카드는 제목·목록·버튼이 쌓여
    // 세로가 길어서 같은 값이면 아래가 떠 보인다.
    expect(getComputedStyle(card).padding).toBe("22px 24px");
  });

  /**
   * 밴드가 쓰는 값은 **누적 사전등록자 수**다(지금 접속 중인 인원이 아니라) — 등록을 망설이는
   * 사람에게 보여 주는 숫자라 여태 몇 명이 등록했는지가 설득력이 있다.
   */
  it("인원 밴드가 켜져 있고 사전등록자가 2명이면 겹친 프로필과 함께 표시한다", () => {
    const view = renderWaiting({
      livePage: { waiting: { social: true } },
    }, 2);

    const band = view.querySelector(".plw-together");
    expect(band?.textContent).toContain("2명이 사전등록했어요");
    // 원은 개수를 세는 장식이 아니라 고정 4칸 — 실제 수는 문장이 말한다.
    expect(band?.querySelectorAll(".plw-avatars span")).toHaveLength(4);
    // 장식이라 스크린리더에서 감춘다
    expect(band?.querySelector(".plw-avatars")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("밴드는 이 웨비나는 카드의 마지막 줄에 놓인다", () => {
    const view = renderWaiting({ livePage: { waiting: { social: true } } }, 9);
    const panel = view.querySelector(".plw-panel");
    expect(panel?.lastElementChild?.classList.contains("plw-together")).toBe(true);
  });

  it("인원 밴드를 꺼도 독립 안내문은 표시한다", () => {
    const view = renderWaiting({
      livePage: { waiting: { social: false, followUp: { enabled: true, text: "자료는 종료 후 보내드려요." } } },
    });

    expect(view.querySelector(".plw-together")).toBeNull();
    expect(view.querySelector(".plw-follow-up-card")?.textContent).toContain("자료는 종료 후 보내드려요.");
  });

  it.each([0, 1])("사전등록자가 %i명이면 밴드는 숨기고 안내문은 남긴다", (registrantCount) => {
    const view = renderWaiting({
      livePage: { waiting: { followUp: { enabled: true, text: "잠시 후 시작합니다." } } },
    }, registrantCount);

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
