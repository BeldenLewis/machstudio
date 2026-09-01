/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { renderCampaignHero } from "@/lib/expo/renderers/campaign-hero";
import { renderExhibitionGrid } from "@/lib/expo/renderers/exhibition-grid";
import { renderAudienceLinks } from "@/lib/expo/renderers/audience-links";
import { renderSpeakerCarousel } from "@/lib/expo/renderers/speaker-carousel";
import { renderSponsorMarquee } from "@/lib/expo/renderers/sponsor-marquee";
import { renderCtaBand } from "@/lib/expo/renderers/cta-band";
import type { PayloadSection } from "@/lib/expo/view-sections";
import type { ResolvedDestination, SectionRenderContext } from "@/lib/expo/types";

const image = (id: string) => ({ kind: "image", url: `https://cdn.example.com/${id}.png`, alt: id, decorative: false });
const destinations: ResolvedDestination[] = [
  { id: "overview", label: "소개", action: { type: "anchor", target: "overview" } },
  { id: "brochure", label: "브로슈어", action: { type: "download", href: "https://cdn.example.com/stk.pdf" } },
  { id: "inquiry", label: "문의", action: { type: "imweb-modal", modalId: "mInquiry" } },
];
const context = (over: Partial<SectionRenderContext> = {}): SectionRenderContext => ({
  locale: "ko",
  campaigns: new Map(),
  destinations: new Map(destinations.map((row) => [row.id, row])),
  mode: "live",
  reducedMotion: false,
  doc: document,
  ...over,
});
const section = (type: string, content: Record<string, unknown>): PayloadSection => ({
  sid: `sid-${type}`, type, variant: "default", design: {}, content,
});

