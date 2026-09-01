// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  expoPage: { findFirst: vi.fn(), update: vi.fn() },
  expoPageRevision: { findMany: vi.fn(), findFirst: vi.fn() },
  user: { findMany: vi.fn() },
  $transaction: vi.fn(),
};
const guardExpoRoute = vi.fn();
const rollbackPageRevision = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/expo/route-guard", () => ({
  guardExpoRoute,
  authFailure: (failure: { kind: string }) => new Response(JSON.stringify({ error: failure.kind }), { status: failure.kind === "forbidden" ? 403 : 404 }),
}));
vi.mock("@/lib/expo/revision-service", () => ({ rollbackPageRevision }));

const page = {
  id: "page-1", siteId: "site-1", draft: { schemaVersion: 2, sections: [] }, draftRevision: 12, published: null,
  site: { id: "site-1", workspaceId: "workspace-1", projectId: "project-1" },
};
const revision = (sequence: number, publishedBy = "user-1") => ({
  id: `revision-${sequence}`, sequence, codeDigest: `digest-${sequence}`, publishedBy,
  createdAt: new Date("2026-09-01T04:00:00.000Z"),
  snapshot: { schemaVersion: 2, preset: "stk-home-v1", sections: [{ id: sequence }], settings: { campaigns: [{ id: "campaign" }], destinations: [{ id: "destination" }] } },
});

function context(projectRole: "VIEWER" | "EDITOR" = "EDITOR", publicEmbed = true) {
  return {
    caps: { publicEmbed }, userId: "editor-1", memberWorkspaceIds: ["workspace-1"],
    workspaceRole: () => "MEMBER" as const,
    projectRole: () => projectRole,
  };
}
function read() { return new Request("https://app.test/api/expo/pages/page-1/revisions"); }
function write() {
  return new Request("https://app.test/api/expo/pages/page-1/revisions/revision-7/rollback", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}",
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  guardExpoRoute.mockResolvedValue({ ok: true, ctx: context() });
  prismaMock.expoPage.findFirst.mockResolvedValue(page);
  prismaMock.expoPageRevision.findMany.mockResolvedValue([revision(7)]);
  prismaMock.expoPageRevision.findFirst.mockResolvedValue({ id: "revision-7" });
  prismaMock.user.findMany.mockResolvedValue([{ id: "user-1", name: "발행자", email: "publisher@example.com" }]);
  prismaMock.$transaction.mockImplementation(async (work: (tx: typeof prismaMock) => unknown) => work(prismaMock));
  rollbackPageRevision.mockResolvedValue({ ok: true, pageId: "page-1", revisionId: "revision-9", sequence: 9, codeDigest: "digest-9" });
});

describe("Expo revision routes", () => {
  it("allows a VIEWER to read the latest 20 revisions, newest first", async () => {
    guardExpoRoute.mockResolvedValue({ ok: true, ctx: context("VIEWER") });
    const { GET } = await import("@/app/api/expo/pages/[pageId]/revisions/route");

    const response = await GET(read(), { params: Promise.resolve({ pageId: "page-1" }) });

    expect(response.status).toBe(200);
    expect(prismaMock.expoPageRevision.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { pageId: "page-1" }, orderBy: { sequence: "desc" }, take: 20,
    }));
    const body = await response.json();
    expect(body.revisions[0].sequence).toBe(7);
    expect(body.revisions[0].publisher).toMatchObject({ name: "발행자" });
    expect(body.revisions[0].summary.sectionCount).toEqual(expect.any(Number));
  });

  it("returns a null publisher when the historic user was deleted", async () => {
    prismaMock.user.findMany.mockResolvedValue([]);
    const { GET } = await import("@/app/api/expo/pages/[pageId]/revisions/route");
    const response = await GET(read(), { params: Promise.resolve({ pageId: "page-1" }) });
    expect((await response.json()).revisions[0].publisher).toBeNull();
  });

  it("lets an EDITOR roll back, retaining the current draft and passing the normal release gate", async () => {
    guardExpoRoute.mockResolvedValue({ ok: true, ctx: context("EDITOR", false) });
    const { POST } = await import("@/app/api/expo/pages/[pageId]/revisions/[revisionId]/rollback/route");
    const response = await POST(write(), { params: Promise.resolve({ pageId: "page-1", revisionId: "revision-7" }) });

    expect(response.status).toBe(200);
    expect(rollbackPageRevision).toHaveBeenCalledWith(prismaMock, expect.objectContaining({
      pageId: "page-1", revisionId: "revision-7", publicEmbedEnabled: false,
    }));
    expect(prismaMock.expoPage.update).not.toHaveBeenCalled();
    expect(page.draftRevision).toBe(12);
  });

  it("forbids a VIEWER from rolling back", async () => {
    guardExpoRoute.mockResolvedValue({ ok: true, ctx: context("VIEWER") });
    const { POST } = await import("@/app/api/expo/pages/[pageId]/revisions/[revisionId]/rollback/route");
    expect((await POST(write(), { params: Promise.resolve({ pageId: "page-1", revisionId: "revision-7" }) })).status).toBe(403);
    expect(rollbackPageRevision).not.toHaveBeenCalled();
  });

  it("returns 404 before rollback when the revision belongs to another URL page", async () => {
    prismaMock.expoPageRevision.findFirst.mockResolvedValue(null);
    const { POST } = await import("@/app/api/expo/pages/[pageId]/revisions/[revisionId]/rollback/route");
    expect((await POST(write(), { params: Promise.resolve({ pageId: "page-1", revisionId: "revision-7" }) })).status).toBe(404);
    expect(rollbackPageRevision).not.toHaveBeenCalled();
  });
});
