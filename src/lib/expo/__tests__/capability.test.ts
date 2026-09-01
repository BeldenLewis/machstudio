import { describe, expect, it, vi } from "vitest";
import { deriveExpoCapabilities, EXPO_SCHEMA_CAPABILITY_VERSION } from "@/lib/expo/capability";

/**
 * 홈페이지 기능의 **fail-closed 게이트**.
 *
 * ── 왜 필요한가 ───────────────────────────────────────────────────────
 * 스키마(ExpoSite/ExpoPage/ExpoTemplate)는 코드보다 **나중에** 프로덕션에 들어간다.
 * main 은 자동 배포이므로, 테이블이 없는 순간에 코드가 먼저 나가면 어드민 화면이 500 으로
 * 깨진다. 그래서 "테이블이 준비됐다고 확인되기 전에는 메뉴조차 나타나지 않는다".
 *
 * 그리고 공개 임베드(/h/)는 **별도 플래그**다. 스키마가 준비되고 어드민이 열려도,
 * 사용자가 공개를 승인하기 전까지 바깥으로는 한 글자도 나가지 않는다.
 *
 * ── 왜 순수 함수로 떼어 놓나 ──────────────────────────────────────────
 * 판정 규칙 자체는 DB·캐시·환경변수 없이 표로 검사할 수 있어야 한다. 오케스트레이션
 * (카탈로그 조회·캐시)은 그 위에 얹는다.
 */

describe("deriveExpoCapabilities — 판정 표", () => {
  const V = EXPO_SCHEMA_CAPABILITY_VERSION;

  it("리비전 스키마 전의 플래그는 준비 조회가 성공해도 닫힌다", () => {
    expect(deriveExpoCapabilities({
      schemaFlag: "20260821-v1",
      publicFlag: "on",
      schemaProbeReady: true,
    })).toEqual({ admin: false, preview: false, publicEmbed: false });
  });

  it("전부 갖춰야 공개 임베드까지 열린다", () => {
    expect(deriveExpoCapabilities({ schemaFlag: V, publicFlag: "on", schemaProbeReady: true }))
      .toEqual({ admin: true, preview: true, publicEmbed: true });
  });

  /** 스키마가 준비돼도 공개는 별도 승인이다 — 이게 두 플래그를 나눈 이유다. */
  it("공개 플래그가 없으면 어드민만 열린다", () => {
    expect(deriveExpoCapabilities({ schemaFlag: V, publicFlag: undefined, schemaProbeReady: true }))
      .toEqual({ admin: true, preview: true, publicEmbed: false });
    expect(deriveExpoCapabilities({ schemaFlag: V, publicFlag: "off", schemaProbeReady: true }))
      .toEqual({ admin: true, preview: true, publicEmbed: false });
    // "on" 정확히 일치할 때만 — true/1/yes 같은 근사치를 받아 주면 실수로 켜진다.
    for (const near of ["ON", "true", "1", "yes", " on"]) {
      expect(deriveExpoCapabilities({ schemaFlag: V, publicFlag: near, schemaProbeReady: true }).publicEmbed)
        .toBe(false);
    }
  });

  /** 카탈로그 조회가 실패했거나 테이블이 없으면 어드민도 닫힌다. */
  it("스키마 조회가 준비되지 않으면 전부 닫힌다", () => {
    expect(deriveExpoCapabilities({ schemaFlag: V, publicFlag: "on", schemaProbeReady: false }))
      .toEqual({ admin: false, preview: false, publicEmbed: false });
  });

  /**
   * 버전을 **정확히** 요구한다. 다음 스키마 확장이 오면 이 문자열이 바뀌고, 옛 값이 남은
   * 배포는 자동으로 닫힌다 — 부분 적용된 스키마 위에서 코드가 도는 것이 제일 나쁘다.
   */
  it("스키마 플래그가 정확히 일치하지 않으면 닫힌다", () => {
    for (const bad of [undefined, "", "20260821", "20260821-v2", `${V} `, V.toUpperCase()]) {
      expect(deriveExpoCapabilities({ schemaFlag: bad, publicFlag: "on", schemaProbeReady: true }))
        .toEqual({ admin: false, preview: false, publicEmbed: false });
    }
  });

  it("어드민이 닫히면 미리보기도 닫힌다 — 둘은 같은 전제를 쓴다", () => {
    const cases = [
      { schemaFlag: undefined, publicFlag: "on", schemaProbeReady: true },
      { schemaFlag: V, publicFlag: "on", schemaProbeReady: false },
    ];
    for (const c of cases) {
      const got = deriveExpoCapabilities(c);
      expect(got.admin).toBe(got.preview);
      expect(got.admin).toBe(false);
    }
  });
});

