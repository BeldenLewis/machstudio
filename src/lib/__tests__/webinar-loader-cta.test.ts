// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildWebinarLoaderScript } from "@/lib/webinar-loader-script";

type SuccessCta = { enabled: boolean; label: string; url: string };
type LoaderWindow = Window & typeof globalThis & { MachWebinar: { openRegister: () => void } };

function config(successCta: SuccessCta) {
  return {
    slug: "embed-test",
    name: "임베드 테스트",
    status: "registration",
    statusOverride: null,
    serverNow: new Date().toISOString(),
    entryOpenAt: "2099-01-01T00:00:00.000Z",
    liveStartAt: "2099-01-01T01:00:00.000Z",
    liveEndAt: "2099-01-01T02:00:00.000Z",
    signupDeadline: "2099-01-01T00:30:00.000Z",
    allowLiveRegistration: null,
    updatedKey: "test-key",
    theme: { accentColor: "#6d28d9" },
    components: { formWidget: { successMessage: "기존 완료 안내문" } },
    registrationForm: {
      fields: [{
        id: "name",
        key: "name",
        label: "이름",
        type: "text",
        placeholder: "",
        required: true,
        enabled: true,
        options: [],
        system: true,
      }],
      privacyText: "개인정보 동의",
      marketingText: "마케팅 동의",
      privacyBody: "",
      marketingBody: "",
      privacyDefaultChecked: true,
      marketingDefaultChecked: false,
      submitLabel: "등록하기",
      successCta,
    },
    links: { livePageUrl: null, surveyUrl: null, calendarUrl: null },
    ics: "",
    bannerPagePatterns: [],
  };
}

function response(body: unknown, ok = true) {
  return {
    ok,
    headers: { get: () => null },
    json: async () => body,
  };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function boot(successCta: SuccessCta) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes("/config")) return response(config(successCta));
    if (url.endsWith("/register")) return response({ id: "registration-test" });
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("scrollTo", vi.fn());
  sessionStorage.clear();
  localStorage.clear();
  document.body.innerHTML = '<div data-mach-webinar-mount="register-form"></div>';
  delete (window as typeof window & { __MACH_WEBINAR_LOADER__?: string }).__MACH_WEBINAR_LOADER__;
  window.eval(buildWebinarLoaderScript({ siteId: "site_test", baseUrl: "https://mach.example" }));
  await settle();
  return fetchMock;
}

async function submitRegistration() {
  const form = document.querySelector<HTMLFormElement>(".mw-form-card form");
  const name = document.querySelector<HTMLInputElement>('[data-mw-key="name"]');
  expect(form).toBeTruthy();
  expect(name).toBeTruthy();
  name!.value = "테스트 사용자";
  form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await settle();
  const dialog = document.querySelector<HTMLElement>(".mw-done-card");
  expect(dialog).toBeTruthy();
  return dialog!;
}

afterEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
  localStorage.clear();
  delete (window as typeof window & { __MACH_WEBINAR_LOADER__?: string }).__MACH_WEBINAR_LOADER__;
  vi.unstubAllGlobals();
});

describe("임베드 등록 완료 CTA", () => {
  it("완전한 CTA는 보안 속성과 독립 닫기 동작을 갖는다", async () => {
    await boot({ enabled: true, label: "오픈채팅 입장", url: "https://example.com/chat" });
    const dialog = await submitRegistration();
    const cta = dialog.querySelector<HTMLAnchorElement>(".mw-done-cta");
    const close = dialog.querySelector<HTMLButtonElement>(".mw-done-close");

    expect(dialog.textContent).toContain("기존 완료 안내문");
    expect(cta?.href).toBe("https://example.com/chat");
    expect(cta?.target).toBe("_blank");
    expect(cta?.rel).toBe("noopener noreferrer");
    expect(close).toBeTruthy();

    cta!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(document.body.contains(dialog)).toBe(true);
    close!.click();
    expect(document.body.contains(dialog)).toBe(false);
  });

  it.each([
    { enabled: true, label: "오픈채팅 입장", url: "javascript:alert(1)" },
    { enabled: true, label: "", url: "https://example.com/chat" },
  ])("unsafe or incomplete CTA falls back to one 확인 close button", async (successCta) => {
    await boot(successCta);
    const dialog = await submitRegistration();
    const confirm = Array.from(dialog.querySelectorAll("button")).find((button) => button.textContent === "확인");

    expect(dialog.querySelector(".mw-done-cta")).toBeNull();
    expect(dialog.querySelector(".mw-done-close")).toBeNull();
    expect(confirm).toBeTruthy();
    confirm!.click();
    expect(document.body.contains(dialog)).toBe(false);
  });

  it("done dialog takes keyboard ownership from a form modal", async () => {
    await boot({ enabled: true, label: "오픈채팅 입장", url: "https://example.com/chat" });
    (window as LoaderWindow).MachWebinar.openRegister();
    expect(document.getElementById("mw-form-modal")).toBeTruthy();

    const dialog = await submitRegistration();
    const cta = dialog.querySelector<HTMLAnchorElement>(".mw-done-cta");
    const close = dialog.querySelector<HTMLButtonElement>(".mw-done-close");
    expect(document.getElementById("mw-form-modal")).toBeNull();

    cta!.focus();
    cta!.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(close);
    close!.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(cta);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(document.body.contains(dialog)).toBe(false);
  });
});
