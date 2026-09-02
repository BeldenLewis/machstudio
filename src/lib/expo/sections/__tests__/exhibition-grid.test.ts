import { describe, expect, it } from "vitest";
import { normalizeExpoPage } from "@/lib/expo/config";
import { publishErrors } from "@/lib/expo/readiness";
import { validatePageDraft } from "@/lib/expo/request";
import { exhibitionItemCount } from "@/lib/expo/sections/exhibition-grid";
import type { ExhibitionGridContent } from "@/lib/expo/sections/types";

const sid = "00000000-0000-4000-8000-000000000002";
const item = (id: string, order: number, over: Record<string, unknown> = {}) => ({
  id, title: { ko: id }, accentToken: "orange", destinationId: "overview", order, enabled: true, ...over,
});
const section = (items: unknown[]) => ({ sid, type: "exhibition-grid", variant: "default", enabled: true, content: { heading: { ko: "전시" }, items } });

describe("exhibition-grid schema", () => {
  it("preserves ids while producing contiguous display order and a valid enabled count", () => {
    const normalized = normalizeExpoPage({ settings: { destinations: [
      { id: "overview", label: "소개", action: { type: "anchor", target: "overview" }, enabled: true },
    ] }, sections: [section([item("second", 20), item("first", -1), item("off", 0, { enabled: false })])] });
    const content = normalized.sections[0].content as unknown as ExhibitionGridContent;
    expect(content.items.map(({ id, order }) => ({ id, order }))).toEqual([
      { id: "first", order: 0 }, { id: "off", order: 1 }, { id: "second", order: 2 },
    ]);
    expect(exhibitionItemCount(content, new Set(["overview"]))).toBe(2);
  });

  it("rejects duplicate row ids, overflow, and arbitrary accent CSS at stable paths", () => {
    const rows = Array.from({ length: 101 }, (_, i) => item(i === 100 ? "row-1" : `row-${i}`, i));
    rows[0].accentToken = "red;background:url(https://evil.example)";
    const result = validatePageDraft({ schemaVersion: 2, sections: [section(rows)] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual(expect.objectContaining({ path: "sections[0].content.items", code: "too-many", severity: "error", sid }));
      expect(result.errors).toContainEqual(expect.objectContaining({ path: "sections[0].content.items[0].accentToken", code: "invalid-token", severity: "error", sid }));
      expect(result.errors).toContainEqual(expect.objectContaining({ path: "sections[0].content.items[100].id", code: "duplicate-id", severity: "error", sid }));
    }
  });

  it("blocks enabled rows whose destination is missing or disabled", () => {
    const out = publishErrors({ schemaVersion: 2, sections: [section([item("robotics", 0)])] });
    expect(out).toContainEqual(expect.objectContaining({
      path: "sections[0].content.items[0].destinationId", code: "invalid-destination-reference", severity: "error", sid,
    }));
  });
});
