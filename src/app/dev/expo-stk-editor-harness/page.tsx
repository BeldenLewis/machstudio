"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { notFound, useSearchParams } from "next/navigation";
import { PageDraftWorkspace } from "@/components/expo/PageDraftWorkspace";
import { campaignPreviewMode, forcedCampaignsForPreview } from "@/lib/expo/campaign-preview";
import { EXPO_DEFAULT_THEME, normalizeExpoPage } from "@/lib/expo/config";
import type { ExpoPageEditorDto, ExpoPageSaveRequest, ExpoPageTransport } from "@/lib/expo/editor-dto";
import { mountExpo } from "@/lib/expo/mount";
import { buildExpoPayload } from "@/lib/expo/payload";
import { instantiateBuiltInPreset } from "@/lib/expo/presets";
import type { CampaignPreviewMode, ExpoPageConfigV2, ExpoSection } from "@/lib/expo/types";

const CDN = "https://cdn.example.com";
const SITE_ID = "stk-editor-site";
const PAGE_ID = "stk-editor-page";
const FIXED_NOW = new Date("2027-01-15T00:00:00.000Z");

function image(name: string) {
  const url = `${CDN}/assets/${name}.svg`;
  return { kind: "image" as const, url, originalUrl: url, mimeType: "image/svg+xml", width: 640, height: 480, alt: name, decorative: false };
}

