import { describe, expect, it } from "vitest";
import { buildCollectScripts } from "@/lib/collect-script";

/**
 * 연동형(capture) 수집 스크립트 — 필드 묶음 선택자가 하드코딩된 ".form-group"(아임웹 전용)
 * 이었다가 소스별로 바꿀 수 있게 된 부분을 검증한다. "콘솔에 입력해도 아무것도 안 뜨더라"는
 * 피드백의 원인이었다 — 아임웹이 아닌 사이트는 .form-group 자체가 없다.
 */
function baseInput(overrides: Partial<Parameters<typeof buildCollectScripts>[0]["source"]> = {}) {
  return {
    source: {
      id: "src_1",
      apiKey: "key_1",
      successTrigger: "감사합니다",
      redirectUrl: null,
      ...overrides,
    },
    fieldMappings: [{ index: 0, key: "name", label: "이름" }],
    baseUrl: "https://machstudio.app",
  };
}

describe("buildCollectScripts — 필드 묶음 선택자", () => {
  it("지정하지 않으면 기본값(.form-group, 아임웹 관례)을 쓴다", () => {
    const { script } = buildCollectScripts(baseInput());
    expect(script).toContain('var GROUP_SELECTOR = ".form-group"');
  });

  it("소스에 저장된 선택자를 그대로 스크립트에 심는다", () => {
    const { script } = buildCollectScripts(baseInput({ fieldGroupSelector: "table tr" }));
    expect(script).toContain('var GROUP_SELECTOR = "table tr"');
  });

  it("빈 문자열이면 기본값으로 떨어진다 — 선택자가 비면 필드를 하나도 못 찾는다", () => {
    const { script } = buildCollectScripts(baseInput({ fieldGroupSelector: "" }));
    expect(script).toContain('var GROUP_SELECTOR = ".form-group"');
  });

  it("라벨 추출이 label 뿐 아니라 th 도 본다 — 표 형태 신청서는 th 를 쓴다", () => {
    const { script } = buildCollectScripts(baseInput());
    expect(script).toContain('querySelector("label, th")');
  });

  it("체크박스·라디오 옵션 label 과 필드 제목을 구분한다 — 입력 래퍼가 아닌 형제를 먼저 본다", () => {
    const { script } = buildCollectScripts(baseInput());
    expect(script).toContain(':scope > *:not(.input-area)');
  });

  it("생성된 스크립트가 문법적으로 유효한 JS 다", () => {
    const { script, utmScript } = buildCollectScripts(baseInput());
    expect(() => new Function(utmScript)).not.toThrow();
    expect(() => new Function(script)).not.toThrow();
  });
});
