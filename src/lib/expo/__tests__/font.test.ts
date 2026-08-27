// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { ensureExpoFont, EXPO_FONT_REGISTRY_KEY, resetExpoFontRegistry } from "@/lib/expo/font";
import { EXPO_FONT_FAMILY, EXPO_FONT_PATH } from "@/lib/expo/css";

/**
 * 서체 등록.
 *
 * 한 페이지에 우리 섹션이 여러 개 박히고 각각은 **따로 번들된 IIFE** 가 실행한다.
 * 창에 매달지 않으면 같은 폰트를 섹션 수만큼 받는다. 그리고 실패해도 화면은 나와야 한다 —
 * 폰트를 기다리느라 콘텐츠를 숨기면 파트너 사이트에서 우리 영역만 영영 빈 채로 남는다.
 */

const ORIGIN = "https://machstudio.example.com";

interface FakeHost {
  FontFace?: unknown;
  document?: unknown;
  [key: string]: unknown;
}

function fakeHost(options: { fail?: boolean; hang?: boolean } = {}) {
  const added: Array<{ family: string; source: string }> = [];
  const created: Array<{ family: string; source: string; descriptors: unknown }> = [];

  class FakeFontFace {
    constructor(public family: string, public source: string, public descriptors: unknown) {
      created.push({ family, source, descriptors });
    }
    load() {
      if (options.hang) return new Promise(() => {});
      if (options.fail) return Promise.reject(new Error("404"));
      return Promise.resolve(this);
    }
  }

  const host: FakeHost = {
    FontFace: FakeFontFace,
    document: { fonts: { add: (face: { family: string; source: string }) => added.push(face) } },
  };
  return { host, added, created };
}

describe("등록에 성공하면", () => {
  it("가변 굵기 범위와 우리 절대 주소로 등록한다", async () => {
    const { host, added, created } = fakeHost();
    expect(await ensureExpoFont(ORIGIN, { host: host as never })).toBe("ready");

    expect(created[0].family).toBe(EXPO_FONT_FAMILY);
    expect(created[0].source).toBe(`url(${ORIGIN}${EXPO_FONT_PATH}) format("woff2")`);
    expect(created[0].descriptors).toMatchObject({ weight: "400 900", display: "swap" });
    expect(added).toHaveLength(1);
  });

  /** `local()` 은 파트너 기기에 있는 **다른** 폰트를 집어 온다. */
  it("local() 도 CDN 도 쓰지 않는다", async () => {
    const { host, created } = fakeHost();
    await ensureExpoFont(ORIGIN, { host: host as never });
    expect(created[0].source).not.toContain("local(");
    expect(created[0].source).toContain(ORIGIN);
  });

  /** 섹션이 다섯 개면 요청도 다섯 번이 된다 — 창에 매달아 한 번으로 만든다. */
  it("여러 번 불러도 한 번만 받는다", async () => {
    const { host, created } = fakeHost();
    const results = await Promise.all([
      ensureExpoFont(ORIGIN, { host: host as never }),
      ensureExpoFont(ORIGIN, { host: host as never }),
      ensureExpoFont(ORIGIN, { host: host as never }),
    ]);
    expect(results).toEqual(["ready", "ready", "ready"]);
    expect(created).toHaveLength(1);
    expect(host[EXPO_FONT_REGISTRY_KEY]).toBeDefined();
  });
});

describe("실패해도 화면은 나온다", () => {
  it("못 받으면 failed 로 답한다 — 던지지 않는다", async () => {
    const { host, added } = fakeHost({ fail: true });
    expect(await ensureExpoFont(ORIGIN, { host: host as never })).toBe("failed");
    expect(added).toEqual([]);
  });

  /** 네트워크가 멎어도 화면이 멎으면 안 된다. */
  it("시간이 지나면 기다리지 않는다", async () => {
    vi.useFakeTimers();
    try {
      const { host, added } = fakeHost({ hang: true });
      const pending = ensureExpoFont(ORIGIN, { host: host as never, timeoutMs: 100 });
      await vi.advanceTimersByTimeAsync(150);
      expect(await pending).toBe("failed");
      // 늦게 도착해도 등록하지 않는다.
      expect(added).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  /** 실패를 캐시하지 않으면 같은 요청이 섹션 수만큼 다시 날아간다. */
  it("실패한 결과도 재사용한다", async () => {
    const { host, created } = fakeHost({ fail: true });
    await ensureExpoFont(ORIGIN, { host: host as never });
    await ensureExpoFont(ORIGIN, { host: host as never });
    expect(created).toHaveLength(1);
  });

  it("FontFace API 가 없으면 unsupported 로 답한다", async () => {
    expect(await ensureExpoFont(ORIGIN, { host: {} as never })).toBe("unsupported");
    expect(await ensureExpoFont(ORIGIN, { host: { FontFace: class {} } as never })).toBe("unsupported");
  });
});

describe("주소를 지어내지 않는다", () => {
  /** 상대주소를 받으면 파트너 사이트에서 **그쪽 도메인**의 폰트를 찾는다 — 404 다. */
  it("절대 http(s) 가 아니면 아무것도 받지 않는다", async () => {
    for (const bad of ["", "/", "//cdn.example.com", "machstudio.example.com", "javascript:alert(1)"]) {
      const { host, created } = fakeHost();
      expect(`${bad}: ${await ensureExpoFont(bad, { host: host as never })}`).toBe(`${bad}: bad-origin`);
      expect(created).toEqual([]);
    }
  });
});

describe("초기화", () => {
  it("레지스트리를 비우면 다시 받는다", async () => {
    const { host, created } = fakeHost();
    await ensureExpoFont(ORIGIN, { host: host as never });
    resetExpoFontRegistry(host as never);
    await ensureExpoFont(ORIGIN, { host: host as never });
    expect(created).toHaveLength(2);
  });
});
