// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildWebinarLoaderScript } from "@/lib/webinar-loader-script";
import { PUBLIC_REGISTRATION_FORM_CSS } from "@/lib/webinar-public-form-css";

type SuccessCta = { enabled: boolean; label: string; url: string };
type LoaderWindow = Window & typeof globalThis & { MachWebinar: { openRegister: () => void } };

function config(successCta: SuccessCta, accentColor = "#6d28d9") {
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
    theme: {
      accentColor,
      textColor: "#21182b",
      surfaceColor: "#fbf7ef",
      borderRadius: "14px",
    },
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
      }, {
        id: "interests",
        key: "interests",
        label: "관심\n분야",
        type: "multiple",
        placeholder: "",
        required: false,
        enabled: true,
        options: ["여러 줄로 감싸지는 아주 긴 복수 선택 문구입니다", "마케팅"],
        allowOther: true,
        maxSelect: 1,
        system: false,
      }],
      privacyText: "개인정보\n동의",
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

async function boot(successCta: SuccessCta, accentColor = "#6d28d9") {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes("/config")) return response(config(successCta, accentColor));
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
  it("공개 폼 클래스와 저장된 테마 토큰을 런타임에 적용한다", async () => {
    await boot({ enabled: false, label: "", url: "" });
    const css = document.getElementById("mw-styles")?.textContent ?? "";

    expect(document.querySelector(".mw-form-card")).toBeTruthy();
    expect(document.querySelector(".mw-input")).toBeTruthy();
    expect(document.querySelector(".mw-check")).toBeTruthy();
    expect(css).toContain("--mw-accent:#6d28d9");
    expect(css).toContain("--mw-text:#21182b");
    expect(css).toContain("--mw-surface:#fbf7ef");
    expect(css).toContain("--mw-on-accent:#ffffff");
    expect(PUBLIC_REGISTRATION_FORM_CSS).toContain("color:var(--mw-on-accent)");
    expect(PUBLIC_REGISTRATION_FORM_CSS).not.toContain("color:#fff");
    expect(PUBLIC_REGISTRATION_FORM_CSS).not.toContain("#dc2626");
    expect(PUBLIC_REGISTRATION_FORM_CSS).not.toContain("#16a34a");
  });

  it("모달은 native와 같은 공용 shell 폭·dvh·본문 스크롤 계약을 사용한다", async () => {
    await boot({ enabled: false, label: "", url: "" });
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    (window as LoaderWindow).MachWebinar.openRegister();

    const overlay = document.getElementById("mw-form-modal")!;
    const shell = overlay.querySelector<HTMLElement>(".mw-modal-card")!;
    const head = shell.querySelector<HTMLElement>(".mw-modal-head")!;
    const body = shell.querySelector<HTMLElement>(".mw-modal-body")!;
    const close = shell.querySelector<HTMLButtonElement>(".mw-modal-close")!;
    const css = document.getElementById("mw-styles")?.textContent ?? "";

    expect(getComputedStyle(overlay).padding).toBe("16px");
    expect(getComputedStyle(shell).maxWidth).toBe("520px");
    expect(getComputedStyle(shell).maxHeight).toContain("100dvh");
    expect(getComputedStyle(shell).overflow).toBe("hidden");
    expect(getComputedStyle(body).overflowY).toBe("auto");
    expect(head.contains(close)).toBe(true);
    expect(head.textContent).toContain("임베드 테스트 사전등록");
    expect(body.querySelector(".mw-submit")).toBeTruthy();
    expect(body.contains(close)).toBe(false);
    expect(css).not.toContain("max-width:480px");
    expect(css).not.toContain("max-height:86vh");
  });

  it("wrapped multiple-choice rows keep a 44px target and first-line checkbox alignment", async () => {
    await boot({ enabled: false, label: "", url: "" });
    const row = document.querySelector<HTMLElement>(".mw-multi .mw-check");
    const css = document.getElementById("mw-styles")?.textContent ?? "";

    expect(row?.textContent).toContain("여러 줄로 감싸지는");
    expect(css).toContain(".mw-multi .mw-check { margin-bottom:0; min-height:44px; align-items:flex-start; gap:10px; padding:12px 0; line-height:20px; }");
    expect(css).toContain(".mw-multi .mw-check input { margin-top:1px; }");
  });

  it("empty checked other immediately locks normal choices at maxSelect", async () => {
    await boot({ enabled: false, label: "", url: "" });
    const multi = document.querySelector<HTMLElement>('[data-mw-key="interests"]')!;
    const boxes = Array.from(multi.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    const [longOption, marketing, other] = boxes;

    other.click();

    expect(other.checked).toBe(true);
    expect(longOption.disabled).toBe(true);
    expect(marketing.disabled).toBe(true);
  });

  it("preserves configured line breaks in field and consent labels", async () => {
    await boot({ enabled: false, label: "", url: "" });
    const fieldLabel = Array.from(document.querySelectorAll<HTMLElement>(".mw-label"))
      .find((label) => label.textContent?.includes("관심"))!;
    const privacyText = Array.from(document.querySelectorAll<HTMLElement>(".mw-check span"))
      .find((span) => span.textContent?.includes("개인정보"))!;

    expect(fieldLabel.textContent).toContain("\n");
    expect(privacyText.textContent).toContain("\n");
    expect(getComputedStyle(fieldLabel).whiteSpace).toBe("pre-wrap");
    expect(getComputedStyle(privacyText).whiteSpace).toBe("pre-wrap");
  });

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

  it("밝은 accent에서도 완료 CTA·확인과 성공 상태는 on-accent 테마 대비값을 쓴다", async () => {
    await boot(
      { enabled: true, label: "밝은 CTA", url: "https://example.com/bright" },
      "#ffe066",
    );
    const dialog = await submitRegistration();
    const cta = dialog.querySelector<HTMLAnchorElement>(".mw-done-cta")!;
    const mark = dialog.querySelector<HTMLElement>(".mw-done-mark")!;
    const css = document.getElementById("mw-styles")?.textContent ?? "";

    expect(css).toContain("--mw-on-accent:#1a1a1f");
    expect(cta.style.background).toBe("rgb(255, 224, 102)");
    expect(cta.style.color).toBe("rgb(26, 26, 31)");
    // jsdom은 custom property를 최종 RGB로 해석하지 않지만 적용된 값이 accent 토큰인지 확인할 수 있다.
    expect(getComputedStyle(mark).color).toBe("var(--mw-accent)");
    expect(css).toContain("color: var(--mw-on-accent)");
    expect(css).not.toContain("#12B76A");
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
    const opener = document.createElement("button");
    opener.type = "button";
    opener.textContent = "사전등록 열기";
    document.body.appendChild(opener);
    opener.focus();
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
    expect(document.activeElement).toBe(opener);
  });

  it.each(["button", "overlay", "escape"] as const)(
    "inline completion restores focus to its connected form card after %s close",
    async (closeBy) => {
      await boot({ enabled: true, label: "오픈채팅 입장", url: "https://example.com/chat" });
      const restoreTarget = document.querySelector<HTMLElement>(".mw-form-card")!;
      const dialog = await submitRegistration();
      const overlay = dialog.parentElement!;

      expect(restoreTarget.isConnected).toBe(true);
      expect(restoreTarget.tabIndex).toBe(-1);

      if (closeBy === "button") {
        dialog.querySelector<HTMLButtonElement>(".mw-done-close")!.click();
      } else if (closeBy === "overlay") {
        overlay.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      } else {
        document.dispatchEvent(new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }));
      }

      expect(document.body.contains(dialog)).toBe(false);
      expect(document.activeElement).toBe(restoreTarget);
    },
  );
});
