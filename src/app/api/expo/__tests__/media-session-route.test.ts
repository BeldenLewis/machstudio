// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const guardExpoRoute = vi.fn();
const findSite = vi.fn();
const ensureExpoQuarantineBucket = vi.fn();
const createMediaUploadSession = vi.fn();
const createExpoFinalizeStorage = vi.fn();
const finalizeExpoUpload = vi.fn();

vi.mock("@/lib/expo/route-guard", async () => {
  const actual = await vi.importActual<typeof import("@/lib/expo/route-guard")>("@/lib/expo/route-guard");
  return { ...actual, guardExpoRoute };
});
vi.mock("@/lib/prisma", () => ({ prisma: { expoSite: { findFirst: findSite } } }));
vi.mock("@/lib/expo/quarantine-bucket", () => ({ ensureExpoQuarantineBucket }));
vi.mock("@/lib/expo/media-upload-session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/expo/media-upload-session")>("@/lib/expo/media-upload-session");
  return { ...actual, createMediaUploadSession, createExpoFinalizeStorage, finalizeExpoUpload };
});

const ctx = (projectRole: "VIEWER" | "EDITOR" = "EDITOR") => ({
  caps: { admin: true }, userId: "user1", memberWorkspaceIds: ["ws1"],
  workspaceRole: () => "MEMBER" as const, projectRole: () => projectRole,
});
const request = (body: unknown) => new Request("https://mach.test/api/expo/site1/media/session", {
  method: "POST", headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
  body: JSON.stringify(body),
});

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  guardExpoRoute.mockResolvedValue({ ok: true, ctx: ctx() });
  findSite.mockResolvedValue({ id: "site1", workspaceId: "ws1", projectId: "project1" });
  ensureExpoQuarantineBucket.mockResolvedValue({ storage: {} });
  createMediaUploadSession.mockResolvedValue({
    path: "ws1/expo-quarantine/site1/user1/random.png", token: "one-use", signedUrl: "https://abc.supabase.co/storage/upload/sign/x",
  });
  createExpoFinalizeStorage.mockReturnValue({});
  finalizeExpoUpload.mockResolvedValue({
    kind: "image", url: "https://cdn.test/optimized.webp", originalUrl: "https://cdn.test/original.png",
    mimeType: "image/webp", width: 100, height: 50, bytes: 500,
  });
});

describe("POST /media/finalize", () => {
  const finalizeRequest = () => new Request("https://mach.test/api/expo/site1/media/finalize", {
    method: "POST", headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
    body: JSON.stringify({ path: "ws1/expo-quarantine/site1/user1/x.png", declaredType: "image/png" }),
  });

  it("rechecks URL resource/project/user ownership before finalization", async () => {
    const { POST } = await import("@/app/api/expo/[siteId]/media/finalize/route");
    const res = await POST(finalizeRequest(), { params: Promise.resolve({ siteId: "site1" }) });
    expect(res.status).toBe(201);
    expect(finalizeExpoUpload).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      workspaceId: "ws1", siteId: "site1", userId: "user1",
      path: "ws1/expo-quarantine/site1/user1/x.png",
    }));
  });

  it("rejects VIEWER before admin/storage construction", async () => {
    guardExpoRoute.mockResolvedValue({ ok: true, ctx: ctx("VIEWER") });
    const { POST } = await import("@/app/api/expo/[siteId]/media/finalize/route");
    const res = await POST(finalizeRequest(), { params: Promise.resolve({ siteId: "site1" }) });
    expect(res.status).toBe(403);
    expect(ensureExpoQuarantineBucket).not.toHaveBeenCalled();
    expect(finalizeExpoUpload).not.toHaveBeenCalled();
  });
});

describe("POST /media/session", () => {
  it("returns a private, one-use signed path under exact workspace/site/user ownership", async () => {
    const { POST } = await import("@/app/api/expo/[siteId]/media/session/route");
    const res = await POST(request({ fileName: "hero.png", declaredType: "image/png", bytes: 123 }), {
      params: Promise.resolve({ siteId: "site1" }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ path: "ws1/expo-quarantine/site1/user1/random.png", token: "one-use" });
    expect(createMediaUploadSession).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "ws1", siteId: "site1", userId: "user1",
    }));
    expect(JSON.stringify(await createMediaUploadSession.mock.results[0].value)).not.toContain("/object/public/");
  });

  it("rejects VIEWER before constructing the service-role client", async () => {
    guardExpoRoute.mockResolvedValue({ ok: true, ctx: ctx("VIEWER") });
    const { POST } = await import("@/app/api/expo/[siteId]/media/session/route");
    const res = await POST(request({ fileName: "hero.png", declaredType: "image/png", bytes: 123 }), {
      params: Promise.resolve({ siteId: "site1" }),
    });
    expect(res.status).toBe(403);
    expect(ensureExpoQuarantineBucket).not.toHaveBeenCalled();
  });
});
