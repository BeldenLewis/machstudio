import { describe, expect, it } from "vitest";
import { branchOptionValues, reconcileBranchGroups } from "../CollectBranchEditor";
import type { CollectBranch, CollectField } from "@/lib/collect-form-config";

const trigger: CollectField = {
  id: "type", key: "type", label: { en: "Type" }, type: "select", placeholder: {},
  required: true, enabled: true, options: [{ en: "General" }, { en: "Buyer" }, { en: "Press" }],
};

const field = (key: string): CollectField => ({
  id: key, key, label: { en: key }, type: "text", placeholder: {}, required: false, enabled: true, options: [],
});

describe("사전등록 분기 탭", () => {
  it("하드코딩 없이 기준 문항의 선택지로 탭 값을 만든다", () => {
    expect(branchOptionValues(trigger)).toEqual(["General", "Buyer", "Press"]);
    expect(branchOptionValues({ ...trigger, options: [{ en: "Student" }, { en: "Sponsor" }] }))
      .toEqual(["Student", "Sponsor"]);
    expect(branchOptionValues({ ...trigger, options: [{ en: "Buyer" }, { en: "Buyer" }] }))
      .toEqual(["Buyer"]);
  });

  it("선택지 이름을 바꾸면 같은 위치의 분기 문항을 새 탭으로 이동한다", () => {
    const branch: CollectBranch = {
      enabled: true,
      fieldKey: "type",
      groups: [
        { value: "General", fields: [] },
        { value: "Buyer", fields: [field("company")] },
        { value: "Press", fields: [field("publication")] },
      ],
    };
    const groups = reconcileBranchGroups(branch, ["General", "Buyer", "Press"], ["General", "Partner", "Press"]);
    expect(groups.find((group) => group.value === "Partner")?.fields.map((item) => item.key)).toEqual(["company"]);
    expect(groups.some((group) => group.value === "Buyer")).toBe(false);
  });

  it("선택지를 삭제해도 그 탭의 문항 데이터는 보존한다", () => {
    const branch: CollectBranch = {
      enabled: true, fieldKey: "type", groups: [{ value: "Buyer", fields: [field("company")] }],
    };
    const groups = reconcileBranchGroups(branch, ["Buyer"], []);
    expect(groups).toEqual(branch.groups);
  });
});
