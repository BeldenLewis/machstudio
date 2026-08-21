import { describe, expect, it } from "vitest";
import {
  normalizeCompetitionConfig,
  normalizeRepeaterSubmission,
  type CompetitionFormField,
} from "@/lib/competition-config";
import { renderFormFieldsHtml } from "@/lib/competition-render";

/**
 * 반복 항목(팀원 등) — 이름·이메일을 여러 명분 차례차례 받는 항목.
 *
 * 세 곳이 서로 어긋나면 안 된다: 어드민에서 서브필드를 정의하는 값(config), 실제로
 * 신청자가 보는 화면(render), 제출을 검증하는 로직(normalizeRepeaterSubmission).
 */
const repeaterField: CompetitionFormField = {
  id: "f-team", key: "members", label: "팀원", type: "repeater",
  placeholder: "", required: true, enabled: true, options: [], system: false,
  subFields: [
    { key: "name", label: "이름", type: "text", required: true },
    { key: "email", label: "이메일", type: "email", required: true },
  ],
  minItems: 1,
  maxItems: 3,
};

describe("반복 항목 — 설정 정규화", () => {
  it("저장된 서브필드·최소·최대를 그대로 유지한다", () => {
    const config = normalizeCompetitionConfig(
      { form: { fields: [repeaterField] } },
      { includeDisabled: true },
    );
    const field = config.form.fields[0];
    expect(field.type).toBe("repeater");
    expect(field.subFields).toEqual(repeaterField.subFields);
    expect(field.minItems).toBe(1);
    expect(field.maxItems).toBe(3);
  });

  it("서브필드가 비어 있으면 이름·이메일 기본값으로 떨어진다 — 빈 반복 항목은 아무것도 못 받는다", () => {
    const config = normalizeCompetitionConfig(
      { form: { fields: [{ ...repeaterField, subFields: [] }] } },
      { includeDisabled: true },
    );
    expect(config.form.fields[0].subFields?.length).toBeGreaterThan(0);
  });
});

describe("반복 항목 — 공개 폼 렌더", () => {
  it("최소 행 수만큼 미리 그리고, 서브필드 라벨이 들어간다", () => {
    const config = normalizeCompetitionConfig(
      { form: { fields: [repeaterField] } },
      { includeDisabled: true },
    );
    const html = renderFormFieldsHtml(config);
    expect((html.match(/class="mc-rep-row"/g) ?? []).length).toBe(2); // 초기 행 1개 + template 안 1개
    expect(html).toContain('data-mc-rep-field="name"');
    expect(html).toContain('data-mc-rep-field="email"');
    expect(html).toContain('data-mc-rep-max="3"');
    expect(html).toContain("추가"); // 기본 언어(ko)의 "+ 추가" 버튼 문구
  });
});

describe("반복 항목 — 제출 검증(normalizeRepeaterSubmission)", () => {
  it("정상 제출 — 두 행 다 통과", () => {
    const result = normalizeRepeaterSubmission(repeaterField, [
      { name: "홍길동", email: "a@b.com" },
      { name: "김철수", email: "c@d.com" },
    ]);
    expect("items" in result && result.items).toEqual([
      { name: "홍길동", email: "a@b.com" },
      { name: "김철수", email: "c@d.com" },
    ]);
  });

  it("필수 서브필드가 빈 행이 있으면(채우다 만 흔적) 오류를 낸다", () => {
    const result = normalizeRepeaterSubmission(repeaterField, [{ name: "홍길동", email: "" }]);
    expect("errorLabel" in result).toBe(true);
  });

  it("최소 행 수를 넘는 완전히 빈 보너스 행은 조용히 버린다", () => {
    const result = normalizeRepeaterSubmission(repeaterField, [
      { name: "홍길동", email: "a@b.com" },
      { name: "", email: "" },
    ]);
    expect("items" in result && result.items).toEqual([{ name: "홍길동", email: "a@b.com" }]);
  });

  it("필수인데 행이 하나도 없으면 오류", () => {
    const result = normalizeRepeaterSubmission(repeaterField, []);
    expect("errorLabel" in result).toBe(true);
  });

  it("필수가 아니면 행이 없어도 통과 — 빈 배열", () => {
    const result = normalizeRepeaterSubmission({ ...repeaterField, required: false }, []);
    expect("items" in result && result.items).toEqual([]);
  });
});
