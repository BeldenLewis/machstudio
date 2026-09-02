import { NextResponse } from "next/server";
import { EXPO_RUNTIME_JS } from "@/generated/expo-runtime";
import { campaignPreviewMode, forcedCampaignsForPreview } from "@/lib/expo/campaign-preview";
import { EXPO_DEFAULT_THEME, normalizeExpoPage } from "@/lib/expo/config";
import { buildExpoPayload } from "@/lib/expo/payload";
import { instantiateBuiltInPreset } from "@/lib/expo/presets";
import type { ExpoPageConfigV2, ExpoSection } from "@/lib/expo/types";

const CDN = "https://cdn.example.com";
const FIXED_NOW = new Date("2027-01-15T00:00:00.000Z");

function image(name: string, decorative = false) {
  const url = `${CDN}/assets/${name}.svg`;
  return {
    kind: "image" as const,
    url,
    originalUrl: url,
    mimeType: "image/svg+xml",
    width: 640,
    height: 480,
    alt: decorative ? "" : name,
    decorative,
  };
}

function destinations() {
  const ids = [
    "exhibition-overview", "visitor-registration", "exhibitor-apply",
    "exhibition-ai-data-center", "exhibition-robot-tech", "exhibition-ai-factory",
    "exhibition-secu-tech", "exhibition-retail-logis", "exhibition-smart-tech",
    "booth-participation-guide", "booth-inquiry", "brochure-download",
    "previous-event-results", "visitor-registration-guide", "venue-location",
    "directions", "parking-guide",
  ];
  return ids.map((id) => ({
    id,
    label: id,
    action: id === "exhibition-overview"
      ? { type: "anchor" as const, target: "exhibitions" }
      : id === "brochure-download"
        ? { type: "download" as const, href: `${CDN}/documents/stk-2027-brochure.pdf` }
        : id === "booth-inquiry"
          ? { type: "imweb-modal" as const, modalId: "boothInquiry", fallbackHref: `${CDN}/destinations/booth-inquiry` }
          : { type: "url" as const, href: `${CDN}/destinations/${id}`, newTab: id === "visitor-registration" },
    enabled: true,
  }));
}

function materializeStkFixture(options: { empty: string | null; long: boolean }): ExpoPageConfigV2 {
  let serial = 0;
  const config = instantiateBuiltInPreset("stk-home-v1", {
    randomUUID: () => `15000000-0000-4000-8000-${String(++serial).padStart(12, "0")}`,
  });

  const sections = config.sections.map((section): ExpoSection => {
    const content = structuredClone(section.content) as Record<string, unknown>;
    if (section.type === "campaign-hero") {
      content.video = {
        kind: "video", url: `${CDN}/assets/stk-hero.mp4`, originalUrl: `${CDN}/assets/stk-hero.mp4`,
        mimeType: "video/mp4", poster: image("stk-hero-poster"), rightsStatus: "confirmed",
      };
      const ctas = Array.isArray(content.ctas) ? content.ctas : [];
      content.ctas = [
        ...ctas,
        { id: "exhibitor-apply", label: { ko: "참가기업 신청" }, destinationId: "exhibitor-apply", variant: "primary", audience: "exhibitor", campaignIds: ["exhibitor-recruitment"], priority: 0, fallback: false, enabled: true },
      ];
    }
    if (section.type === "exhibition-grid") {
      content.items = (Array.isArray(content.items) ? content.items : []).map((row, index) => ({
        ...(row as Record<string, unknown>), symbol: image(`exhibition-${index + 1}`, true),
      }));
    }
    if (section.type === "audience-links") {
      content.groups = (Array.isArray(content.groups) ? content.groups : []).map((group, groupIndex) => ({
        ...(group as Record<string, unknown>),
        items: (Array.isArray((group as Record<string, unknown>).items) ? (group as { items: unknown[] }).items : []).map((row, index) => ({
          ...(row as Record<string, unknown>), icon: image(`audience-${groupIndex + 1}-${index + 1}`, true),
        })),
      }));
    }
    if (section.type === "speaker-carousel") {
      const speakers = options.empty === "speakers" ? [] : (Array.isArray(content.speakers) ? content.speakers : []).map((row, index) => ({
        ...(row as Record<string, unknown>),
        image: image(`speaker-${index + 1}`),
        ...(options.long && index === 0 ? { role: { en: "Principal Architect for Autonomous Manufacturing, Robotics, Artificial Intelligence, Industrial Safety, International Partnerships, and Long-Range Transformation Programs" } } : {}),
      }));
      content.speakers = speakers;
      if (options.long && Array.isArray(content.categories)) {
        content.categories = content.categories.map((row, index) => index === 2
          ? { ...(row as Record<string, unknown>), label: { en: "AUTONOMOUS MANUFACTURING AND INDUSTRIAL TRANSFORMATION" } }
          : row);
      }
    }
    if (section.type === "sponsor-marquee") {
      const groups = Array.isArray(content.groups) ? content.groups as Array<Record<string, unknown>> : [];
      content.sponsors = options.empty === "sponsors" ? [] : groups.flatMap((group, groupIndex) => [0, 1].map((offset) => ({
        id: `sponsor-${groupIndex + 1}-${offset + 1}`,
        name: `STK Partner ${groupIndex + 1}-${offset + 1}`,
        logo: image(`sponsor-${groupIndex + 1}-${offset + 1}`),
        homepageUrl: `${CDN}/partners/${groupIndex + 1}-${offset + 1}`,
        groupId: group.id,
        order: offset,
        enabled: true,
      })));
    }
    return { ...section, content };
  });

  return normalizeExpoPage({
    ...config,
    settings: {
      event: { edition: 2027, startsAt: "2027-06-09T00:00:00.000+09:00", endsAt: "2027-06-11T23:59:59.000+09:00", facts: { companies: 550, sessions: 27, booths: 2000 } },
      campaigns: [
        { id: "exhibitor-recruitment", label: "참가기업 모집", startsAt: "2026-01-01T00:00:00.000Z", endsAt: "2028-01-01T00:00:00.000Z", override: "auto", enabled: true },
        { id: "visitor-registration", label: "참관객 사전등록", startsAt: "2027-03-01T00:00:00.000Z", endsAt: "2027-06-09T00:00:00.000Z", override: "auto", enabled: true },
      ],
      destinations: destinations(),
    },
    sections,
  });
}

