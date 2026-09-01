import { describe, expect, it } from "vitest";
import { normalizeExpoPage } from "@/lib/expo/config";
import { publishErrors } from "@/lib/expo/readiness";
import { validatePageDraft } from "@/lib/expo/request";
import type { SponsorMarqueeContent } from "@/lib/expo/sections/types";

const sid = "00000000-0000-4000-8000-000000000005";
const group = (id: string, durationSeconds = 20) => ({ id, title: { ko: id }, marquee: true, durationSeconds, order: 9 });
const sponsor = (id: string, groupId: string) => ({ id, name: id, groupId, order: 7, enabled: true,
  logo: { kind: "image", url: `https://cdn.example.com/${id}.png`, decorative: false } });
const section = (groups: unknown[], sponsors: unknown[]) => ({ sid, type: "sponsor-marquee", variant: "default", enabled: true, content: { groups, sponsors } });

describe("sponsor-marquee schema", () => {
  it("clamps duration and normalizes group/sponsor display order without changing ids", () => {
    const content = normalizeExpoPage({ sections: [section([group("slow", 999), group("fast", 1)], [sponsor("b", "slow"), sponsor("a", "fast")])] })
      .sections[0].content as unknown as SponsorMarqueeContent;
    expect(content.groups.map(({ id, durationSeconds, order }) => ({ id, durationSeconds, order }))).toEqual([
      { id: "slow", durationSeconds: 120, order: 0 }, { id: "fast", durationSeconds: 8, order: 1 },
    ]);
    expect(content.sponsors.map(({ id, order }) => ({ id, order }))).toEqual([{ id: "b", order: 0 }, { id: "a", order: 1 }]);
  });

  it("rejects duplicate ids at the exact sponsor row", () => {
    const row = sponsor("same", "partners");
    const result = validatePageDraft({ schemaVersion: 2, sections: [section([group("partners")], [row, row])] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContainEqual(expect.objectContaining({
      path: "sections[0].content.sponsors[1].id", code: "duplicate-id", severity: "error", sid,
    }));
  });

  it("blocks a sponsor with a missing group and missing required logo alt", () => {
    const out = publishErrors({ schemaVersion: 2, sections: [section([group("partners")], [sponsor("mach", "missing")])] });
    expect(out).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "sections[0].content.sponsors[0].groupId", code: "invalid-group-reference", severity: "error", sid }),
      expect.objectContaining({ path: "sections[0].content.sponsors[0].logo.alt", code: "missing-image-alt", severity: "error", sid }),
    ]));
  });
});
