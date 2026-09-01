import { describe, expect, it } from "vitest";
import { normalizeExpoPage } from "@/lib/expo/config";
import { contentWarnings, publishErrors } from "@/lib/expo/readiness";
import { validatePageDraft } from "@/lib/expo/request";
import type { CampaignHeroContent } from "@/lib/expo/sections/types";

const sid = "00000000-0000-4000-8000-000000000001";
const hero = (content: Record<string, unknown>) => ({
  sid, type: "campaign-hero", variant: "default", enabled: true, embedEnabled: false, content,
});

describe("campaign-hero schema", () => {
  it("derives the accessible headline and clamps hero controls", () => {
    const section = normalizeExpoPage({ sections: [hero({
      typingLines: [{ ko: "첫 문장" }, { ko: "둘째" }],
      accessibleHeadline: { ko: "입력해도 파생값 우선" },
      overlay: 5,
      typing: { enabled: true, speedMs: 1, holdMs: 99_999 },
    })] }).sections[0];
    const content = section.content as unknown as CampaignHeroContent;
    expect(content.accessibleHeadline).toEqual({ ko: "첫 문장" });
    expect(content.overlay).toBe(0.9);
    expect(content.typing).toEqual({ enabled: true, speedMs: 20, holdMs: 10_000 });
  });

  it("rejects duplicate CTA ids at the exact later row but allows an incomplete draft", () => {
    const duplicate = validatePageDraft({ schemaVersion: 2, sections: [hero({ ctas: [
      { id: "same", destinationId: "missing" }, { id: "same", destinationId: "missing" },
    ] })] });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.errors).toContainEqual(expect.objectContaining({
      path: "sections[0].content.ctas[1].id", code: "duplicate-id", severity: "error", sid,
    }));

    expect(validatePageDraft({ schemaVersion: 2, sections: [hero({})] })).toEqual({ ok: true });
  });

  it("blocks invalid active video data but keeps rights and decorative-alt findings as warnings", () => {
    const config = { schemaVersion: 2, sections: [hero({
      typingLines: [{ ko: "Hero" }],
      video: { kind: "video", url: "javascript:alert(1)", originalUrl: "https://cdn.example.com/a.mp4", mimeType: "video/mp4", rightsStatus: "unconfirmed", poster: { kind: "image", url: "https://cdn.example.com/poster.jpg", decorative: true } },
    })] };
    expect(publishErrors(config)).toContainEqual(expect.objectContaining({
      path: "sections[0].content.video.url", code: "invalid-url", severity: "error", sid,
    }));
    const warnings = contentWarnings(config);
    expect(warnings).toContainEqual(expect.objectContaining({
      path: "sections[0].content.video.rightsStatus", code: "unconfirmed-video-rights", severity: "warning", sid,
    }));
    expect(warnings).toContainEqual(expect.objectContaining({
      path: "sections[0].content.video.poster.alt", code: "decorative-empty-alt", severity: "warning", sid,
    }));
  });

  it("allows an incomplete video draft but blocks publishing until the MP4 contract is complete", () => {
    const config = { schemaVersion: 2, sections: [hero({
      typingLines: [{ ko: "Hero" }],
      video: { kind: "video", url: "https://cdn.example.com/hero.mp4" },
    })] };
    expect(validatePageDraft(config)).toEqual({ ok: true });
    const stored = normalizeExpoPage(config);
    expect(stored.sections[0].content.video).toEqual({ kind: "video", url: "https://cdn.example.com/hero.mp4" });
    expect(publishErrors(stored)).toContainEqual(expect.objectContaining({
      path: "sections[0].content.video", code: "invalid-hero-video", severity: "error", sid,
    }));

    const emptyVideo = normalizeExpoPage({ schemaVersion: 2, sections: [hero({
      typingLines: [{ ko: "Hero" }], video: {},
    })] });
    expect(emptyVideo.sections[0].content).toHaveProperty("video");
    expect(publishErrors(emptyVideo)).toContainEqual(expect.objectContaining({
      path: "sections[0].content.video", code: "invalid-hero-video", severity: "error", sid,
    }));
  });
});