function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const url = new URL(request.url);
  const campaignState = campaignPreviewMode(url.searchParams.get("campaignState"));
  const config = materializeStkFixture({
    empty: url.searchParams.get("empty"),
    long: url.searchParams.get("long") === "1",
  });
  const resolved = buildExpoPayload(config, {
    locale: "ko",
    pages: [],
    now: FIXED_NOW,
    forcedCampaigns: forcedCampaignsForPreview(campaignState),
  });
  const payload = {
    pageId: "stk-runtime-harness",
    theme: { ...EXPO_DEFAULT_THEME, accent: "#ff7a00", darkBg: "#0b0c0e" },
    origin: url.origin,
    sections: resolved.sections,
    campaigns: resolved.campaigns,
    destinations: resolved.destinations,
    locale: "ko",
    mode: "preview-draft" as const,
  };
  const serialized = jsonForScript(payload);

  const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>STK runtime browser harness</title>
<style>
html,body{margin:0;background:#eef1f5;color:#111;font:14px/1.4 system-ui,sans-serif}body{min-width:0}
#exhibitions{height:1px}.harness-controls{position:fixed;right:8px;bottom:8px;z-index:20;display:flex;gap:4px;padding:6px;background:#fff;border:1px solid #bbb}.harness-controls button{font:12px system-ui}
</style></head><body>
<div id="exhibitions"></div><div id="stk-runtime-container" data-mach-expo></div>
<div class="harness-controls" aria-label="runtime harness controls">
  <button type="button" data-action="remove-host">remove host</button>
  <button type="button" data-action="reinsert-snippet">reinsert snippet</button>
  <button type="button" data-action="replace-container">replace container</button>
  <button type="button" data-action="failed-remount">failed remount</button>
</div>
<script>${EXPO_RUNTIME_JS}
const __stkPayload=${serialized};
__msExpo.boot(__stkPayload, document.currentScript);
window.__stkHarness={
  removeHost(){document.querySelector("mach-expo-section")?.remove();},
  reinsertSnippet(){const script=document.createElement("script");script.textContent="__msExpo.boot("+${jsonForScript(serialized)}+",document.currentScript);";document.body.appendChild(script);script.remove();},
  replaceContainer(){const current=document.querySelector("[data-mach-expo]");const next=document.createElement("div");next.id="stk-runtime-container-replacement";next.setAttribute("data-mach-expo","");current?.replaceWith(next);__msExpo.boot(__stkPayload,null);},
  failedRemount(){const before=document.querySelector("mach-expo-section");const original=HTMLElement.prototype.attachShadow;HTMLElement.prototype.attachShadow=function(){throw new Error("intentional harness attach failure")};try{__msExpo.boot(__stkPayload,null)}finally{HTMLElement.prototype.attachShadow=original}return before===document.querySelector("mach-expo-section");}
};
document.querySelector(".harness-controls")?.addEventListener("click",event=>{const action=event.target?.getAttribute?.("data-action");if(action==="remove-host")window.__stkHarness.removeHost();if(action==="reinsert-snippet")window.__stkHarness.reinsertSnippet();if(action==="replace-container")window.__stkHarness.replaceContainer();if(action==="failed-remount")window.__stkHarness.failedRemount();});
</script></body></html>`;

  return new NextResponse(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
