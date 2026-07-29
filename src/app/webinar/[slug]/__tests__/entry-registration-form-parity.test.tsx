// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import LivePage from "../live/page";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("../LivePushLayer", () => ({ default: () => null }));
vi.mock("../PreLiveWaiting", () => ({
  default: ({ centerAction }: { centerAction?: React.ReactNode }) => <>{centerAction}</>,
}));
vi.mock("../EntryVerify", () => ({ default: () => null }));
vi.mock("../EndedScreen", () => ({ default: () => <div data-ended-screen>종료 화면</div> }));

const webinar = {
  id: "webinar-entry-form",
  name: "공개 폼 패리티 웨비나",
  slug: "entry-form",
  description: "등록 폼 테스트",
  liveStartAt: "2099-01-01T01:00:00.000Z",
  liveEndAt: "2099-01-01T02:00:00.000Z",
  signupDeadline: "2099-01-01T00:30:00.000Z",
  theme: {
    bgColor: "#08111f",
    surfaceColor: "#f7f3ec",
    accentColor: "#a23b72",
    textColor: "#221923",
    borderRadius: "15px",
  },
  config: {
    registrationForm: {
      fields: [
        {
          id: "name",
          key: "name",
          label: "이름",
          type: "text",
          placeholder: "홍길동",
          required: true,
          enabled: true,
          options: [],
          system: true,
        },
        {
          id: "role",
          key: "role",
          label: "역할",
          type: "select",
          placeholder: "",
          required: false,
          enabled: true,
          options: ["기획", "개발"],
          system: false,
        },
        {
          id: "topics",
          key: "topics",
          label: "관심 주제",
          type: "multiple",
          placeholder: "",
          required: false,
          enabled: true,
          options: ["제품", "마케팅"],
          system: false,
        },
        {
          id: "updates",
          key: "updates",
          label: "업데이트\n수신",
          type: "checkbox",
          placeholder: "",
          required: false,
          enabled: true,
          options: [],
          system: false,
        },
      ],
      privacyText: "[필수] 개인정보\n동의",
      marketingText: "[선택] 마케팅 동의",
      privacyBody: "",
      marketingBody: "",
      privacyDefaultChecked: false,
      marketingDefaultChecked: false,
      submitLabel: "사전등록 완료하기",
      successCta: { enabled: false, label: "", url: "" },
    },
  },
  components: {},
  sessions: [],
};

let host: HTMLDivElement | null = null;
let root: Root | null = null;

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderLivePageInEntryState(webinarValue = webinar) {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/register")) {
      return jsonResponse({ registration: { id: "registration-success" }, youtubeId: null });
    }
    if (url.endsWith("/info")) {
      return jsonResponse({
        webinar: webinarValue,
        status: "registration",
        entryOpen: false,
        canRegister: true,
        serverNow: "2026-07-29T00:00:00.000Z",
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  }));

  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<LivePage params={Promise.resolve({ slug: "entry-form" })} />);
  });
  await flush();
  return host;
}

function setTextInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.removeAttribute("style");
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
  root = null;
  host = null;
});

