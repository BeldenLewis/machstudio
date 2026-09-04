// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 미디어(자료실) API — sign(자리 내주기) · POST(등록) · GET(목록) · DELETE.
 *
 * 실제 파일 바이트는 이 라우트들을 거치지 않는다(브라우저가 Storage 로 직접 올린다).
 * 그래서 여기서 지키는 것은 세 가지다: ① 크기 판정이 실제로 라우트에서 도는가(형식은
 * 막지 않는다 — 한글·엑셀·CSV 등 전부 받는다) ② 경로에서 소속을 읽어 남의 자리에
 * 등록 못 하게 막는가 ③ 삭제는 올린 사람·관리자만.
 */

const prismaMock = {
  workspaceMember: { findFirst: vi.fn() },
  project: { findFirst: vi.fn() },
  mediaAsset: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
};
const getUser = vi.fn();
const logActivity = vi.fn();

/** `.from(bucket)` 이 항상 같은 참조를 돌려줘서 어느 메서드가 몇 번 불렸는지 그대로 잰다. */
const storageApi = {
  list: vi.fn(),
  getPublicUrl: vi.fn(),
  remove: vi.fn(),
  createSignedUploadUrl: vi.fn(),
};
/** 버킷 관리 메서드는 파일 API(.from())가 아니라 storage 객체 자신에 있다(ensureMediaBucket). */
const bucketApi = { getBucket: vi.fn(), createBucket: vi.fn(), updateBucket: vi.fn() };
const adminMock = { storage: { from: () => storageApi, ...bucketApi } };

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser } }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminMock }));
vi.mock("@/lib/activity", () => ({ logActivity: (...args: unknown[]) => logActivity(...args) }));

const MEMBERSHIP = { workspaceId: "w1", role: "MEMBER", userId: "u1" };

const json = (body: unknown) =>
  new Request("https://machstudio.vercel.app/api/media", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  prismaMock.workspaceMember.findFirst.mockResolvedValue(MEMBERSHIP);
  bucketApi.getBucket.mockResolvedValue({ error: null });
  bucketApi.updateBucket.mockResolvedValue({ error: null });
});

describe("로그인 필요", () => {
  it("로그인 안 했으면 셋 다 401", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const { POST: sign } = await import("@/app/api/media/sign/route");
    const { GET, POST } = await import("@/app/api/media/route");
    const { DELETE: del } = await import("@/app/api/media/[id]/route");

    expect((await sign(json({}))).status).toBe(401);
    expect((await GET(new Request("https://x/api/media"))).status).toBe(401);
    expect((await POST(json({}))).status).toBe(401);
    expect((await del(new Request("https://x", { method: "DELETE" }), { params: Promise.resolve({ id: "a1" }) })).status).toBe(401);
  });
});

