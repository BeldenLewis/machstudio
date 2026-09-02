// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 일괄 작업 — 지우기·그룹 담기. 둘 다 "id 목록으로 골라 온다" 는 첫 단계가 같다.
 *
 * 지키는 것: ① id 를 그대로 안 믿고 이 워크스페이스 것만 걸러 온다 ② 삭제는 올린 사람·
 * 관리자만, 아니면 조용히 빼고 skippedIds 로 알린다(전체 실패로 막지 않는다)
 * ③ 그룹 담기는 멤버 전체가 할 수 있다(파괴적이지 않은 정리 동작).
 */

const prismaMock = {
  workspaceMember: { findFirst: vi.fn() },
  mediaAsset: { findMany: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
};
const getUser = vi.fn();
const logActivity = vi.fn();
const storageRemove = vi.fn();
const adminMock = { storage: { from: () => ({ remove: storageRemove }) } };

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser } }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminMock }));
vi.mock("@/lib/activity", () => ({ logActivity: (...args: unknown[]) => logActivity(...args) }));

const MEMBERSHIP = { workspaceId: "w1", role: "MEMBER", userId: "u1" };

const post = async (body: unknown) => {
  const { POST } = await import("@/app/api/media/bulk/route");
  return POST(new Request("https://x/api/media/bulk", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  prismaMock.workspaceMember.findFirst.mockResolvedValue(MEMBERSHIP);
  storageRemove.mockResolvedValue({ error: null });
});

describe("입력 모양", () => {
  it("로그인 안 했으면 401", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await post({ action: "delete", ids: ["a"] })).status).toBe(401);
  });

  it("알 수 없는 action 은 400", async () => {
    expect((await post({ action: "wipe", ids: ["a"] })).status).toBe(400);
  });

  it("ids 가 비어 있으면 400", async () => {
    expect((await post({ action: "delete", ids: [] })).status).toBe(400);
  });

  it("상한(200개)을 넘으면 400 — 아무것도 안 지운다", async () => {
    const ids = Array.from({ length: 201 }, (_, i) => `id${i}`);
    const res = await post({ action: "delete", ids });
    expect(res.status).toBe(400);
    expect(prismaMock.mediaAsset.findMany).not.toHaveBeenCalled();
  });
});

describe("id 를 그대로 안 믿는다 — 이 워크스페이스 것만 걸러 온다", () => {
  it("존재하지 않거나 남의 워크스페이스인 id 는 notFound 로 보고한다", async () => {
    prismaMock.mediaAsset.findMany.mockResolvedValue([]); // 쿼리 자체가 workspaceId 로 좁혀 온다
    const res = await post({ action: "delete", ids: ["남의-것"] });
    const body = await res.json();
    expect(body.notFound).toEqual(["남의-것"]);
    expect(prismaMock.mediaAsset.deleteMany).not.toHaveBeenCalled();
  });

  it("조회는 항상 workspaceId 로 좁힌다", async () => {
    prismaMock.mediaAsset.findMany.mockResolvedValue([]);
    await post({ action: "delete", ids: ["a"] });
    expect(prismaMock.mediaAsset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: "w1" }) }),
    );
  });
});

describe("일괄 삭제", () => {
  it("본인 것과 남의 것이 섞여 있으면 본인 것만 지우고 나머지는 skippedIds", async () => {
    prismaMock.mediaAsset.findMany.mockResolvedValue([
      { id: "mine", path: "w1/workspace/mine.png", createdById: "u1", originalName: "mine.png" },
      { id: "theirs", path: "w1/workspace/theirs.png", createdById: "다른사람", originalName: "theirs.png" },
    ]);
    const res = await post({ action: "delete", ids: ["mine", "theirs"] });
    const body = await res.json();
    expect(body.deletedIds).toEqual(["mine"]);
    expect(body.skippedIds).toEqual(["theirs"]);
    expect(prismaMock.mediaAsset.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["mine"] } } });
    // 스토리지 정리도 지운 것만, 한 번에.
    expect(storageRemove).toHaveBeenCalledWith(["w1/workspace/mine.png"]);
  });

  it("ADMIN 이면 남의 것도 지울 수 있다", async () => {
    prismaMock.workspaceMember.findFirst.mockResolvedValue({ ...MEMBERSHIP, role: "ADMIN" });
    prismaMock.mediaAsset.findMany.mockResolvedValue([
      { id: "theirs", path: "w1/workspace/theirs.png", createdById: "다른사람", originalName: "theirs.png" },
    ]);
    const res = await post({ action: "delete", ids: ["theirs"] });
    const body = await res.json();
    expect(body.deletedIds).toEqual(["theirs"]);
    expect(body.skippedIds).toEqual([]);
  });

  it("전부 남의 것이면 아무것도 안 지우고 스토리지도 안 건드린다", async () => {
    prismaMock.mediaAsset.findMany.mockResolvedValue([
      { id: "theirs", path: "w1/workspace/theirs.png", createdById: "다른사람", originalName: "theirs.png" },
    ]);
    await post({ action: "delete", ids: ["theirs"] });
    expect(prismaMock.mediaAsset.deleteMany).not.toHaveBeenCalled();
    expect(storageRemove).not.toHaveBeenCalled();
  });

  it("스토리지 정리가 실패해도 200 을 돌려준다 — DB 삭제가 이미 끝났다", async () => {
    prismaMock.mediaAsset.findMany.mockResolvedValue([
      { id: "mine", path: "w1/workspace/mine.png", createdById: "u1", originalName: "mine.png" },
    ]);
    storageRemove.mockResolvedValue({ error: { message: "boom" } });
    const res = await post({ action: "delete", ids: ["mine"] });
    expect(res.status).toBe(200);
    expect(prismaMock.mediaAsset.deleteMany).toHaveBeenCalled();
  });
});

describe("일괄 그룹 담기", () => {
  it("MEMBER 도 그룹을 담을 수 있다 — 파괴적이지 않은 정리 동작이다", async () => {
    prismaMock.mediaAsset.findMany.mockResolvedValue([
      { id: "a", path: "w1/workspace/a.png", createdById: "다른사람", originalName: "a.png" },
    ]);
    const res = await post({ action: "group", ids: ["a"], groupLabel: "행사 사진" });
    expect(res.status).toBe(200);
    expect(prismaMock.mediaAsset.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a"] } }, data: { groupLabel: "행사 사진" },
    });
  });

  it("빈 문자열·공백은 미분류(null)로 취급한다", async () => {
    prismaMock.mediaAsset.findMany.mockResolvedValue([{ id: "a", path: "p", createdById: "u1", originalName: "a" }]);
    await post({ action: "group", ids: ["a"], groupLabel: "   " });
    expect(prismaMock.mediaAsset.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["a"] } }, data: { groupLabel: null } });
  });

  it("80자를 넘으면 자른다", async () => {
    prismaMock.mediaAsset.findMany.mockResolvedValue([{ id: "a", path: "p", createdById: "u1", originalName: "a" }]);
    await post({ action: "group", ids: ["a"], groupLabel: "가".repeat(100) });
    const data = prismaMock.mediaAsset.updateMany.mock.calls[0][0].data;
    expect((data.groupLabel as string).length).toBe(80);
  });

  it("삭제와 달리 남의 것도 담을 수 있다", async () => {
    prismaMock.mediaAsset.findMany.mockResolvedValue([
      { id: "theirs", path: "p", createdById: "다른사람", originalName: "x" },
    ]);
    const res = await post({ action: "group", ids: ["theirs"], groupLabel: "행사" });
    const body = await res.json();
    expect(body.updated).toBe(1);
  });
});
