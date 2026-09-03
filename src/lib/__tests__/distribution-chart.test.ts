import { describe, expect, it } from "vitest";
import { chooseDistributionChart } from "@/lib/distribution-chart";

describe("chooseDistributionChart", () => {
  it("uses a split bar for one or two answers", () => {
    expect(chooseDistributionChart([{ count: 9 }, { count: 1 }])).toBe("split");
  });

  it("uses a donut for a readable part-to-whole of three to five answers", () => {
    expect(chooseDistributionChart([{ count: 60 }, { count: 25 }, { count: 15 }])).toBe("donut");
  });

  it("keeps similar slices and long lists on a shared comparison baseline", () => {
    expect(chooseDistributionChart([{ count: 34 }, { count: 33 }, { count: 33 }])).toBe("ranked");
    expect(chooseDistributionChart(Array.from({ length: 6 }, (_, index) => ({ count: 6 - index })))).toBe("ranked");
  });
});
