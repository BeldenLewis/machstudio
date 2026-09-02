import { NextResponse } from "next/server";
import { EXPO_DEFAULT_THEME, normalizeExpoPage } from "@/lib/expo/config";
import { prepareStandaloneExpoHtml } from "@/lib/expo/export";
import { instantiateBuiltInPreset } from "@/lib/expo/presets";
import { snapshotDigest } from "@/lib/expo/snapshot-digest";
import type { ExpoPageConfigV2, ExpoSection } from "@/lib/expo/types";

const CDN = "https://cdn.example.com";
const EXPORTED_AT = new Date("2027-01-15T00:00:00.000Z");

function image(name: string) {
  const url = `${CDN}/assets/${name}.svg`;
  return { kind: "image" as const, url, originalUrl: url, mimeType: "image/svg+xml", width: 640, height: 480, alt: name, decorative: false };
}

function fixture(): ExpoPageConfigV2 {
  let serial = 0;
  const base = instantiateBuiltInPreset("stk-home-v1", {
    randomUUID: () => `15100000-0000-4000-8000-${String(++serial).padStart(12, "0")}`,
  });
  const ids = new Set<string>();
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") {
      const row = value as Record<string, unknown>;
      if (typeof row.destinationId === "string") ids.add(row.destinationId);
      Object.values(row).forEach(collect);
    }
  };
  collect(base.sections);

  const sections = base.sections.map((section): ExpoSection => {
    const content = structuredClone(section.content) as Record<string, unknown>;
    if (section.type === "campaign-hero") {
      content.video = {
        kind: "video", url: `${CDN}/assets/stk-hero.mp4`, originalUrl: `${CDN}/assets/stk-hero.mp4`,
        mimeType: "video/mp4", poster: image("stk-hero-poster"), rightsStatus: "confirmed",
      };
    }
    if (section.type === "speaker-carousel") {
      content.speakers = (Array.isArray(content.speakers) ? content.speakers : []).map((row, index) => ({
        ...(row as Record<string, unknown>), image: image(`speaker-${index + 1}`),
      }));
    }
    if (section.type === "sponsor-marquee") {
      const group = Array.isArray(content.groups) ? content.groups[0] as Record<string, unknown> : null;
      content.sponsors = group ? [
        { id: "standalone-partner", name: "STK Standalone Partner", logo: image("standalone-partner"), homepageUrl: `${CDN}/partners/standalone`, groupId: group.id, order: 0, enabled: true },
      ] : [];
    }
    return { ...section, content };
  });

  return normalizeExpoPage({
    ...base,
    settings: {
      campaigns: [
        { id: "exhibitor-recruitment", label: "참가기업 모집", startsAt: "2026-01-01T00:00:00.000Z", endsAt: "2028-01-01T00:00:00.000Z", override: "auto", enabled: true },
        { id: "visitor-registration", label: "참관객 사전등록", startsAt: "2027-03-01T00:00:00.000Z", endsAt: "2027-06-09T00:00:00.000Z", override: "auto", enabled: true },
      ],
      destinations: [...ids].map((id) => ({
        id,
        label: id,
        action: id === "booth-inquiry"
          ? { type: "imweb-modal" as const, modalId: "boothInquiry", fallbackHref: `${CDN}/destinations/booth-inquiry` }
          : id === "brochure-download"
            ? { type: "download" as const, href: `${CDN}/documents/stk-2027-brochure.pdf` }
            : { type: "url" as const, href: `${CDN}/destinations/${id}` },
        enabled: true,
      })),
    },
    sections,
  });
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 });
  }
  const url = new URL(request.url);
  const config = fixture();
  const sectionType = url.searchParams.get("type") ?? "cta-band";
  const selected = config.sections.find((section) => section.type === sectionType);
  const scope = url.searchParams.get("scope") === "section" && selected
    ? { type: "section" as const, sid: selected.sid }
    : { type: "page" as const };
  const result = prepareStandaloneExpoHtml({
    pageId: "stk-standalone-harness",
    revisionSequence: 15,
    revisionCodeDigest: snapshotDigest(config),
    exportedAt: EXPORTED_AT,
    scope,
    config,
    theme: { ...EXPO_DEFAULT_THEME, accent: "#ff7a00", darkBg: "#0b0c0e" },
    locale: "ko",
    pages: [],
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: result.status });
  }
  return new NextResponse(result.html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-export-filename": result.filename,
    },
  });
}