describe("STK public renderers", () => {
  it("renders the hero h1 fallback and a reduced-motion poster without video or typing timers", () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    const result = renderCampaignHero(section("campaign-hero", {
      accessibleHeadline: "STK 2027",
      typingLines: ["STK 2027", "Future in motion"],
      typing: { enabled: true, speedMs: 30, holdMs: 500 },
      video: { kind: "video", url: "https://cdn.example.com/hero.mp4", poster: image("poster") },
      ctas: [],
    }), context({ reducedMotion: true }));
    expect(result?.node.querySelector("h1")?.textContent).toBe("STK 2027");
    expect(result?.node.querySelector("video")).toBeNull();
    expect(result?.node.querySelector(".msx-hero-poster")).not.toBeNull();
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    result?.dispose?.();
    vi.useRealTimers();
  });

  it("derives exhibition count and columns from valid enabled rows and marks symbols for grayscale-to-color", () => {
    const result = renderExhibitionGrid(section("exhibition-grid", { heading: "하위 전시", items: [
      { id: "robotics", title: "Robotics", symbol: image("robotics"), accentToken: "green", destinationId: "overview", order: 1, enabled: true },
      { id: "off", title: "Off", symbol: image("off"), accentToken: "blue", destinationId: "overview", order: 0, enabled: false },
      { id: "dead", title: "Dead", symbol: image("dead"), accentToken: "blue", destinationId: "missing", order: 2, enabled: true },
    ] }), context());
    expect(result?.node.getAttribute("data-count")).toBe("1");
    expect(result?.node.style.getPropertyValue("--msx-exhibition-columns")).toBe("1");
    expect(result?.node.querySelectorAll(".msx-exhibition-item")).toHaveLength(1);
    expect(result?.node.querySelector(".msx-exhibition-symbol")?.classList.contains("msx-source-color")).toBe(true);
  });

  it("uses phrasing content rather than a heading inside modal exhibition buttons", () => {
    const result = renderExhibitionGrid(section("exhibition-grid", { items: [
      { id: "inquiry", title: "Inquiry", description: "Talk to the team", destinationId: "inquiry", enabled: true },
    ] }), context());
    const action = result?.node.querySelector<HTMLButtonElement>(".msx-exhibition-item");
    expect(action?.tagName).toBe("BUTTON");
    expect(action?.querySelector("h1,h2,h3,h4,h5,h6")).toBeNull();
    expect(action?.querySelector(".msx-exhibition-title")?.tagName).toBe("SPAN");
    expect(action?.querySelector("p")).toBeNull();
    expect(action?.querySelector(".msx-exhibition-description")?.tagName).toBe("SPAN");
  });

  it("renders exactly the fixed Exhibitors and Visitors groups with no dead controls", () => {
    const result = renderAudienceLinks(section("audience-links", { groups: [
      { audience: "visitor", title: "Visitors", variant: "dark", items: [{ id: "visit", label: "Visit", destinationId: "overview", campaignIds: [], order: 0, enabled: true }] },
      { audience: "other", title: "Other", items: [{ id: "bad", label: "Bad", destinationId: "overview", campaignIds: [], order: 0, enabled: true }] },
      { audience: "exhibitor", title: "Exhibitors", variant: "light", items: [
        { id: "apply", label: "Apply", destinationId: "inquiry", campaignIds: [], order: 0, enabled: true },
        { id: "dead", label: "Dead", destinationId: "missing", campaignIds: [], order: 1, enabled: true },
      ] },
    ] }), context());
    expect([...result!.node.querySelectorAll(".msx-audience-group")].map((node) => node.getAttribute("data-audience")))
      .toEqual(["exhibitor", "visitor"]);
    expect(result?.node.querySelectorAll(".msx-audience-action")).toHaveLength(2);
  });

  it("filters and orders public speakers, supports roving keys, lazy crop, pointer lifecycle, and approved palette", () => {
    const result = renderSpeakerCarousel(section("speaker-carousel", {
      heading: "Speakers",
      categories: [
        { id: "ai", label: "AI", badgeToken: "ai", gradientToken: "ai", order: 1, enabled: true },
        { id: "robotics", label: "Robotics", badgeToken: "robotics", gradientToken: "robotics", order: 0, enabled: true },
        { id: "empty", label: "Empty", badgeToken: "robotics", gradientToken: "robotics", order: 2, enabled: true },
      ],
      speakers: [
        { id: "kim", name: "Kim", company: "Mach", role: "CEO", day: 1, categoryId: "ai", image: image("kim"), crop: { fit: "cover", x: 20, y: 70, scale: 1.2 }, order: 1, enabled: true },
        { id: "lee", name: "Lee", company: "STK", role: "CTO", day: 1, categoryId: "robotics", image: image("lee"), crop: { fit: "contain", x: 50, y: 40, scale: 1 }, order: 0, enabled: true },
        { id: "off", name: "Off", company: "X", role: "X", day: 1, categoryId: "robotics", image: image("off"), crop: { fit: "cover", x: 50, y: 50, scale: 1 }, order: 2, enabled: false },
      ],
    }), context());
    const tabs = result!.node.querySelectorAll<HTMLButtonElement>(".msx-speaker-filter");
    expect([...tabs].map((tab) => tab.textContent)).toEqual(["Robotics", "AI"]);
    expect([...tabs].map((tab) => tab.tabIndex)).toEqual([0, -1]);
    expect([...tabs].every((tab) => !tab.getAttribute("style")?.includes("speaker-badge"))).toBe(true);
    expect([...tabs].map((tab) => tab.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
    expect([...tabs].every((tab) => !tab.hasAttribute("role"))).toBe(true);
    tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect([...tabs].map((tab) => tab.tabIndex)).toEqual([-1, 0]);
    expect(result?.node.querySelectorAll(".msx-speaker-card:not([hidden])")).toHaveLength(1);
    tabs[1].click();
    const speakerImage = result!.node.querySelector<HTMLImageElement>(".msx-speaker-card:not([hidden]) img")!;
    expect(speakerImage.loading).toBe("lazy");
    expect(speakerImage.style.objectPosition).toBe("20% 70%");
    expect(speakerImage.style.transform).toBe("scale(1.2)");
    const card = result!.node.querySelector<HTMLElement>(".msx-speaker-card:not([hidden])")!;
    expect(card.style.getPropertyValue("--msx-speaker-surface")).toBe("#0B0C0E");
    expect(card.style.getPropertyValue("--msx-speaker-gradient-start")).toBe("#3468D9");
    expect(card.style.getPropertyValue("--msx-speaker-gradient-end")).toBe("#12306C");
    expect(result!.node.querySelector(".msx-speaker-track")?.classList.contains("msx-pointer-track")).toBe(true);
    result?.dispose?.();
  });

  it("clones a sponsor track only for motion-enabled marquee and uses one reduced-motion grid", () => {
    const content = { heading: "Sponsors", groups: [{ id: "partners", title: "Partners", marquee: true, durationSeconds: 20, order: 0 }], sponsors: [
      { id: "mach", name: "Mach", logo: image("mach"), homepageUrl: "https://mach.example.com", groupId: "partners", order: 0, enabled: true },
    ] };
    const moving = renderSponsorMarquee(section("sponsor-marquee", content), context());
    const reduced = renderSponsorMarquee(section("sponsor-marquee", content), context({ reducedMotion: true }));
    expect(moving?.node.querySelectorAll(".msx-sponsor-track")).toHaveLength(2);
    expect(moving?.node.querySelectorAll("[data-clone='true']")).toHaveLength(1);
    expect(moving?.node.querySelector("[data-clone='true']")?.hasAttribute("inert")).toBe(true);
    expect(moving?.node.querySelector<HTMLAnchorElement>("[data-clone='true'] a")?.tabIndex).toBe(-1);
    expect(reduced?.node.querySelectorAll(".msx-sponsor-track")).toHaveLength(1);
    expect(reduced?.node.querySelector(".msx-sponsor-grid")).not.toBeNull();
  });

  it("renders sharp CTA variants with exactly one simple right arrow and no dead button", () => {
    const result = renderCtaBand(section("cta-band", { headline: "Join STK", audience: "all", ctas: [
      { id: "brochure", label: "Brochure", destinationId: "brochure", variant: "secondary", audience: "all", campaignIds: [], priority: 0, fallback: true, enabled: true },
      { id: "inquiry", label: "Inquiry", destinationId: "inquiry", variant: "primary", audience: "all", campaignIds: [], priority: 1, fallback: true, enabled: true },
      { id: "dead", label: "Dead", destinationId: "missing", variant: "primary", audience: "all", campaignIds: [], priority: 2, fallback: true, enabled: true },
    ] }), context());
    expect(result?.node.getAttribute("data-bg")).toBe("dark");
    expect(result?.node.classList.contains("msx-cta-band-section")).toBe(true);
    expect(result?.node.querySelectorAll(".msx-cta-action")).toHaveLength(2);
    expect(result?.node.querySelector("[data-variant='secondary']")).not.toBeNull();
    expect(result?.node.querySelector("[data-variant='primary']")).not.toBeNull();
    for (const action of result!.node.querySelectorAll(".msx-cta-action")) {
      expect(action.textContent?.match(/→/g)).toHaveLength(1);
    }
  });

  it("returns null for empty enabled data in every optional renderer", () => {
    expect(renderExhibitionGrid(section("exhibition-grid", { heading: "Empty", items: [] }), context())).toBeNull();
    expect(renderAudienceLinks(section("audience-links", { groups: [] }), context())).toBeNull();
    expect(renderSpeakerCarousel(section("speaker-carousel", { heading: "Empty", categories: [], speakers: [] }), context())).toBeNull();
    expect(renderSponsorMarquee(section("sponsor-marquee", { groups: [], sponsors: [] }), context())).toBeNull();
    expect(renderCtaBand(section("cta-band", { headline: "Empty", audience: "all", ctas: [] }), context())).toBeNull();
  });
});
