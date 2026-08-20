import { describe, expect, it } from "vitest";
import { normalizeCompetitionConfig } from "@/lib/competition-config";
import { renderFormFieldsHtml } from "@/lib/competition-render";
import { roundDisplayName } from "@/lib/notice/build-model";
import { noticeStrings } from "@/lib/notice/strings";

/**
 * 대회 신청 폼의 전화 항목 — 사전등록과 같은 계약(국가 선택 + E.164, 설계 §6.3).
 * 실제 파싱 규칙(toE164)은 collect-phone.test.ts 가 이미 전수로 지킨다 — 여기서는
 * "Competition 렌더러가 그 계약을 실제로 쓰고 있는가"만 본다.
 */
describe("대회 — 전화 항목 국가 선택", () => {
  it("defaultCountry 는 모양만 보고 정규화한다 — 모르는 값은 US", () => {
    expect(normalizeCompetitionConfig({}).form.defaultCountry).toBe("US");
    expect(normalizeCompetitionConfig({ form: { defaultCountry: "kr" } }).form.defaultCountry).toBe("KR");
    expect(normalizeCompetitionConfig({ form: { defaultCountry: "1" } }).form.defaultCountry).toBe("US");
  });

  it("tel 필드는 국가 선택 select + tel input 이 함께 렌더된다", () => {
    const config = normalizeCompetitionConfig({
      form: { fields: [{ key: "phone", label: "연락처", type: "tel", enabled: true, required: true, options: [] }] },
    });
    const html = renderFormFieldsHtml(config);
    expect(html).toContain('data-mc-cc="phone"');
    expect(html).toContain('data-mc-key="phone"');
    expect(html).toContain('type="tel"');
    expect(html).toContain("mc-tel-cc");
  });

  it("기본 국가가 selected 로 미리 선택돼 있다", () => {
    const config = normalizeCompetitionConfig({
      form: {
        defaultCountry: "KR",
        fields: [{ key: "phone", label: "연락처", type: "tel", enabled: true, required: true, options: [] }],
      },
    });
    const html = renderFormFieldsHtml(config);
    expect(html).toContain('<option value="KR" selected>');
  });
});

/** 대회 투표 화면의 라운드 이름 — 공고와 같은 규칙(§notice/build-model.ts). */
describe("대회 — 투표 화면 라운드 이름 언어", () => {
  it("기본 이름(예선/본선)이면 언어를 따른다", () => {
    expect(roundDisplayName({ kind: "prelim", name: "예선" }, noticeStrings("en"))).toBe("Preliminary");
    expect(roundDisplayName({ kind: "final", name: "본선" }, noticeStrings("ja"))).toBe("本選");
  });

  it("운영자가 한 번이라도 바꾼 이름은 그대로 — 운영자의 글이라 번역하지 않는다", () => {
    expect(roundDisplayName({ kind: "prelim", name: "1차 예선" }, noticeStrings("en"))).toBe("1차 예선");
  });
});
