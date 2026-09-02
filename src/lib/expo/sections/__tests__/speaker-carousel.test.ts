import { describe, expect, it } from "vitest";
import { buildExpoPayload } from "@/lib/expo/payload";
import { normalizeExpoPage } from "@/lib/expo/config";
import { publishErrors } from "@/lib/expo/readiness";
import { validatePageDraft } from "@/lib/expo/request";
import type { SpeakerCarouselContent } from "@/lib/expo/sections/types";

const sid = "00000000-0000-4000-8000-000000000004";
const category = (id: string, enabled = true) => ({ id, label: { ko: id }, badgeToken: "robotics", gradientToken: "robotics", order: 5, enabled });
const speaker = (id: string, categoryId: string, over: Record<string, unknown> = {}) => ({
  id, name: { ko: id }, company: { ko: "회사" }, role: { ko: "직책" }, day: 1, categoryId,
  image: { kind: "image", url: `https://cdn.example.com/${id}.jpg`, alt: id, decorative: false },
  crop: { fit: "cover", x: -10, y: 200, scale: 9 }, order: 4, enabled: true, ...over,
});
const section = (categories: unknown[], speakers: unknown[]) => ({ sid, type: "speaker-carousel", variant: "default", enabled: true, content: { heading: { ko: "연사" }, categories, speakers } });

describe("speaker-carousel schema", () => {
  it("clamps crop, preserves ids, and hides empty categories only at the public payload boundary", () => {
    const config = normalizeExpoPage({ sections: [section([category("robotics"), category("ai")], [speaker("lee", "robotics")])] });
    const stored = config.sections[0].content as unknown as SpeakerCarouselContent;
    expect(stored.categories.map((row) => row.id)).toEqual(["robotics", "ai"]);
    expect(stored.speakers[0].crop).toEqual({ fit: "cover", x: 0, y: 100, scale: 2 });
    const payload = buildExpoPayload(config, { locale: "ko", pages: [], now: new Date("2027-01-01T00:00:00Z") });
    const published = payload.sections[0].content as { categories: Array<{ id: string }> };
    expect(published.categories.map((row) => row.id)).toEqual(["robotics"]);
  });

  it("rejects duplicate ids and non-allowlisted visual tokens at exact rows", () => {
    const result = validatePageDraft({ schemaVersion: 2, sections: [section([
      category("robotics"), { ...category("robotics"), badgeToken: "url(javascript:evil)", gradientToken: "linear-gradient(red,blue)" },
    ], [])] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "sections[0].content.categories[1].id", code: "duplicate-id", severity: "error", sid }),
      expect.objectContaining({ path: "sections[0].content.categories[1].badgeToken", code: "invalid-token", severity: "error", sid }),
      expect.objectContaining({ path: "sections[0].content.categories[1].gradientToken", code: "invalid-token", severity: "error", sid }),
    ]));
  });

  it("blocks an enabled speaker whose category is deleted or disabled at that speaker row", () => {
    const out = publishErrors({ schemaVersion: 2, sections: [section([category("robotics", false)], [speaker("lee", "robotics"), speaker("kim", "deleted")])] });
    expect(out).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "sections[0].content.speakers[0].categoryId", code: "invalid-category-reference", severity: "error", sid }),
      expect.objectContaining({ path: "sections[0].content.speakers[1].categoryId", code: "invalid-category-reference", severity: "error", sid }),
    ]));
  });
});
