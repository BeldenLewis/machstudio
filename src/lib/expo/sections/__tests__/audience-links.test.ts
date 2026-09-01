import { describe, expect, it } from "vitest";
import { normalizeExpoPage } from "@/lib/expo/config";
import { publishErrors } from "@/lib/expo/readiness";
import { validatePageDraft } from "@/lib/expo/request";
import type { AudienceLinksContent } from "@/lib/expo/sections/types";

const sid = "00000000-0000-4000-8000-000000000003";
const group = (audience: string, items: unknown[] = []) => ({ audience, title: { ko: audience }, variant: "light", items });
const section = (groups: unknown[]) => ({ sid, type: "audience-links", variant: "default", enabled: true, content: { groups } });

describe("audience-links schema", () => {
  it("always normalizes to exactly one exhibitor and one visitor group", () => {
    const content = normalizeExpoPage({ sections: [section([
      group("visitor"), group("visitor", [{ id: "ignored" }]), group("exhibitor"), group("other"),
    ])] }).sections[0].content as unknown as AudienceLinksContent;
    expect(content.groups.map((row) => row.audience)).toEqual(["exhibitor", "visitor"]);
  });

  it("rejects duplicate link ids at the exact row path", () => {
    const link = { id: "brochure", label: { ko: "브로슈어" }, destinationId: "brochure", campaignIds: [], order: 0, enabled: true };
    const result = validatePageDraft({ schemaVersion: 2, sections: [section([group("exhibitor", [link, link])])] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const duplicates = result.errors.filter((error) => error.path === "sections[0].content.groups[0].items[1].id" && error.code === "duplicate-id");
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0]).toEqual(expect.objectContaining({ severity: "error", sid }));
    }
  });

  it("rejects image alt text beyond the canonical text cap", () => {
    const link = { id: "icon", label: { ko: "아이콘" }, destinationId: "overview", campaignIds: [], order: 0, enabled: false,
      icon: { kind: "image", url: "https://cdn.example.com/icon.png", alt: "가".repeat(501), decorative: false } };
    const result = validatePageDraft({ schemaVersion: 2, sections: [section([group("visitor", [link])])] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContainEqual(expect.objectContaining({
      path: "sections[0].content.groups[0].items[0].icon.alt", code: "too-long", severity: "error", sid,
    }));
  });

  it("validates active destination/campaign references and image alternatives only at publish", () => {
    const link = { id: "apply", label: { ko: "신청" }, destinationId: "missing", campaignIds: ["missing-campaign"], order: 0, enabled: true,
      icon: { kind: "image", url: "https://cdn.example.com/icon.png", decorative: false } };
    const out = publishErrors({ schemaVersion: 2, sections: [section([group("exhibitor", [link])])] });
    expect(out).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "sections[0].content.groups[0].items[0].destinationId", code: "invalid-destination-reference", severity: "error", sid }),
      expect.objectContaining({ path: "sections[0].content.groups[0].items[0].campaignIds[0]", code: "invalid-campaign-reference", severity: "error", sid }),
      expect.objectContaining({ path: "sections[0].content.groups[0].items[0].icon.alt", code: "missing-image-alt", severity: "error", sid }),
    ]));
  });
});
