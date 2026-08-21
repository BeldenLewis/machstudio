import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicAppOrigin } from "../app-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getPublicAppOrigin (server)", () => {
  it("명시한 canonical URL을 우선하고 끝 슬래시를 없앤다", () => {
    vi.stubEnv("NEXT_PUBLIC_CANONICAL_APP_URL", "https://app.example.com/");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://legacy.example.com/");

    expect(typeof window).toBe("undefined");
    expect(getPublicAppOrigin()).toBe("https://app.example.com");
  });

  it("legacy app URL은 비로컬 canonical 후보일 때만 호환용으로 쓴다", () => {
    vi.stubEnv("NEXT_PUBLIC_CANONICAL_APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://legacy.example.com/");

    expect(getPublicAppOrigin()).toBe("https://legacy.example.com");
  });

  it("문서화한 localhost runtime URL은 outbound origin으로 쓰지 않는다", () => {
    vi.stubEnv("NEXT_PUBLIC_CANONICAL_APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");

    expect(getPublicAppOrigin()).toBe("");
  });

  it("모든 loopback hostname은 outbound origin으로 쓰지 않는다", () => {
    vi.stubEnv("NEXT_PUBLIC_CANONICAL_APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://127.0.0.55:3000");

    expect(getPublicAppOrigin()).toBe("");
  });

  it("localhost 하위 hostname도 outbound origin으로 쓰지 않는다", () => {
    vi.stubEnv("NEXT_PUBLIC_CANONICAL_APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://preview.localhost:3000");

    expect(getPublicAppOrigin()).toBe("");
  });

  it("terminal DNS dot이 있는 localhost도 outbound origin으로 쓰지 않는다", () => {
    vi.stubEnv("NEXT_PUBLIC_CANONICAL_APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost.:3000");

    expect(getPublicAppOrigin()).toBe("");
  });

  it("terminal DNS dot이 있는 localhost 하위 hostname도 outbound origin으로 쓰지 않는다", () => {
    vi.stubEnv("NEXT_PUBLIC_CANONICAL_APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://preview.localhost.:3000");

    expect(getPublicAppOrigin()).toBe("");
  });

  it("설정이 없으면 빈 값으로 fail closed 한다", () => {
    vi.stubEnv("NEXT_PUBLIC_CANONICAL_APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");

    expect(getPublicAppOrigin()).toBe("");
  });

  it("운영자가 명시한 Vercel canonical URL은 끝 슬래시를 정규화해 쓴다", () => {
    vi.stubEnv("NEXT_PUBLIC_CANONICAL_APP_URL", "https://machstudio.vercel.app/");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");

    expect(getPublicAppOrigin()).toBe("https://machstudio.vercel.app");
  });

  it("legacy app URL의 Vercel preview host는 outbound origin으로 쓰지 않는다", () => {
    vi.stubEnv("NEXT_PUBLIC_CANONICAL_APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://mach-studio-git-branch-team.vercel.app");

    expect(getPublicAppOrigin()).toBe("");
  });
});
