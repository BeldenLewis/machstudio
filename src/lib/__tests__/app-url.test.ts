// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicAppOrigin } from "../app-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getPublicAppOrigin", () => {
  it("configured public URL을 브라우저 origin보다 우선하고 끝 슬래시를 없앤다", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com/");

    expect(window.location.origin).not.toBe("https://app.example.com");
    expect(getPublicAppOrigin()).toBe("https://app.example.com");
  });
});
