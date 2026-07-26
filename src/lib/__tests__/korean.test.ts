import { describe, it, expect } from "vitest";
import { hasFinalConsonant, objectParticle, subjectParticle, topicParticle, withParticle } from "@/lib/korean";

describe("hasFinalConsonant", () => {
  it("받침 있는 글자", () => {
    for (const w of ["질문", "프로그램", "세션", "문항", "각", "값"]) expect(hasFinalConsonant(w)).toBe(true);
  });

  it("받침 없는 글자", () => {
    for (const w of ["단계", "자료", "하이라이트", "필드", "선택지", "가", "누"]) expect(hasFinalConsonant(w)).toBe(false);
  });

  it("한글이 아니면 null — 호출자가 기본값을 고른다", () => {
    for (const w of ["URL", "CSV", "123", "", "!"]) expect(hasFinalConsonant(w)).toBeNull();
  });

  it("뒤 공백은 무시한다", () => {
    expect(hasFinalConsonant("자료 ")).toBe(false);
    expect(hasFinalConsonant("질문  ")).toBe(true);
  });
});

describe("objectParticle — EditableList 삭제 토스트가 쓰는 것", () => {
  it("실제 itemNoun 전부", () => {
    // 예전엔 `${itemNoun}을` 하드코딩이라 "단계을 삭제했어요" 처럼 틀렸다.
    expect(objectParticle("단계")).toBe("단계를");
    expect(objectParticle("자료")).toBe("자료를");
    expect(objectParticle("하이라이트")).toBe("하이라이트를");
    expect(objectParticle("선택지")).toBe("선택지를");
    expect(objectParticle("필드")).toBe("필드를");
    expect(objectParticle("CTA 카드")).toBe("CTA 카드를");

    expect(objectParticle("질문")).toBe("질문을");
    expect(objectParticle("프로그램")).toBe("프로그램을");
    expect(objectParticle("세션")).toBe("세션을");
    expect(objectParticle("문항")).toBe("문항을");
  });

  it("영문·약어는 받침 있는 쪽", () => {
    expect(objectParticle("URL")).toBe("URL을");
  });
});

describe("나머지 조사", () => {
  it("이/가", () => {
    expect(subjectParticle("질문")).toBe("질문이");
    expect(subjectParticle("단계")).toBe("단계가");
  });
  it("은/는", () => {
    expect(topicParticle("질문")).toBe("질문은");
    expect(topicParticle("단계")).toBe("단계는");
  });
  it("과/와", () => {
    expect(withParticle("질문")).toBe("질문과");
    expect(withParticle("단계")).toBe("단계와");
  });
});
