import { describe, expect, it } from "vitest";
import { EXPO_LIMITS } from "@/lib/expo/registry";
import { validatePageDraft, validateTemplateSnapshot } from "@/lib/expo/request";
import { normalizeExpoPage } from "@/lib/expo/config";

/**
 * **자르기와 거절의 차이.**
 *
 * 정규화는 이미 저장된 값에 대한 방어라 조용히 자른다. 새 쓰기는 거절해야 한다 —
 * 운영자가 입력한 문장을 말없이 잘라 저장하면 저장은 성공했다고 뜨는데 화면에는 잘린 글이
 * 남는다. 그건 "저장이 안 됐다" 보다 알아채기 어렵다.
 */

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const draft = (sections: unknown[]) => ({ sections });

describe("정상 입력은 통과한다", () => {
  it("보통의 페이지", () => {
    const r = validatePageDraft(draft([
      { sid: uid(1), type: "kv", variant: "column", content: { title: "제목" } },
      { sid: uid(2), type: "textblock", variant: "prose", content: { body: "본문\n둘째 줄" } },
    ]));
    expect(r.ok).toBe(true);
  });

  it("빈 페이지도 통과 — 저장은 되고, 발행이 막힐 뿐이다", () => {
    expect(validatePageDraft(draft([])).ok).toBe(true);
  });
});

describe("넘치면 자르지 않고 거절한다", () => {
  it("텍스트가 길면 어느 칸인지 알려 준다", () => {
    const r = validatePageDraft(draft([
      { sid: uid(1), type: "kv", variant: "column", content: { title: "가".repeat(EXPO_LIMITS.textChars + 1) } },
    ]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0].path).toBe("sections[0].content.title");
      expect(r.errors[0].code).toBe("too-long");
      // 문구에 실제 글자 수가 들어가야 운영자가 얼마나 줄일지 안다.
      expect(r.errors[0].message).toContain(String(EXPO_LIMITS.textChars));
    }
  });

  /** 한 언어만 넘쳐도 거절이다 — 다국어 맵의 최댓값을 본다. */
  it("로케일 맵의 한 언어만 넘쳐도 거절한다", () => {
    const r = validatePageDraft(draft([
      { sid: uid(1), type: "kv", variant: "column",
        content: { title: { ko: "짧음", en: "x".repeat(EXPO_LIMITS.textChars + 1) } } },
    ]));
    expect(r.ok).toBe(false);
  });

  it("커스텀 코드가 크면 거절한다", () => {
    const r = validatePageDraft(draft([
      { sid: uid(1), type: "custom-code", variant: "boxed", content: { code: "x".repeat(EXPO_LIMITS.longTextBytes + 1) } },
    ]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].path).toBe("sections[0].content.code");
  });

  it("리스트 행이 많으면 몇 개인지 말해 준다", () => {
    const rows = Array.from({ length: EXPO_LIMITS.rowsPerList + 3 }, (_, i) => ({ title: `카드 ${i}` }));
    const r = validatePageDraft(draft([{ sid: uid(1), type: "cardgrid", variant: "multicolumn", content: { items: rows } }]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].message).toContain(String(rows.length));
  });

  it("리스트 안쪽 칸도 검사한다", () => {
    const r = validatePageDraft(draft([{
      sid: uid(1), type: "cardgrid", variant: "multicolumn",
      content: { items: [{ title: "정상" }, { title: "가".repeat(EXPO_LIMITS.textChars + 1) }] },
    }]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].path).toBe("sections[0].content.items[1].title");
  });

  it("구획 수가 많으면 거절한다", () => {
    const many = Array.from({ length: EXPO_LIMITS.sectionsPerPage + 1 }, (_, i) => ({
      sid: uid(i + 1), type: "textblock", variant: "prose", content: { body: "본문" },
    }));
    const r = validatePageDraft(draft(many));
    expect(r.ok).toBe(false);
    // 편집기의 개수 경고("한 페이지에 구획은 N개까지예요")와 같은 말을 써야 한다.
    if (!r.ok) expect(r.errors[0].message).toContain("한 페이지에 구획은");
  });

  it("모르는 구획 타입은 거절한다 — 쓰기에서는 조용히 버리지 않는다", () => {
    const r = validatePageDraft(draft([{ sid: uid(1), type: "정체불명", variant: "x" }]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe("unknown-type");
    if (!r.ok) expect(r.errors[0].message).not.toContain("섹션");
  });

  it("모양이 아니면 거절한다", () => {
    for (const bad of [null, undefined, "x", 3, { sections: "x" }]) {
      expect(validatePageDraft(bad).ok).toBe(false);
    }
  });
});

describe("정규화와의 역할 분담", () => {
  /**
   * 같은 값을 정규화에 넣으면 **자른다**. 이 대비가 이 모듈이 따로 있는 이유다.
   */
  it("쓰기는 거절하지만 읽기 정규화는 자른다", () => {
    const long = "가".repeat(EXPO_LIMITS.textChars + 50);
    const payload = draft([{ sid: uid(1), type: "kv", variant: "column", content: { title: long } }]);

    expect(validatePageDraft(payload).ok).toBe(false);       // 새 쓰기는 막고

    const normalized = normalizeExpoPage(payload);            // 이미 저장된 값은 살린다
    expect((normalized.sections[0].content.title as Record<string, string>).en.length)
      .toBe(EXPO_LIMITS.textChars);
  });
});

describe("템플릿 스냅샷", () => {
  it("보통 크기는 통과", () => {
    expect(validateTemplateSnapshot({ version: 1, pages: [] }).ok).toBe(true);
  });

  it("너무 크면 거절한다", () => {
    const huge = { version: 1, pages: [{ blob: "x".repeat(EXPO_LIMITS.templateSnapshotBytes + 10) }] };
    const r = validateTemplateSnapshot(huge);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe("too-large");
  });
});
