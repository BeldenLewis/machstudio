import { describe, expect, it } from "vitest";
import { splitCollectValues } from "@/lib/collect-value-split";

describe("splitCollectValues", () => {
  it("keeps a comma inside one known option", () => {
    expect(splitCollectValues("Oct 24, 2026", ["Oct 22, 2026", "Oct 23, 2026", "Oct 24, 2026"]))
      .toEqual(["Oct 24, 2026"]);
  });

  it("separates multiple known options without splitting their dates", () => {
    expect(splitCollectValues(
      "Oct 22, 2026, Oct 24, 2026",
      ["Oct 22, 2026", "Oct 23, 2026", "Oct 24, 2026"],
    )).toEqual(["Oct 22, 2026", "Oct 24, 2026"]);
  });

  it("preserves the delimiter fallback for integration fields", () => {
    expect(splitCollectValues("Facebook, Google")).toEqual(["Facebook", "Google"]);
  });
});
