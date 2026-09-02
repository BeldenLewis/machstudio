import { describe, expect, it } from "vitest";
import { contentWarnings, publishErrors } from "@/lib/expo/readiness";
import { validatePageDraft } from "@/lib/expo/request";

const sid = "00000000-0000-4000-8000-000000000006";
const placement = (id: string, over: Record<string, unknown> = {}) => ({
  id, label: { ko: id }, destinationId: "apply", variant: "primary", audience: "all", campaignIds: [],
  priority: 0, fallback: true, enabled: true, ...over,
});
const section = (ctas: unknown[]) => ({ sid, type: "cta-band", variant: "default", enabled: true, content: { headline: { ko: "지금 참여하세요" }, audience: "all", ctas } });

describe("cta-band schema", () => {
  it("rejects malformed variants and audience values structurally", () => {
    const result = validatePageDraft({ schemaVersion: 2, sections: [section([placement("bad", { variant: "background:url(x)", audience: "everyone" })])] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "sections[0].content.ctas[0].variant", code: "invalid-token", severity: "error", sid }),
      expect.objectContaining({ path: "sections[0].content.ctas[0].audience", code: "invalid-shape", severity: "error", sid }),
    ]));
  });

  it("blocks actionless enabled CTAs but reports a missing fallback only as a warning", () => {
    const config = { schemaVersion: 2, sections: [section([placement("apply", { fallback: false })])] };
    expect(publishErrors(config)).toContainEqual(expect.objectContaining({
      path: "sections[0].content.ctas[0].destinationId", code: "invalid-destination-reference", severity: "error", sid,
    }));
    expect(contentWarnings(config)).toContainEqual(expect.objectContaining({
      path: "sections[0].content.ctas", code: "no-fallback-cta", severity: "warning", sid,
    }));
  });

  it("allows an empty optional band draft and warns without blocking publishing by itself", () => {
    const config = { schemaVersion: 2, sections: [{ ...section([]), enabled: false, content: {} }] };
    expect(validatePageDraft(config)).toEqual({ ok: true });
    expect(contentWarnings(config)).toContainEqual(expect.objectContaining({
      path: "sections[0].content", code: "empty-optional-section", severity: "warning", sid,
    }));
  });
});