describe("getExpoCapabilities — 오케스트레이션", () => {
  /**
   * **플래그가 틀리면 카탈로그를 조회하지 않는다.**
   * 스키마가 없는 배포에서 매 요청 DB 를 두드리면, 이 저장소가 실제로 겪은 커넥션 풀 고갈로
   * 사전등록·라이브가 같이 죽는다(2026-08-11). 게이트는 가장 싼 검사부터 한다.
   */
  it("스키마 플래그가 틀리면 카탈로그를 조회하지 않는다", async () => {
    vi.resetModules();
    vi.stubEnv("EXPO_SCHEMA_CAPABILITY", "wrong-version");
    vi.stubEnv("EXPO_PUBLIC_EMBED_RELEASE", "on");

    const probe = vi.fn(async () => true);
    const { getExpoCapabilities } = await import("@/lib/expo/capability");
    const caps = await getExpoCapabilities({ probe });

    expect(caps).toEqual({ admin: false, preview: false, publicEmbed: false });
    expect(probe).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("플래그가 맞으면 카탈로그 조회 결과를 따른다", async () => {
    vi.resetModules();
    vi.stubEnv("EXPO_SCHEMA_CAPABILITY", EXPO_SCHEMA_CAPABILITY_VERSION);
    vi.stubEnv("EXPO_PUBLIC_EMBED_RELEASE", "");

    const { getExpoCapabilities } = await import("@/lib/expo/capability");
    expect(await getExpoCapabilities({ probe: async () => true }))
      .toEqual({ admin: true, preview: true, publicEmbed: false });
    expect(await getExpoCapabilities({ probe: async () => false }))
      .toEqual({ admin: false, preview: false, publicEmbed: false });
    vi.unstubAllEnvs();
  });

  /**
   * 조회가 던지면 **닫힌 채로** 답한다. 예외가 밖으로 새면 어드민 화면이 500 이 되는데,
   * 그건 "아직 준비 안 됨" 을 보여주는 것보다 나쁘다.
   */
  it("카탈로그 조회가 던져도 500 이 아니라 닫힘으로 답한다", async () => {
    vi.resetModules();
    vi.stubEnv("EXPO_SCHEMA_CAPABILITY", EXPO_SCHEMA_CAPABILITY_VERSION);
    vi.stubEnv("EXPO_PUBLIC_EMBED_RELEASE", "on");

    const { getExpoCapabilities } = await import("@/lib/expo/capability");
    await expect(getExpoCapabilities({ probe: async () => { throw new Error("relation does not exist"); } }))
      .resolves.toEqual({ admin: false, preview: false, publicEmbed: false });
    vi.unstubAllEnvs();
  });
});

describe("isExpoPublicEmbedReleaseEnabled — 공개 핸들러의 첫 관문", () => {
  /**
   * 공개 라우트는 레이트리밋·카탈로그·모델 작업 **이전에** 이걸 먼저 본다.
   * 순수 함수라 DB 를 건드리지 않고 즉시 거절할 수 있다.
   */
  it("정확히 on 일 때만 true", async () => {
    for (const [value, expected] of [["on", true], ["off", false], ["", false], ["ON", false], ["true", false]] as const) {
      vi.resetModules();
      vi.stubEnv("EXPO_PUBLIC_EMBED_RELEASE", value);
      const { isExpoPublicEmbedReleaseEnabled } = await import("@/lib/expo/capability");
      expect(`${value || "(빈값)"} → ${isExpoPublicEmbedReleaseEnabled()}`).toBe(`${value || "(빈값)"} → ${expected}`);
      vi.unstubAllEnvs();
    }
  });
});
