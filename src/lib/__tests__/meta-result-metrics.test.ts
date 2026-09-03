import { describe, expect, it } from "vitest";
import { metaResultValue, normalizeAdDetailColumns } from "@/lib/meta-result-metrics";

describe("Meta result metrics", () => {
  it("does not double-count aliases of the same lead result", () => {
    expect(metaResultValue([
      { action_type: "lead", value: "12" },
      { action_type: "offsite_conversion.fb_pixel_lead", value: "12" },
      { action_type: "purchase", value: "3" },
    ], "lead")).toBe(12);
  });

  it("uses only the selected Meta result", () => {
    expect(metaResultValue([{ action_type: "link_click", value: "40" }, { action_type: "lead", value: "4" }], "link_click")).toBe(40);
  });

  it("drops unknown and duplicate detail columns", () => {
    expect(normalizeAdDetailColumns(["cost", "cost", "unknown", "conversions"])).toEqual(["cost", "conversions"]);
  });
});
