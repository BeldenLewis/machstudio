// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuthCallbackUrl, getPublicAppOrigin } from "../app-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("app URL browser boundary", () => {
  it("browser에서도 server와 같은 canonical outbound origin을 쓴다", () => {
    vi.stubEnv("NEXT_PUBLIC_CANONICAL_APP_URL", "https://app.example.com/");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");

    expect(getPublicAppOrigin()).toBe("https://app.example.com");
  });

  it("auth callback은 canonical URL 대신 현재 browser origin을 쓴다", () => {
    vi.stubEnv("NEXT_PUBLIC_CANONICAL_APP_URL", "https://app.example.com");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://legacy.example.com");

    expect(getAuthCallbackUrl()).toBe(`${window.location.origin}/auth/callback`);
  });
});
