// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ResetPasswordRequestPage from "../page";

const resetPasswordForEmail = vi.hoisted(() => vi.fn(async () => ({ error: null })));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { resetPasswordForEmail } }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_CANONICAL_APP_URL", "https://app.example.com");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://legacy.example.com");
  resetPasswordForEmail.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(<ResetPasswordRequestPage />); });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllEnvs();
});

describe("비밀번호 재설정", () => {
  it("메일 redirect는 canonical outbound URL이 아니라 현재 runtime origin을 쓴다", async () => {
    const input = container.querySelector<HTMLInputElement>('input[type="email"]');
    const form = container.querySelector("form");
    expect(input).toBeTruthy();
    expect(form).toBeTruthy();

    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "owner@example.com");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(resetPasswordForEmail).toHaveBeenCalledWith("owner@example.com", {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password/update`,
    });
  });
});