describe("sign — 자리를 내준다, 바이트는 안 받는다", () => {
  /** 형식은 막지 않는다 — 한글·엑셀·CSV 같은 문서도 그대로 자리를 내준다. */
  it("허용 목록 밖 MIME(PDF)도 자리를 내준다 — 형식으로 거절하지 않는다", async () => {
    storageApi.createSignedUploadUrl.mockResolvedValue({ data: { path: "w1/workspace/x", token: "tok" }, error: null });
    const { POST } = await import("@/app/api/media/sign/route");
    const res = await POST(json({ mimeType: "application/pdf", size: 100, originalName: "보고서.pdf" }));
    expect(res.status).toBe(200);
    expect(storageApi.createSignedUploadUrl).toHaveBeenCalled();
  });

  /** 확장자는 MIME 이 아니라 원본 파일 이름에서 뽑는다(문서 MIME 은 못 믿는다). */
  it("경로의 확장자는 원본 파일 이름에서 뽑는다", async () => {
    storageApi.createSignedUploadUrl.mockImplementation(async () => ({ data: { path: "ignored", token: "tok" }, error: null }));
    const { POST } = await import("@/app/api/media/sign/route");
    await POST(json({ mimeType: "application/x-hwp", size: 100, originalName: "보고서.HWP" }));
    const calledPath = storageApi.createSignedUploadUrl.mock.calls[0][0] as string;
    expect(calledPath.endsWith(".hwp")).toBe(true);
  });

  it("원본 이름에서 확장자를 못 뽑아도 실패하지 않는다 — 확장자 없이 자리를 내준다", async () => {
    storageApi.createSignedUploadUrl.mockImplementation(async () => ({ data: { path: "ignored", token: "tok" }, error: null }));
    const { POST } = await import("@/app/api/media/sign/route");
    const res = await POST(json({ mimeType: "application/octet-stream", size: 100, originalName: "이름만있음" }));
    expect(res.status).toBe(200);
    const calledPath = storageApi.createSignedUploadUrl.mock.calls[0][0] as string;
    expect(calledPath.includes(".")).toBe(false);
  });

  it("상한을 넘으면 거절한다", async () => {
    const { POST } = await import("@/app/api/media/sign/route");
    const res = await POST(json({ mimeType: "image/png", size: 999_999_999 }));
    expect(res.status).toBe(400);
  });

  it("정상 요청은 경로·토큰을 받아 돌려준다", async () => {
    storageApi.createSignedUploadUrl.mockResolvedValue({ data: { path: "w1/workspace/x.png", token: "tok" }, error: null });
    const { POST } = await import("@/app/api/media/sign/route");
    const res = await POST(json({ mimeType: "image/png", size: 1024 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.path).toBe("w1/workspace/x.png");
    expect(body.token).toBe("tok");
  });

  /** 워크스페이스가 경로 맨 앞에 실려야 나중에 POST /api/media 가 소속을 확인할 수 있다. */
  it("발급한 경로가 이 사용자의 워크스페이스로 시작한다", async () => {
    storageApi.createSignedUploadUrl.mockImplementation(async () => ({ data: { path: "ignored", token: "tok" }, error: null }));
    const { POST } = await import("@/app/api/media/sign/route");
    await POST(json({ mimeType: "image/png", size: 1024 }));
    const calledPath = storageApi.createSignedUploadUrl.mock.calls[0][0] as string;
    expect(calledPath.startsWith("w1/workspace/")).toBe(true);
  });

  it("남의 프로젝트를 지정하면 404 — 실제로 이 워크스페이스 소속인지 확인한다", async () => {
    prismaMock.project.findFirst.mockResolvedValue(null);
    const { POST } = await import("@/app/api/media/sign/route");
    const res = await POST(json({ mimeType: "image/png", size: 1024, projectId: "p-other" }));
    expect(res.status).toBe(404);
    expect(storageApi.createSignedUploadUrl).not.toHaveBeenCalled();
  });
});

describe("POST /api/media — 등록", () => {
  it("경로가 다른 워크스페이스로 시작하면 거절한다", async () => {
    const { POST } = await import("@/app/api/media/route");
    const res = await POST(json({ path: "other-ws/workspace/x.png", mimeType: "image/png", size: 100, originalName: "x.png" }));
    expect(res.status).toBe(403);
    expect(prismaMock.mediaAsset.create).not.toHaveBeenCalled();
  });

  /** 실제로 올라온 적 없는 경로로 등록을 시도해도 죽은 행이 생기면 안 된다. */
  it("스토리지에 실제로 없으면 409 — 죽은 행을 만들지 않는다", async () => {
    storageApi.list.mockResolvedValue({ data: [], error: null });
    const { POST } = await import("@/app/api/media/route");
    const res = await POST(json({ path: "w1/workspace/x.png", mimeType: "image/png", size: 100, originalName: "x.png" }));
    expect(res.status).toBe(409);
    expect(prismaMock.mediaAsset.create).not.toHaveBeenCalled();
  });

  it("정상 등록 — projectId 는 경로의 'workspace' 세그먼트면 null 이 된다", async () => {
    storageApi.list.mockResolvedValue({ data: [{ name: "x.png" }], error: null });
    storageApi.getPublicUrl.mockReturnValue({ data: { publicUrl: "https://cdn/x.png" } });
    prismaMock.mediaAsset.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "a1", ...data }));

    const { POST } = await import("@/app/api/media/route");
    const res = await POST(json({ path: "w1/workspace/x.png", mimeType: "image/webp", size: 2048, originalName: "사진.webp", width: 800, height: 600 }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.asset.projectId).toBeNull();
    expect(body.asset.url).toBe("https://cdn/x.png");
    expect(body.asset.kind).toBe("image");
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "media.uploaded" }));
  });

  it("프로젝트 경로면 그 프로젝트로 등록된다", async () => {
    storageApi.list.mockResolvedValue({ data: [{ name: "x.mp4" }], error: null });
    storageApi.getPublicUrl.mockReturnValue({ data: { publicUrl: "https://cdn/x.mp4" } });
    prismaMock.mediaAsset.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "a2", ...data }));

    const { POST } = await import("@/app/api/media/route");
    const res = await POST(json({ path: "w1/proj123/x.mp4", mimeType: "video/mp4", size: 4096, originalName: "clip.mp4", durationSec: 12.7 }));
    const body = await res.json();
    expect(body.asset.projectId).toBe("proj123");
    expect(body.asset.durationSec).toBe(13); // 반올림
  });
});

