import { describe, it, expect } from "vitest";
import { resolveConsentBody, consentSourceLabel } from "@/lib/consent-template";

describe("resolveConsentBody — 웨비나 값이 워크스페이스 템플릿을 덮는다", () => {
  it("웨비나 값이 있으면 그것이 이긴다", () => {
    expect(resolveConsentBody("웨비나 전용 전문", "공통 템플릿")).toEqual({
      body: "웨비나 전용 전문", source: "webinar",
    });
  });

  it("웨비나 값이 비면 템플릿을 물려받는다", () => {
    expect(resolveConsentBody("", "공통 템플릿")).toEqual({ body: "공통 템플릿", source: "workspace" });
  });

  it("둘 다 없으면 없음 — 팝업을 띄우지 않는다", () => {
    expect(resolveConsentBody("", "")).toEqual({ body: "", source: "none" });
  });

  /**
   * 이 케이스가 마이그레이션 없이 기존 값을 살리는 근거다 —
   * 지금까지 각 웨비나에 넣어 둔 전문은 전부 '오버라이드' 로 재해석돼 그대로 동작한다.
   */
  it("템플릿이 아직 없어도(null) 기존 웨비나 값은 그대로 쓰인다", () => {
    expect(resolveConsentBody("기존에 붙여넣은 전문", null)).toEqual({
      body: "기존에 붙여넣은 전문", source: "webinar",
    });
    expect(resolveConsentBody("기존에 붙여넣은 전문", undefined).source).toBe("webinar");
  });

  it("공백만 있는 값은 없는 것으로 본다 — 저장·렌더와 같은 trim 기준", () => {
    // 기준이 어긋나면 "화면엔 상속이라 나오는데 실제로는 공백이 덮는" 상태가 생긴다.
    expect(resolveConsentBody("   \n  ", "공통 템플릿")).toEqual({ body: "공통 템플릿", source: "workspace" });
    expect(resolveConsentBody(null, "  ")).toEqual({ body: "", source: "none" });
  });

  it("줄바꿈은 보존한다 — 약관은 문단 구조가 의미다", () => {
    const body = "제1조 목적\n\n제2조 수집 항목";
    expect(resolveConsentBody(body, null).body).toBe(body);
  });

  it("앞뒤 공백만 정리하고 내부는 손대지 않는다", () => {
    expect(resolveConsentBody("  제1조  목적  ", null).body).toBe("제1조  목적");
  });

  it("null·undefined 조합 전부 안전하다", () => {
    for (const a of [null, undefined, ""]) {
      for (const b of [null, undefined, ""]) {
        expect(resolveConsentBody(a, b)).toEqual({ body: "", source: "none" });
      }
    }
  });
});

describe("consentSourceLabel", () => {
  it("출처를 사람이 읽는 말로", () => {
    expect(consentSourceLabel("webinar")).toBe("이 웨비나 전용");
    expect(consentSourceLabel("workspace")).toBe("워크스페이스 공통");
    expect(consentSourceLabel("none")).toBe("설정 안 함");
  });
});
