import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspaceMember: { findUnique: vi.fn() },
    webinar: { findFirst: vi.fn() },
    webinarEmbedSite: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { PATCH } from "./route";

const db = prisma as unknown as {
  workspaceMember: { findUnique: ReturnType<typeof vi.fn> };
  webinar: { findFirst: ReturnType<typeof vi.fn> };
  webinarEmbedSite: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

function patch(body: Record<string, unknown>) {
  return PATCH(
    new Request("http://localhost/api/webinar-embed-sites/site-1", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "site-1" }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  db.webinarEmbedSite.findUnique.mockResolvedValue({
    id: "site-1",
    workspaceId: "ws-1",
    projectId: "project-a",
    deletedAt: null,
  });
  db.workspaceMember.findUnique.mockResolvedValue({ id: "member-1" });
  db.webinar.findFirst.mockImplementation(({ where }: { where: { id: string; projectId?: string } }) => {
    if (where.id === "webinar-b") return Promise.resolve(where.projectId === "project-a" ? null : { id: "webinar-b" });
    return Promise.resolve({ id: "webinar-a" });
  });
  db.webinarEmbedSite.update.mockResolvedValue({ id: "site-1", activeWebinarId: "webinar-a" });
});

describe("PATCH /api/webinar-embed-sites/[id]", () => {
  it("다른 프로젝트 웨비나로 노출 전환하지 않는다", async () => {
    const response = await patch({ activeWebinarId: "webinar-b" });
    if (!response) throw new Error("PATCH 응답이 없어요");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "노출할 웨비나를 찾을 수 없어요" });
    expect(db.webinarEmbedSite.update).not.toHaveBeenCalled();
  });

  it("같은 프로젝트 웨비나로의 노출 전환은 유지한다", async () => {
    const response = await patch({ activeWebinarId: "webinar-a" });
    if (!response) throw new Error("PATCH 응답이 없어요");

    expect(response.status).toBe(200);
    expect(db.webinarEmbedSite.update).toHaveBeenCalledOnce();
  });

  it.each([null, ""])("활성 웨비나를 %j로 비우는 기존 해제 동작을 유지한다", async (activeWebinarId) => {
    const response = await patch({ activeWebinarId });
    if (!response) throw new Error("PATCH 응답이 없어요");

    expect(response.status).toBe(200);
    expect(db.webinarEmbedSite.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ activeWebinarId: null }),
    }));
  });
});
