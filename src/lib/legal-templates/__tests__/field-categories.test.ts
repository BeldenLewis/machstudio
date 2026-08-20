import { describe, expect, it } from "vitest";
import { inferDataCategories } from "@/lib/legal-templates/field-categories";
import type { InferableField } from "@/lib/legal-templates/types";

describe("inferDataCategories", () => {
  it("타입만으로 확정되는 카테고리", () => {
    const fields: InferableField[] = [
      { key: "email", type: "email" },
      { key: "phone", type: "tel" },
      { key: "images", type: "image" },
      { key: "videoUrl", type: "youtube" },
    ];
    expect(inferDataCategories(fields)).toEqual(["email", "phone", "photo", "video"]);
  });

  it.each([
    ["companyName", "text", "company"],
    ["organization", "text", "company"],
    ["jobTitle", "text", "jobTitle"],
    ["position", "text", "jobTitle"],
    ["address", "text", "address"],
    ["mailingAddress", "text", "address"],
    ["name", "text", "name"],
    ["contactName", "text", "name"],
  ] as const)("키워드 필드 %s(%s) → %s", (key, type, expected) => {
    expect(inferDataCategories([{ key, type }])).toEqual([expected]);
  });

  it("label 로도 키워드를 잡는다 (key 는 영문, label 은 한국어인 경우)", () => {
    expect(inferDataCategories([{ key: "q1", type: "text", label: "회사명" }])).toEqual(["company"]);
    expect(inferDataCategories([{ key: "q2", type: "text", label: "주소" }])).toEqual(["address"]);
  });

  it("애매한 text 필드는 otherText 로 — 잘못 단정하지 않는다", () => {
    expect(inferDataCategories([{ key: "notes", type: "text", label: "하고 싶은 말" }])).toEqual(["otherText"]);
  });

  it("checkbox 는 수집 항목 목록에서 제외한다", () => {
    expect(inferDataCategories([{ key: "agree", type: "checkbox" }])).toEqual([]);
  });

  it("같은 카테고리가 중복으로 잡히면 한 번만 남긴다", () => {
    const fields: InferableField[] = [
      { key: "email", type: "email" },
      { key: "email2", type: "email" },
    ];
    expect(inferDataCategories(fields)).toEqual(["email"]);
  });

  it("CompetitionFormField 모양(추가 속성 포함)도 그대로 받는다 — 덕 타이핑", () => {
    const competitionField = {
      id: "f-image",
      key: "images",
      label: "Team image",
      type: "image",
      placeholder: "",
      required: false,
      enabled: true,
      options: [],
      maxFiles: 3,
    };
    expect(inferDataCategories([competitionField])).toEqual(["photo"]);
  });

  it("빈 배열이면 빈 배열", () => {
    expect(inferDataCategories([])).toEqual([]);
  });
});