describe("입장 화면 사전등록 폼", () => {
  it("랜딩 공개 등록 폼의 클래스 계약과 저장된 테마 토큰을 사용한다", async () => {
    const view = await renderLivePageInEntryState();
    const opener = Array.from(view.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("사전등록하기"));

    act(() => opener?.click());

    const overlay = view.querySelector<HTMLElement>(".mw-modal-overlay");
    expect(overlay).toBeTruthy();
    expect(view.querySelector(".mw-form-card")).toBeTruthy();
    expect(view.querySelectorAll(".mw-field").length).toBeGreaterThan(0);
    expect(view.querySelector(".mw-input")).toBeTruthy();
    expect(view.querySelector(".mw-select")).toBeTruthy();
    expect(view.querySelector(".mw-multi")).toBeTruthy();
    expect(view.querySelector(".mw-check")).toBeTruthy();
    expect(view.querySelector(".mw-submit")).toBeTruthy();
    expect(overlay?.style.getPropertyValue("--mw-accent")).toBe("#a23b72");
    expect(overlay?.style.getPropertyValue("--mw-text")).toBe("#221923");
    expect(overlay?.style.getPropertyValue("--mw-surface")).toBe("#f7f3ec");
    expect(overlay?.style.getPropertyValue("--mw-on-accent")).toBe("#ffffff");
    const css = view.querySelector("style")?.textContent ?? "";
    expect(css).toContain("color:var(--mw-on-accent)");
    expect(css).not.toContain("color:#fff");
    expect(css).not.toContain("#dc2626");
    expect(css).not.toContain("#16a34a");

    const customCheckboxText = Array.from(view.querySelectorAll<HTMLElement>(".mw-field.mw-check span"))
      .find((span) => span.textContent?.includes("업데이트"))!;
    const privacyText = Array.from(view.querySelectorAll<HTMLElement>(".mw-check span"))
      .find((span) => span.textContent?.includes("개인정보"))!;
    expect(customCheckboxText.textContent).toContain("\n");
    expect(privacyText.textContent).toContain("\n");
    expect(getComputedStyle(customCheckboxText).whiteSpace).toBe("pre-wrap");
    expect(getComputedStyle(privacyText).whiteSpace).toBe("pre-wrap");
  });

  it("공용 shell에서 제목과 닫기를 고정하고 폼 본문만 내부 스크롤한다", async () => {
    const view = await renderLivePageInEntryState();
    const opener = Array.from(view.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("사전등록하기"));

    act(() => opener?.click());

    const overlay = view.querySelector<HTMLElement>(".mw-modal-overlay")!;
    const shell = overlay.querySelector<HTMLElement>(".mw-modal-card")!;
    const head = shell.querySelector<HTMLElement>(".mw-modal-head")!;
    const body = shell.querySelector<HTMLElement>(".mw-modal-body")!;
    const close = shell.querySelector<HTMLButtonElement>(".mw-modal-close")!;
    const css = view.querySelector("style")?.textContent ?? "";

    expect(getComputedStyle(overlay).padding).toBe("16px");
    expect(getComputedStyle(shell).maxWidth).toBe("520px");
    expect(getComputedStyle(shell).maxHeight).toContain("100dvh");
    expect(getComputedStyle(shell).overflow).toBe("hidden");
    expect(getComputedStyle(body).overflowY).toBe("auto");
    expect(head.contains(close)).toBe(true);
    expect(head.textContent).toContain("공개 폼 패리티 웨비나 사전등록");
    expect(body.querySelector(".mw-submit")).toBeTruthy();
    expect(body.contains(close)).toBe(false);
    expect(css).not.toContain("max-width:480px");
    expect(css).not.toContain("max-height:86vh");
    expect(css).not.toContain("max-height:88vh");
  });

  it("moves focus inside, traps Tab, and restores the opener after ordinary close", async () => {
    const view = await renderLivePageInEntryState();
    const opener = Array.from(view.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("사전등록하기"))!;
    opener.focus();

    act(() => opener.click());
    const overlay = view.querySelector<HTMLElement>(".mw-modal-overlay")!;
    const focusable = Array.from(overlay.querySelectorAll<HTMLElement>(
      'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
    ));
    const first = focusable[0];
    const last = focusable.at(-1)!;

    expect(overlay.contains(document.activeElement)).toBe(true);
    last.focus();
    last.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(first);
    first.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }));
    expect(document.activeElement).toBe(last);

    act(() => view.querySelector<HTMLButtonElement>('[aria-label="닫기"]')?.click());
    await flush();
    expect(document.activeElement).toBe(opener);
  });

  it.each(["overlay", "escape"] as const)(
    "restores the opener and body scroll after %s close",
    async (closeBy) => {
      const view = await renderLivePageInEntryState();
      const opener = Array.from(view.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.includes("사전등록하기"))!;
      document.body.style.overflow = "clip";
      opener.focus();
      act(() => opener.click());
      expect(document.body.style.overflow).toBe("hidden");

      const overlay = view.querySelector<HTMLElement>(".mw-modal-overlay")!;
      act(() => {
        if (closeBy === "overlay") {
          overlay.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        } else {
          document.dispatchEvent(new KeyboardEvent("keydown", {
            key: "Escape",
            bubbles: true,
            cancelable: true,
          }));
        }
      });
      await flush();

      expect(view.querySelector(".mw-modal-overlay")).toBeNull();
      expect(document.body.style.overflow).toBe("clip");
      expect(document.activeElement).toBe(opener);
    },
  );

  it("등록 성공 뒤 완료 모달을 닫으면 연결된 시청 화면 루트로 포커스를 복원한다", async () => {
    const view = await renderLivePageInEntryState();
    const viewerRoot = view.querySelector<HTMLElement>("[data-viewer-focus-root]");
    const opener = Array.from(view.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("사전등록하기"));
    expect(viewerRoot).toBeTruthy();
    expect(opener).toBeTruthy();

    act(() => opener!.click());
    const name = view.querySelector<HTMLInputElement>('.mw-input[type="text"]');
    const privacy = Array.from(view.querySelectorAll<HTMLInputElement>(".mw-check input"))
      .find((input) => input.nextElementSibling?.textContent?.includes("개인정보"));
    expect(name).toBeTruthy();
    expect(privacy).toBeTruthy();

    act(() => {
      setTextInput(name!, "테스트 사용자");
      privacy!.click();
    });
    await act(async () => {
      view.querySelector<HTMLButtonElement>(".mw-submit")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(opener!.isConnected).toBe(false);
    expect(view.querySelector('[aria-label="사전등록 완료"]')).toBeTruthy();
    await act(async () => {
      Array.from(view.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent === "확인")
        ?.click();
      await Promise.resolve();
    });
    await flush();

    expect(document.activeElement).toBe(viewerRoot);
  });

  it("밝은 accent에서도 완료 CTA와 성공 표식이 테마 대비색을 사용한다", async () => {
    const brightWebinar = {
      ...webinar,
      theme: { ...webinar.theme, accentColor: "#ffe066" },
      config: {
        ...webinar.config,
        registrationForm: {
          ...webinar.config.registrationForm,
          successCta: { enabled: true, label: "다음 안내 보기", url: "https://example.com/next" },
        },
      },
    };
    const view = await renderLivePageInEntryState(brightWebinar);
    const opener = Array.from(view.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("사전등록하기"))!;

    act(() => opener.click());
    const name = view.querySelector<HTMLInputElement>('.mw-input[type="text"]')!;
    const privacy = Array.from(view.querySelectorAll<HTMLInputElement>(".mw-check input"))
      .find((input) => input.nextElementSibling?.textContent?.includes("개인정보"))!;
    act(() => {
      setTextInput(name, "밝은 테마 사용자");
      privacy.click();
    });
    await act(async () => {
      view.querySelector<HTMLButtonElement>(".mw-submit")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    const cta = view.querySelector<HTMLAnchorElement>('a[href="https://example.com/next"]')!;
    const mark = view.querySelector<HTMLElement>(".mw-done-mark")!;
    expect(cta.style.background).toBe("rgb(255, 224, 102)");
    expect(cta.style.color).toBe("rgb(26, 26, 31)");
    expect(mark.style.color).toBe("rgb(255, 224, 102)");
    expect(mark.style.background).toContain("color-mix");
  });

  it("중첩 약관 Escape는 약관만 닫고 등록 모달과 opener 포커스를 유지한다", async () => {
    const termsWebinar = {
      ...webinar,
      config: {
        ...webinar.config,
        registrationForm: {
          ...webinar.config.registrationForm,
          privacyBody: "첫 문단\n\n둘째 문단",
        },
      },
    };
    const view = await renderLivePageInEntryState(termsWebinar);
    const opener = Array.from(view.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("사전등록하기"))!;
    act(() => opener.click());

    const formDialog = view.querySelector<HTMLElement>('[role="dialog"][aria-label="사전 등록"]')!;
    const termsTrigger = Array.from(formDialog.querySelectorAll<HTMLButtonElement>(".mw-check button"))
      .find((button) => button.textContent?.includes("개인정보"))!;
    termsTrigger.focus();
    act(() => termsTrigger.click());
    await flush();

    const termsDialog = Array.from(view.querySelectorAll<HTMLElement>('[role="dialog"]'))
      .find((dialog) => dialog.getAttribute("aria-label")?.includes("개인정보"))!;
    expect(termsDialog).toBeTruthy();

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }));
    });
    await flush();

    expect(view.contains(formDialog)).toBe(true);
    expect(view.querySelectorAll('[role="dialog"]').length).toBe(1);
    expect(document.activeElement).toBe(termsTrigger);
  });

  it("malformed 200 status refresh leaves the current public screen state untouched", async () => {
    window.history.replaceState(null, "", "/?view=signup");
    localStorage.setItem("mach_reg_entry-form", JSON.stringify({ registrationId: "registered-viewer" }));
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/info")) {
        return jsonResponse({
          webinar,
          status: "registration",
          entryOpen: true,
          canRegister: true,
          serverNow: "2026-07-29T00:00:00.000Z",
        });
      }
      if (url.endsWith("/status")) return jsonResponse({});
      if (url.endsWith("/ping")) return jsonResponse({});
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<LivePage params={Promise.resolve({ slug: "entry-form" })} />);
    });
    await flush();

    const enterButton = Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("웨비나 입장하기"))!;
    expect(enterButton).toBeTruthy();
    await act(async () => {
      enterButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(Array.from(host.querySelectorAll("button"))
      .some((button) => button.textContent?.includes("웨비나 입장하기"))).toBe(true);
    expect(host.querySelector("[data-ended-screen]")).toBeNull();
  });
});
