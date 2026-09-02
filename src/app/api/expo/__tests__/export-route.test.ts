// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  expoPage: { findFirst: vi.fn(), findMany: vi.fn() },
  expoPageRevision: { findFirst: vi.fn() },
}));
const prepareStandaloneExpoHtml = vi.hoisted(() => vi.fn());
let projectRole: "EDITOR" | "VIEWER" = "EDITOR";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/expo/export", () => ({ prepareStandaloneExpoHtml }));
vi.mock("@/lib/expo/route-guard", async () => {
  const { NextResponse } = await import("next/server");
  return {
    guardExpoRoute: vi.fn(async () => ({
      ok: true,
      ctx: {
        userId: "user-1",
        memberWorkspaceIds: ["workspace-1"],
        workspaceRole: () => "MEMBER",
        projectRole: () => projectRole,
      },
    })),
    authFailure: (failure: { kind: string }) => NextResponse.json({ error: failure.kind }, { status: failure.kind === "forbidden" ? 403 : 404 }),
    readJsonBody: async (request: Request) => {
      try {
        return { ok: true, body: JSON.parse(await request.text() || "{}") as Record<string, unknown> } as const;
      } catch {
        return { ok: false, response: NextResponse.json({ error: "bad-body" }, { status: 400 }) } as const;
      }
    },
  };
});

const { POST } = await import("@/app/api/expo/pages/[pageId]/export/route");

const SID = "11111111-1111-1111-1111-111111111111";
const published = {
  schemaVersion: 2,
  sections: [{
    sid: SID, type: "kv", variant: "column", enabled: true, embedEnabled: false,
    design: {}, content: { title: { ko: "STK" }, cta: { label: "오시는 길", href: "page:sibling-1" } },
  }],
};
const page = {
  id: "page-1", siteId: "site-1", published,
  site: {
    id: "site-1", workspaceId: "workspace-1", projectId: "project-1",
    theme: { accent: "#ff8500", lightBg: "#ffffff", darkBg: "#111318" }, defaultLocale: "ko",
  },
};

function request(body: unknown) {
  return new Request("https://mach.test/api/expo/pages/page-1/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  projectRole = "EDITOR";
  prismaMock.expoPage.findFirst.mockResolvedValue(page);
  prismaMock.expoPage.findMany.mockResolvedValue([{ id: "sibling-1", imwebUrl: "https://smarttechkorea.com/directions", deletedAt: null }]);
  prismaMock.expoPageRevision.findFirst.mockResolvedValue({ sequence: 7, codeDigest: "canonical-digest" });
  prepareStandaloneExpoHtml.mockReturnValue({ ok: true, filename: "mach-expo-page-page-1-r7.html", html: "<!doctype html>" });
});

describe("Expo standalone export route", () => {
  it("allows EDITOR, derives every value from the URL-owned published snapshot, and downloads ASCII HTML", async () => {
    const response = await POST(request({ scope: "page" }), { params: Promise.resolve({ pageId: "page-1" }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="mach-expo-page-page-1-r7.html"');
    expect(await response.text()).toBe("<!doctype html>");
    expect(prismaMock.expoPage.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ["sibling-1"] }, siteId: "site-1", deletedAt: null },
    }));
    expect(prepareStandaloneExpoHtml).toHaveBeenCalledWith(expect.objectContaining({
      pageId: "page-1",
      revisionSequence: 7,
      revisionCodeDigest: "canonical-digest",
      scope: { type: "page" },
      config: expect.objectContaining({
        schemaVersion: 2,
        sections: [expect.objectContaining({ sid: SID, content: published.sections[0].content })],
      }),
      locale: "ko",
      pages: [{ id: "sibling-1", imwebUrl: "https://smarttechkorea.com/directions", deletedAt: null }],
      exportedAt: expect.any(Date),
    }));
  });

  it("allows a section scope without trusting embedEnabled", async () => {
    await POST(request({ scope: "section", sid: SID }), { params: Promise.resolve({ pageId: "page-1" }) });
    expect(prepareStandaloneExpoHtml).toHaveBeenCalledWith(expect.objectContaining({ scope: { type: "section", sid: SID } }));
  });

  it("passes the stored snapshot to the builder before lossy public normalization", async () => {
    const unsafePublished = {
      ...published,
      sections: [{
        ...published.sections[0],
        content: {
          ...published.sections[0].content,
          media: { kind: "image", url: "http://127.0.0.1/private.jpg" },
        },
      }],
    };
    prismaMock.expoPage.findFirst.mockResolvedValue({ ...page, published: unsafePublished });

    await POST(request({ scope: "page" }), { params: Promise.resolve({ pageId: "page-1" }) });

    expect(prepareStandaloneExpoHtml).toHaveBeenCalledWith(expect.objectContaining({ config: unsafePublished }));
  });

  it("rejects VIEWER before revision, sibling, or export work", async () => {
    projectRole = "VIEWER";
    const response = await POST(request({ scope: "page" }), { params: Promise.resolve({ pageId: "page-1" }) });
    expect(response.status).toBe(403);
    expect(prismaMock.expoPageRevision.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.expoPage.findMany).not.toHaveBeenCalled();
    expect(prepareStandaloneExpoHtml).not.toHaveBeenCalled();
  });

  it("부모 사이트가 소프트 삭제된 알려진 페이지를 내보내지 않는다", async () => {
    prismaMock.expoPage.findFirst.mockImplementation(async (args) =>
      args.where?.site?.deletedAt === null ? null : { ...page, site: { ...page.site, deletedAt: new Date() } });

    const response = await POST(request({ scope: "page" }), { params: Promise.resolve({ pageId: "page-1" }) });

    expect(response.status).toBe(404);
    expect(prismaMock.expoPage.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "page-1", deletedAt: null, site: { deletedAt: null } },
    }));
    expect(prepareStandaloneExpoHtml).not.toHaveBeenCalled();
  });

  it("never accepts a client snapshot, time, campaign override, or revision metadata", async () => {
    const response = await POST(request({
      scope: "page",
      snapshot: { sections: [] },
      exportedAt: "2099-01-01T00:00:00.000Z",
      campaigns: { "exhibitor-recruitment": false },
      revisionSequence: 999,
      revisionCodeDigest: "client-digest",
    }), { params: Promise.resolve({ pageId: "page-1" }) });
    expect(response.status).toBe(400);
    expect(prepareStandaloneExpoHtml).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { scope: "section" },
    { scope: "section", sid: "" },
    { scope: "other" },
  ])("rejects an invalid scope body %#", async (body) => {
    const response = await POST(request(body), { params: Promise.resolve({ pageId: "page-1" }) });
    expect(response.status).toBe(400);
    expect(prepareStandaloneExpoHtml).not.toHaveBeenCalled();
  });

  it("returns structured canonical-digest conflicts from the pure builder", async () => {
    prepareStandaloneExpoHtml.mockReturnValue({
      ok: false,
      status: 409,
      issues: [{ path: "revision", code: "standalone-republish-required", message: "다시 발행해 주세요", severity: "error" }],
    });
    const response = await POST(request({ scope: "page" }), { params: Promise.resolve({ pageId: "page-1" }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "standalone-republish-required", issues: [{ path: "revision" }] });
  });
});
