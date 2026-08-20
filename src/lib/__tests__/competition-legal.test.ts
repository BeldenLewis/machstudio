import { describe, expect, it } from "vitest";
import { normalizeCompetitionConfig } from "@/lib/competition-config";
import { renderFormFieldsHtml } from "@/lib/competition-render";

/**
 * 대회 신청 폼의 제3자 제공 동의 + legal 빈칸 정규화.
 *
 * privacy·marketing 과 달리 제3자 제공은 **꺼져 있을 수 있다**(모든 대회가 협찬사와 정보를
 * 나누는 게 아니다) — 그래서 enabled 스위치가 렌더링을 직접 gating 하는지가 핵심이다.
 */
describe("대회 — 제3자 제공 동의", () => {
  it("기본은 꺼짐 — 체크박스가 렌더되지 않는다", () => {
    const config = normalizeCompetitionConfig({});
    expect(config.form.thirdPartyEnabled).toBe(false);
    const html = renderFormFieldsHtml(config);
    expect(html).not.toContain("data-mc-third-party");
  });

  it("켜면 체크박스가 렌더된다", () => {
    const config = normalizeCompetitionConfig({ form: { thirdPartyEnabled: true, thirdPartyText: "제3자 제공 동의" } });
    expect(config.form.thirdPartyEnabled).toBe(true);
    const html = renderFormFieldsHtml(config);
    expect(html).toContain("data-mc-third-party");
    expect(html).toContain("제3자 제공 동의");
  });

  it("전문(body) 이 있어야만 '자세히' 팝업 링크가 붙는다 — privacy·marketing 과 같은 규칙", () => {
    const withoutBody = normalizeCompetitionConfig({ form: { thirdPartyEnabled: true } });
    expect(renderFormFieldsHtml(withoutBody)).not.toContain('data-mc-terms="third-party"');

    const withBody = normalizeCompetitionConfig({ form: { thirdPartyEnabled: true, thirdPartyBody: "전문 내용" } });
    expect(renderFormFieldsHtml(withBody)).toContain('data-mc-terms="third-party"');
  });

  it("사전 체크는 명시적 true 일 때만 — 마케팅과 같은 규칙", () => {
    expect(normalizeCompetitionConfig({}).form.thirdPartyDefaultChecked).toBe(false);
    expect(normalizeCompetitionConfig({ form: { thirdPartyDefaultChecked: "yes" } }).form.thirdPartyDefaultChecked).toBe(false);
    expect(normalizeCompetitionConfig({ form: { thirdPartyDefaultChecked: true } }).form.thirdPartyDefaultChecked).toBe(true);
  });
});

describe("대회 — legal 빈칸", () => {
  it("country 는 지원 국가만 통과하고 모르는 값은 US 로 — 화면이 비면 안 된다", () => {
    expect(normalizeCompetitionConfig({}).legal.country).toBe("us");
    expect(normalizeCompetitionConfig({ legal: { country: "kr" } }).legal.country).toBe("kr");
    expect(normalizeCompetitionConfig({ legal: { country: "de" } }).legal.country).toBe("us");
  });

  it("eventDates 는 YYYY-MM-DD 모양만 통과한다", () => {
    const config = normalizeCompetitionConfig({ legal: { eventDates: ["2026-10-22", "언젠가", "2026-10-24"] } });
    expect(config.legal.eventDates).toEqual(["2026-10-22", "2026-10-24"]);
  });

  it("thirdParties 는 이름 없는 항목을 거른다", () => {
    const config = normalizeCompetitionConfig({
      legal: { thirdParties: [{ name: "Sponsor Co.", purpose: "경품" }, { name: "", purpose: "이름 없음" }] },
    });
    expect(config.legal.thirdParties).toEqual([{ name: "Sponsor Co.", purpose: "경품" }]);
  });
});