describe("GET /api/media — 목록", () => {
  it("워크스페이스로 좁혀서 조회한다", async () => {
    prismaMock.mediaAsset.findMany.mockResolvedValue([]);
    const { GET } = await import("@/app/api/media/route");
    await GET(new Request("https://x/api/media"));
    expect(prismaMock.mediaAsset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: "w1" }) }),
    );
  });

  it("projectId 를 주면 그것으로 좁힌다", async () => {
    prismaMock.mediaAsset.findMany.mockResolvedValue([]);
    const { GET } = await import("@/app/api/media/route");
    await GET(new Request("https://x/api/media?projectId=p9"));
    expect(prismaMock.mediaAsset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: "w1", projectId: "p9" }) }),
    );
  });
});

describe("DELETE /api/media/[id]", () => {
  const del = async (id: string) => {
    const { DELETE } = await import("@/app/api/media/[id]/route");
    return DELETE(new Request("https://x", { method: "DELETE" }), { params: Promise.resolve({ id }) });
  };

  it("없으면 404", async () => {
    prismaMock.mediaAsset.findFirst.mockResolvedValue(null);
    expect((await del("nope")).status).toBe(404);
  });

  it("올린 사람이 아니고 MEMBER 면 403 — 삭제를 지운다", async () => {
    prismaMock.mediaAsset.findFirst.mockResolvedValue({ id: "a1", workspaceId: "w1", createdById: "다른사람", path: "w1/workspace/x.png" });
    const res = await del("a1");
    expect(res.status).toBe(403);
    expect(prismaMock.mediaAsset.delete).not.toHaveBeenCalled();
  });

  it("올린 사람 본인은 지울 수 있다", async () => {
    prismaMock.mediaAsset.findFirst.mockResolvedValue({ id: "a1", workspaceId: "w1", createdById: "u1", path: "w1/workspace/x.png" });
    storageApi.remove.mockResolvedValue({ error: null });
    const res = await del("a1");
    expect(res.status).toBe(200);
    expect(prismaMock.mediaAsset.delete).toHaveBeenCalledWith({ where: { id: "a1" } });
    expect(storageApi.remove).toHaveBeenCalledWith(["w1/workspace/x.png"]);
  });

  it("본인이 아니어도 ADMIN 이면 지울 수 있다", async () => {
    prismaMock.workspaceMember.findFirst.mockResolvedValue({ ...MEMBERSHIP, role: "ADMIN" });
    prismaMock.mediaAsset.findFirst.mockResolvedValue({ id: "a1", workspaceId: "w1", createdById: "다른사람", path: "w1/workspace/x.png" });
    storageApi.remove.mockResolvedValue({ error: null });
    const res = await del("a1");
    expect(res.status).toBe(200);
  });

  /** 스토리지 정리가 실패해도 사용자 입장의 삭제(DB 행)는 이미 성공했어야 한다. */
  it("스토리지 정리가 실패해도 200 을 돌려준다 — DB 삭제가 먼저다", async () => {
    prismaMock.mediaAsset.findFirst.mockResolvedValue({ id: "a1", workspaceId: "w1", createdById: "u1", path: "w1/workspace/x.png" });
    storageApi.remove.mockResolvedValue({ error: { message: "boom" } });
    const res = await del("a1");
    expect(res.status).toBe(200);
    expect(prismaMock.mediaAsset.delete).toHaveBeenCalled();
  });
});
