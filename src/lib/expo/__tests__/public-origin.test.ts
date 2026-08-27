// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expoOriginMessage, getRequiredExpoPublicOrigin, type ExpoOriginFailure } from "@/lib/expo/origin";

/**
 * 임베드에 박히는 절대 주소.
 *
 * 여기서 나온 주소는 **파트너 사이트의 HTML 에 들어가 우리가 회수할 수 없다.**
 * 프리뷰 배포에서 한 번 복사된 주소는 그 배포가 사라진 뒤에도 남아 전시 홈페이지를
 * 조용히 죽인다. 그래서 통과 조건이 좁고, 실패는 빈 문자열로 덮지 않는다.
 */

const CANONICAL = "https://machstudio.example.com";

const reason = (): ExpoOriginFailure | null => {
  const result = getRequiredExpoPublicOrigin();
  return result.ok ? null : result.reason;
};

beforeEach(() => {
  vi.stubEnv("EXPO_CANONICAL_PUBLIC_ORIGIN", CANONICAL);
  vi.stubEnv("NEXT_PUBLIC_CANONICAL_APP_URL", CANONICAL);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("VERCEL_URL", "");
  vi.stubEnv("VERCEL_BRANCH_URL", "");
});

afterEach(() => { vi.unstubAllEnvs(); });

describe("통과하는 경우", () => {
  it("선언한 주소와 배포 주소가 같으면 그 오리진을 준다", () => {
    expect(getRequiredExpoPublicOrigin()).toEqual({ ok: true, origin: CANONICAL });
  });

  it("프로덕션 배포에서 통과한다", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_URL", "machstudio-abc123.vercel.app");
    expect(getRequiredExpoPublicOrigin()).toEqual({ ok: true, origin: CANONICAL });
  });

  it("끝의 슬래시는 오리진으로 정규화한다", () => {
    vi.stubEnv("EXPO_CANONICAL_PUBLIC_ORIGIN", `${CANONICAL}/`);
    expect(getRequiredExpoPublicOrigin()).toEqual({ ok: true, origin: CANONICAL });
  });
});

describe("막는 경우", () => {
  it("설정이 없으면 이유를 말한다 — 빈 문자열로 덮지 않는다", () => {
    vi.stubEnv("EXPO_CANONICAL_PUBLIC_ORIGIN", "");
    expect(reason()).toBe("not-configured");
    vi.stubEnv("EXPO_CANONICAL_PUBLIC_ORIGIN", "   ");
    expect(reason()).toBe("not-configured");
  });

  it("http·자격증명은 거절한다", () => {
    vi.stubEnv("EXPO_CANONICAL_PUBLIC_ORIGIN", "http://machstudio.example.com");
    expect(reason()).toBe("insecure");
    vi.stubEnv("EXPO_CANONICAL_PUBLIC_ORIGIN", "https://u:p@machstudio.example.com");
    expect(reason()).toBe("insecure");
  });

  /** 경로가 붙은 주소를 오리진으로 쓰면 폰트·로더 주소가 전부 어긋난다. */
  it("경로·쿼리·해시가 붙으면 거절한다", () => {
    for (const bad of [`${CANONICAL}/app`, `${CANONICAL}/?a=1`, `${CANONICAL}/#x`, "machstudio.example.com"]) {
      vi.stubEnv("EXPO_CANONICAL_PUBLIC_ORIGIN", bad);
      expect(`${bad}: ${reason()}`).toBe(`${bad}: not-origin`);
    }
  });

  /** 프리뷰 배포가 임베드 코드를 만들면 그 배포가 사라진 뒤 코드가 죽는다. */
  it("프리뷰·개발 배포에서는 만들지 않는다", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(reason()).toBe("not-production");
    vi.stubEnv("VERCEL_ENV", "development");
    expect(reason()).toBe("not-production");
  });

  /** 배포마다 새로 붙는 호스트는 고정 주소가 아니다. */
  it("배포 전용 호스트를 선언해도 거절한다", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("EXPO_CANONICAL_PUBLIC_ORIGIN", "https://machstudio-abc123.vercel.app");
    vi.stubEnv("NEXT_PUBLIC_CANONICAL_APP_URL", "https://machstudio-abc123.vercel.app");
    vi.stubEnv("VERCEL_URL", "machstudio-abc123.vercel.app");
    expect(reason()).toBe("deployment-host");

    vi.stubEnv("VERCEL_URL", "");
    vi.stubEnv("VERCEL_BRANCH_URL", "machstudio-abc123.vercel.app");
    expect(reason()).toBe("deployment-host");
  });

  /** 두 설정이 갈라지면 홈페이지 코드와 사전등록 코드가 서로 다른 곳을 가리킨다. */
  it("배포가 밖에 쓰는 주소와 다르면 거절한다", () => {
    vi.stubEnv("NEXT_PUBLIC_CANONICAL_APP_URL", "https://other.example.com");
    expect(reason()).toBe("not-canonical");
  });

  it("배포 쪽 주소가 아예 없어도 거절한다", () => {
    vi.stubEnv("NEXT_PUBLIC_CANONICAL_APP_URL", "");
    expect(reason()).toBe("not-canonical");
  });
});

describe("잘못 부른 자리", () => {
  /**
   * 브라우저에서는 이 환경변수가 없어 조용히 "설정 안 됨" 이 된다. 그건 사실이 아니라
   * **부른 자리가 틀린 것**이라, 조용히 넘기면 원인을 못 찾는다.
   */
  it("브라우저에서 부르면 던진다", () => {
    (globalThis as { window?: unknown }).window = {};
    try {
      expect(() => getRequiredExpoPublicOrigin()).toThrow(/서버에서만/);
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });
});

describe("문구", () => {
  it("모든 실패 사유에 사람이 읽을 문장이 있다", () => {
    const all: ExpoOriginFailure[] = [
      "not-configured", "insecure", "not-origin", "not-production", "deployment-host", "not-canonical",
    ];
    for (const code of all) {
      const message = expoOriginMessage(code);
      expect(`${code}: ${message.trim() !== ""}`).toBe(`${code}: true`);
      expect(message).not.toMatch(/undefined|null|Error/);
    }
  });
});
