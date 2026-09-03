import { describe, expect, it } from "vitest";
import { fillAdDailySeries } from "@/lib/ad-daily-series";

describe("fillAdDailySeries", () => {
  it("fills both folder boundaries and missing dates", () => {
    const rows = [{ date: "2026-08-10", cost: 10, impressions: 20, clicks: 2, conversions: 1 }];
    const result = fillAdDailySeries(
      rows,
      new Date("2026-08-08T00:00:00+09:00"),
      new Date("2026-08-11T23:59:59+09:00"),
    );
    expect(result.map((row) => row.date)).toEqual(["2026-08-08", "2026-08-09", "2026-08-10", "2026-08-11"]);
    expect(result.map((row) => row.cost)).toEqual([0, 0, 10, 0]);
  });

  it("keeps existing rows sorted when no explicit range is selected", () => {
    const rows = [
      { date: "2026-08-11", cost: 2, impressions: 0, clicks: 0, conversions: 0 },
      { date: "2026-08-10", cost: 1, impressions: 0, clicks: 0, conversions: 0 },
    ];
    expect(fillAdDailySeries(rows, null, null).map((row) => row.date)).toEqual(["2026-08-10", "2026-08-11"]);
  });
});
