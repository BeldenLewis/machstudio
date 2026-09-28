import { describe, expect, it } from "vitest";
import { parseApiDateRange, sanitizeExternalReport } from "@/lib/external-api-data";
import type { RealtimeReportData } from "@/app/(app)/dashboard/RealtimeReport";

describe("Machstudio API date range", () => {
  it("uses a 30-day default range ending now", () => {
    const range = parseApiDateRange({});
    expect(Math.round((range.to.getTime() - range.from.getTime()) / 86_400_000)).toBe(30);
  });

  it("rejects reversed and overlong ranges", () => {
    expect(() => parseApiDateRange({ from: "2026-09-20", to: "2026-09-01" })).toThrow("invalid_date_range");
    expect(() => parseApiDateRange({ from: "2025-01-01", to: "2026-09-01" })).toThrow("date_range_too_large");
  });
});

describe("external dashboard privacy", () => {
  it("removes PII fields and one-off distribution values", () => {
    const report = {
      fieldStats: [
        { key: "name", label: "이름", total: 2, items: [{ label: "홍길동", count: 1, percent: 50 }] },
        { key: "industry", label: "산업", total: 3, items: [{ label: "교육", count: 2, percent: 67 }, { label: "의료", count: 1, percent: 33 }] },
      ],
      composition: [],
      emailDomainTop: [{ domain: "tiny.example", count: 1, percent: 100 }],
    } as unknown as RealtimeReportData;
    const sanitized = sanitizeExternalReport(report);
    expect(sanitized.fieldStats).toEqual([{ key: "industry", label: "산업", total: 3, items: [{ label: "교육", count: 2, percent: 67 }] }]);
    expect(sanitized.emailDomainTop).toEqual([]);
  });
});
