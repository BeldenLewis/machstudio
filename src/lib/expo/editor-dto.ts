import type { ReadinessIssue } from "@/lib/expo/readiness";
import type { ExpoPageConfigV2 } from "@/lib/expo/types";
import type { ExpoSaveOutcome } from "@/lib/expo/use-page-autosave";

export interface ExpoSnippetView {
  code: string;
  src: string;
}

export interface ExpoSectionSnippetView {
  sid: string;
  label: string;
  snippet: ExpoSnippetView;
  issues: ReadinessIssue[];
}

export type ExpoSnippetsView =
  | { ok: true; page: ExpoSnippetView; sections: ExpoSectionSnippetView[] }
  | { ok: false; message: string };

export interface ExpoReadinessView {
  canPublish: boolean;
  canGoLive: boolean;
  publishIssues: ReadinessIssue[];
  liveIssues: ReadinessIssue[];
  notes: ReadinessIssue[];
}

export interface ExpoPageEditorDto {
  id: string;
  siteId: string;
  slug: string;
  title: string;
  imwebUrl: string | null;
  draft: ExpoPageConfigV2;
  draftRevision: number;
  codeDigest: string;
  publishedCodeDigest: string;
  hasPublished: boolean;
  publishedAt: string | null;
  liveAt: string | null;
  updatedAt: string;
  readiness: ExpoReadinessView;
  snippets: ExpoSnippetsView;
  lastSeenAt?: string | null;
  lastSeenOrigin?: string | null;
}

export interface ExpoPageSaveRequest {
  title: string;
  imwebUrl: string;
  draft: ExpoPageConfigV2;
  draftRevision: number;
}

export type ExpoEditorRequest = (path: string, init?: RequestInit) => Promise<Response>;

export interface ExpoPageTransport {
  load(pageId: string): Promise<ExpoPageEditorDto>;
  save(pageId: string, request: ExpoPageSaveRequest): Promise<ExpoSaveOutcome>;
  request: ExpoEditorRequest;
}

function rejection(body: unknown) {
  const raw = body && typeof body === "object" && Array.isArray((body as { errors?: unknown }).errors)
    ? (body as { errors: Array<{ path?: unknown; message?: unknown; sid?: unknown }> }).errors
    : [];
  return raw.map((entry) => ({
    path: typeof entry.path === "string" ? entry.path : "sections",
    message: typeof entry.message === "string" ? entry.message : "저장할 수 없는 값이에요.",
    sid: typeof entry.sid === "string" ? entry.sid : undefined,
  }));
}

/** 브라우저 전역은 주입값이 없을 때만 읽는다. */
export function createExpoPageTransport(
  request: ExpoEditorRequest = (path, init) => window.fetch(path, init),
): ExpoPageTransport {
  return {
    request,
    async load(pageId) {
      const response = await request(`/api/expo/pages/${encodeURIComponent(pageId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("page-load");
      const body = await response.json() as { page?: ExpoPageEditorDto };
      if (!body.page) throw new Error("page-shape");
      return body.page;
    },
    async save(pageId, input) {
      let response: Response;
      try {
        response = await request(`/api/expo/pages/${encodeURIComponent(pageId)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });
      } catch {
        return { kind: "failed" };
      }
      const body = await response.json().catch(() => ({})) as {
        draftRevision?: unknown;
        page?: { draftRevision?: unknown; codeDigest?: unknown };
        errors?: unknown;
      };
      if (response.status === 409) {
        const revision = Number(body.draftRevision ?? input.draftRevision);
        return { kind: "conflict", revision: Number.isFinite(revision) ? revision : input.draftRevision };
      }
      if (response.status === 422) return { kind: "rejected", errors: rejection(body) };
      if (!response.ok) return { kind: "failed" };
      const revision = Number(body.page?.draftRevision ?? input.draftRevision + 1);
      return {
        kind: "saved",
        revision: Number.isFinite(revision) ? revision : input.draftRevision + 1,
        codeDigest: typeof body.page?.codeDigest === "string" ? body.page.codeDigest : undefined,
      };
    },
  };
}
