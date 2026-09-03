import { describe, expect, it } from "vitest";
import { metaReportedCostPerResult, metaReportedResult, normalizeAdDetailColumns } from "@/lib/meta-result-metrics";

describe("Meta reported result metrics", () => {
  it("uses Meta's reported result instead of summing actions", () => {
    expect(metaReportedResult([{ indicator: "actions:lead", values: [{ value: "12" }] }])).toEqual({
      value: 12,
      type: "actions:lead",
    });
  });

  it("falls back to objective results and Meta's reported cost per result", () => {
    expect(metaReportedResult(undefined, [{ action_type: "complete_registration", value: "4" }]).value).toBe(4);
    expect(metaReportedCostPerResult([{ value: "1234.5" }], 9999, 4)).toBe(1234.5);
  });

  it("drops unknown and duplicate detail columns", () => {
    expect(normalizeAdDetailColumns(["cost", "cost", "unknown", "cpm", "conversions"])).toEqual(["cost", "cpm", "conversions"]);
  });
});