function editorFixture(): ExpoPageConfigV2 {
  let serial = 0;
  const base = instantiateBuiltInPreset("stk-home-v1", {
    randomUUID: () => `15200000-0000-4000-8000-${String(++serial).padStart(12, "0")}`,
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
      const ctas = Array.isArray(content.ctas) ? content.ctas : [];
      content.ctas = [...ctas, {
        id: "exhibitor-apply", label: { ko: "참가기업 신청" }, destinationId: "exhibitor-apply",
        variant: "primary", audience: "exhibitor", campaignIds: ["exhibitor-recruitment"], priority: 0,
        fallback: false, enabled: true,
      }];
      ids.add("exhibitor-apply");
    }
    if (section.type === "exhibition-grid" && Array.isArray(content.items)) {
      content.items = content.items.map((row, index) => ({ ...(row as Record<string, unknown>), symbol: image(`editor-exhibition-${index + 1}`) }));
    }
    if (section.type === "speaker-carousel" && Array.isArray(content.speakers)) {
      content.speakers = content.speakers.map((row, index) => ({ ...(row as Record<string, unknown>), image: image(`editor-speaker-${index + 1}`) }));
    }
    if (section.type === "sponsor-marquee") {
      const group = Array.isArray(content.groups) ? content.groups[0] as Record<string, unknown> : null;
      content.sponsors = group ? [
        { id: "editor-partner-a", name: "Editor Partner A", logo: image("editor-partner-a"), groupId: group.id, order: 0, enabled: true },
        { id: "editor-partner-b", name: "Editor Partner B", logo: image("editor-partner-b"), groupId: group.id, order: 1, enabled: true },
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
        id, label: id,
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

function pageDto(config: ExpoPageConfigV2): ExpoPageEditorDto {
  return {
    id: PAGE_ID,
    siteId: SITE_ID,
    slug: "home",
    title: "STK 2027",
    imwebUrl: "https://imweb.example.com/stk",
    draft: config,
    draftRevision: 15,
    codeDigest: "draft-browser-harness",
    publishedCodeDigest: "published-browser-harness",
    hasPublished: true,
    publishedAt: "2027-01-14T00:00:00.000Z",
    liveAt: null,
    updatedAt: "2027-01-15T00:00:00.000Z",
    readiness: {
      canPublish: true,
      canGoLive: true,
      publishIssues: [],
      liveIssues: [],
      notes: [{ code: "draft-ahead-of-published", message: "발행 뒤에 고친 내용이 있어요." }],
    },
    snippets: {
      ok: true,
      page: { src: "https://mach.invalid/h/stk-editor-page", code: "<script></script><div data-mach-expo></div>" },
      sections: [],
    },
    exportSections: config.sections.map((section) => ({ sid: section.sid, label: section.type === "exhibition-grid" ? "STK 하위 전시" : section.type })),
  };
}

type HarnessStore = {
  dto: ExpoPageEditorDto;
  published: ExpoPageConfigV2;
  saveCount: number;
  requestCount: number;
  conflictNext: boolean;
  exportIssueNext: boolean;
  revisions: Array<{
    id: string; sequence: number; codeDigest: string; publishedBy: string;
    publisher: { id: string; name: string; email: null }; createdAt: string;
    summary: { preset: string; sectionCount: number; campaignCount: number; destinationCount: number };
  }>;
};

function cloneDto(value: ExpoPageEditorDto): ExpoPageEditorDto {
  return structuredClone(value);
}

function downloadHtml(scope: string, store: HarnessStore): string {
  return `<!doctype html>\n<!-- Mach Expo in-memory transport: scope=${scope} revision=${store.dto.draftRevision} exportedAt=${FIXED_NOW.toISOString()} campaigns=exhibitor-recruitment:on,visitor-registration:off -->\n<html><body><main data-mach-expo-standalone>${scope}</main><a href="${CDN}/destinations/booth-inquiry">modal fallback</a></body></html>`;
}

function RuntimePreview({ config, selectedSid, onSelect }: {
  config: ExpoPageConfigV2;
  selectedSid: string | null;
  onSelect(sid: string): void;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [campaignState, setCampaignState] = useState<CampaignPreviewMode>("current");

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;
    const resolved = buildExpoPayload(normalizeExpoPage(config), {
      locale: "ko", pages: [], now: FIXED_NOW,
      forcedCampaigns: forcedCampaignsForPreview(campaignState),
    });
    const click = (event: MouseEvent) => {
      const section = event.composedPath().find((node) => node instanceof HTMLElement && node.hasAttribute("data-msx-sid")) as HTMLElement | undefined;
      const sid = section?.dataset.msxSid;
      if (sid) onSelect(sid);
    };
    container.addEventListener("click", click);
    const handle = mountExpo({
      container,
      payload: {
        pageId: PAGE_ID,
        theme: { ...EXPO_DEFAULT_THEME, accent: "#ff7a00", darkBg: "#0b0c0e" },
        origin: "test://db-free",
        sections: resolved.sections,
        campaigns: resolved.campaigns,
        destinations: resolved.destinations,
        locale: "ko",
        mode: "preview-draft",
      },
    });
    return () => {
      container.removeEventListener("click", click);
      handle?.destroy();
    };
  }, [campaignState, config, onSelect]);

  return (
    <aside className="space-y-2" aria-label="실제 STK 미리보기">
      <div className="flex flex-wrap gap-1" aria-label="캠페인 미리보기 상태">
        {(["current", "exhibitor", "visitor", "both", "ended"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={campaignState === mode}
            onClick={() => setCampaignState(campaignPreviewMode(mode))}
            className="rounded border border-border px-2 py-1 text-[11px]"
          >{mode}</button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground" data-testid="preview-selected">selected:{selectedSid ?? "none"}</p>
      <div ref={mountRef} data-mach-expo data-testid="actual-runtime-preview" className="max-h-[70vh] min-h-40 overflow-auto rounded border border-border" />
    </aside>
  );
}

export default function ExpoStkEditorHarness() {
  if (process.env.NODE_ENV === "production") notFound();
  return <EditorHarness />;
}

function EditorHarness() {
  const searchParams = useSearchParams();
  const viewer = searchParams.get("viewer") === "1";
  const [store, setStore] = useState<HarnessStore>(() => {
    const config = editorFixture();
    return {
      dto: pageDto(config),
      published: structuredClone(config),
      saveCount: 0,
      requestCount: 0,
      conflictNext: false,
      exportIssueNext: false,
      revisions: [{
        id: "revision-15", sequence: 15, codeDigest: "1234567890abcdef", publishedBy: "harness-user",
        publisher: { id: "harness-user", name: "브라우저 하니스", email: null }, createdAt: "2027-01-14T00:00:00.000Z",
        summary: { preset: "stk-home-v1", sectionCount: 6, campaignCount: 2, destinationCount: 18 },
      }],
    };
  });
  const storeRef = useRef(store);
  const replaceStore = useCallback((next: HarnessStore) => {
    storeRef.current = next;
    setStore(next);
  }, []);

  const transport = useMemo<ExpoPageTransport>(() => ({
    async load(pageId) {
      if (pageId !== PAGE_ID) throw new Error("page-scope");
      return cloneDto(storeRef.current.dto);
    },
    async save(pageId: string, request: ExpoPageSaveRequest) {
      if (pageId !== PAGE_ID) throw new Error("page-scope");
      const next = structuredClone(storeRef.current);
      next.saveCount += 1;
      if (next.conflictNext) {
        next.conflictNext = false;
        replaceStore(next);
        return { kind: "conflict" as const, revision: next.dto.draftRevision + 1 };
      }
      next.dto = {
        ...next.dto,
        title: request.title,
        imwebUrl: request.imwebUrl || null,
        draft: normalizeExpoPage(request.draft),
        draftRevision: next.dto.draftRevision + 1,
        updatedAt: new Date(FIXED_NOW.getTime() + next.saveCount * 1000).toISOString(),
      };
      replaceStore(next);
      return { kind: "saved" as const, revision: next.dto.draftRevision, codeDigest: `saved-${next.dto.draftRevision}` };
    },
    async request(path, init) {
      const next = structuredClone(storeRef.current);
      next.requestCount += 1;
      if (path.endsWith("/publish")) {
        next.published = structuredClone(next.dto.draft);
        const sequence = next.revisions[0].sequence + 1;
        next.revisions.unshift({
          ...next.revisions[0], id: `revision-${sequence}`, sequence,
          codeDigest: `${sequence}234567890abcdef`, createdAt: FIXED_NOW.toISOString(),
        });
        next.dto = {
          ...next.dto, hasPublished: true, publishedAt: FIXED_NOW.toISOString(),
          publishedCodeDigest: next.dto.codeDigest,
          readiness: { ...next.dto.readiness, notes: [] },
        };
        replaceStore(next);
        return Response.json({ page: { id: PAGE_ID } });
      }
      if (path.endsWith("/live")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { live?: boolean };
        next.dto = { ...next.dto, liveAt: body.live ? FIXED_NOW.toISOString() : null };
        replaceStore(next);
        return Response.json({ page: { id: PAGE_ID } });
      }
      if (path.endsWith("/revisions")) {
        replaceStore(next);
        return Response.json({ revisions: next.revisions });
      }
      if (path.includes("/rollback")) {
        const sequence = next.revisions[0].sequence + 1;
        next.revisions.unshift({ ...next.revisions[0], id: `revision-${sequence}`, sequence, createdAt: FIXED_NOW.toISOString() });
        replaceStore(next);
        return Response.json({ revision: { sequence } });
      }
      if (path.endsWith("/export")) {
        const scope = JSON.parse(String(init?.body ?? "{}")) as { scope?: string; sid?: string };
        if (next.exportIssueNext) {
          next.exportIssueNext = false;
          const exhibition = next.dto.draft.sections.find((section) => section.type === "exhibition-grid")!;
          replaceStore(next);
          return Response.json({
            error: "fixture issue",
            issues: [{
              path: "sections[1].content.items[0].symbol.url",
              code: "standalone-media-public-https",
              message: "공개 HTTPS 심볼 주소가 필요해요.",
              severity: "error",
              sid: exhibition.sid,
            }],
          }, { status: 422 });
        }
        const scopeName = scope.scope === "section" ? `section:${scope.sid ?? "missing"}` : "page";
        replaceStore(next);
        return new Response(downloadHtml(scopeName, next), {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "content-disposition": `attachment; filename="mach-expo-${scope.scope === "section" ? "section" : "page"}-r${next.dto.draftRevision}.html"`,
          },
        });
      }
      replaceStore(next);
      return Response.json({ error: "unknown in-memory request" }, { status: 404 });
    },
  }), [replaceStore]);

  const permissions = viewer
    ? { canEdit: false, canPublish: false, canManageSite: false, canManageTemplates: false }
    : { canEdit: true, canPublish: true, canManageSite: true, canManageTemplates: true };

  return (
    <div className="min-h-screen bg-background p-3 sm:p-6">
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-sm font-semibold">STK DB-free editor harness</h1>
        <output data-testid="save-count" className="text-xs">saves:{store.saveCount}</output>
        <output data-testid="request-count" className="text-xs">requests:{store.requestCount}</output>
        {!viewer ? <>
          <button type="button" data-testid="conflict-next" onClick={() => replaceStore({ ...storeRef.current, conflictNext: true })} className="rounded border px-2 py-1 text-xs">다음 저장 409</button>
          <button type="button" data-testid="export-issue-next" onClick={() => replaceStore({ ...storeRef.current, exportIssueNext: true })} className="rounded border px-2 py-1 text-xs">다음 내보내기 오류</button>
        </> : null}
      </header>
      <PageDraftWorkspace
        siteId={SITE_ID}
        pageId={PAGE_ID}
        permissions={permissions}
        transport={transport}
        pages={[]}
        sources={[]}
        renderPreview={(state) => (
          <RuntimePreview config={state.config} selectedSid={state.selectedSid} onSelect={state.setSelectedSid} />
        )}
      />
    </div>
  );
}
