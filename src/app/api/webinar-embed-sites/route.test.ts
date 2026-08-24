import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspaceMember: { findUnique: vi.fn() },
    project: { findFirst: vi.fn() },
    webinar: { findFirst: vi.fn() },
    webinarEmbedSite: { create: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { POST } from "./route";

const db = prisma as unknown as {
  workspaceMember: { findUnique: ReturnType<typeof vi.fn> };
  project: { findFirst: ReturnType<typeof vi.fn> };
  webinar: { findFirst: ReturnType<typeof vi.fn> };
  webinarEmbedSite: { create: ReturnType<typeof vi.fn> };
};

function post(body: Record<string, unknown>) {
  return POST(new Request("http://localhost/api/webinar-embed-sites", {
    method: "POST",
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  db.workspaceMember.findUnique.mockResolvedValue({ id: "member-1" });
  db.project.findFirst.mockResolvedValue({ id: "project-a" });
  db.webinar.findFirst.mockImplementation(({ where }: { where: { id: string; projectId?: string } }) => {
    if (where.id === "webinar-b") return Promise.resolve(where.projectId === "project-a" ? null : { id: "webinar-b" });
    return Promise.resolve({ id: "webinar-a" });
  });
  db.webinarEmbedSite.create.mockResolvedValue({ id: "site-1", name: "행사 사이트" });
});

describe("POST /api/webinar-embed-sites", () => {
  it("같은 워크스페이스라도 다른 프로젝트 웨비나에는 사이트를 연결하지 않는다", async () => {
    const response = await post({
      workspaceId: "ws-1",
      projectId: "project-a",
      name: "행사 사이트",
      activeWebinarId: "webinar-b",
    });
    if (!response) throw new Error("POST 응답이 없어요");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "노출할 웨비나를 찾을 수 없어요" });
    expect(db.webinarEmbedSite.create).not.toHaveBeenCalled();
  });

  it("같은 프로젝트 웨비나는 기존처럼 사이트를 생성한다", async () => {
    const response = await post({
      workspaceId: "ws-1",
      projectId: "project-a",
      name: "행사 사이트",
      activeWebinarId: "webinar-a",
    });
    if (!response) throw new Error("POST 응답이 없어요");

    expect(response.status).toBe(201);
    expect(db.webinarEmbedSite.create).toHaveBeenCalledOnce();
  });
});
