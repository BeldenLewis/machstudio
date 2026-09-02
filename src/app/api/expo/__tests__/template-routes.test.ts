// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 템플릿 저장·복제 — **두 저장소를 건드리는 작업**이라 순서가 규칙이다.
 *
 * ① 식별자를 먼저 발급 → ② Storage 복사 → ③ DB 한 번.
 * 어디서 실패하든 되돌릴 대상이 **이번 작업이 만든 것**으로 한정되어야 하고,
 * 되돌리기까지 실패하면 성공이라고 말하면 안 된다.
 *
 * DB 도 Storage 도 붙이지 않는다. 여기서 보는 것은 그 순서와 경계다.
 */

const prismaMock = {
  workspaceMember: { findMany: vi.fn() },
  projectMember: { findMany: vi.fn() },
  expoSite: { findFirst: vi.fn(), create: vi.fn() },
  expoPage: { findMany: vi.fn(), create: vi.fn() },
  expoTemplate: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  project: { findUnique: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
};
const getUser = vi.fn();
const probe = vi.fn();

const BASE = "https://proj.supabase.co/storage/v1/object/public/webinar-assets/";
const storageMock = {
  publicUrl: (path: string) => BASE + path,
  pathFromUrl: (url: string) => (url.startsWith(BASE) ? url.slice(BASE.length) : null),
  copy: vi.fn(async (_from: string, _to: string) => ({ error: null as string | null })),
  remove: vi.fn(async (_paths: string[]) => ({ error: null as string | null })),
  list: vi.fn(async (_prefix: string) => ({ paths: [] as string[], error: null as string | null })),
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser } }) }));
vi.mock("@/lib/expo/schema-probe", () => ({ probeExpoSchema: () => probe() }));
vi.mock("@/lib/expo/storage", () => ({ createExpoStorage: () => storageMock }));

const SCHEMA_VERSION = "20260901-v2";
const SID_KV = "11111111-1111-1111-1111-111111111111";
const SID_FORM = "22222222-2222-2222-2222-222222222222";
const HERO = `${BASE}w1/expo/site1/hero.jpg`;

const write = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://machstudio.vercel.app/api/expo/templates", {
    method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", ...headers },
    body: JSON.stringify(body),
  });
const patch = (body: unknown) =>
  new Request("https://machstudio.vercel.app/api/expo/templates/t1", {
    method: "PATCH",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
    body: JSON.stringify(body),
  });
const del = () =>
  new Request("https://machstudio.vercel.app/api/expo/templates/t1", {
    method: "DELETE",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
  });
const read = () => new Request("https://machstudio.vercel.app/api/expo/templates");

const p = (templateId = "t1") => ({ params: Promise.resolve({ templateId }) });

const sitePages = () => [{
  id: "pg1", slug: "home", title: "홈", isHome: true, sortOrder: 0, parentId: null, imwebUrl: null,
  draft: {
    sections: [
      {
        sid: SID_KV, type: "kv", variant: "column", enabled: true, embedEnabled: false,
        design: { bg: "light", align: "left" },
        content: { title: { ko: "지난 전시" }, media: { kind: "image", url: HERO } },
      },
      {
        sid: SID_FORM, type: "register-form", variant: "inline", enabled: true, embedEnabled: false,
        design: { bg: "light" },
        content: { heading: { ko: "사전등록" }, sourceRef: "src-old" },
      },
    ],
  },
}];

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("EXPO_SCHEMA_CAPABILITY", SCHEMA_VERSION);
  vi.stubEnv("EXPO_PUBLIC_EMBED_RELEASE", "");
  probe.mockResolvedValue(true);
  getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  prismaMock.workspaceMember.findMany.mockResolvedValue([{ workspaceId: "w1", role: "ADMIN" }]);
  prismaMock.projectMember.findMany.mockResolvedValue([]);
  prismaMock.expoSite.findFirst.mockResolvedValue({
    id: "site1", workspaceId: "w1", projectId: "proj1", theme: { accent: "#123456" }, siteUrl: null,
  });
  prismaMock.expoPage.findMany.mockResolvedValue(sitePages());
  storageMock.copy.mockResolvedValue({ error: null });
  storageMock.remove.mockResolvedValue({ error: null });
  storageMock.list.mockResolvedValue({ paths: [], error: null });
  prismaMock.$transaction.mockImplementation(async (ops: unknown[]) => ops);
});

const post = async (body: unknown) =>
  (await import("@/app/api/expo/templates/route")).POST(write(body));

// ── 저장 ────────────────────────────────────────────────────────────────

describe("사이트를 템플릿으로 저장", () => {
  /** 기본은 구조만이다 — 문구까지 가져가는 것은 명시적으로 고른 경우만. */
  it("기본은 design 모드라 문구도 이미지도 안 간다", async () => {
    const res = await post({ siteId: "site1", name: "기본 틀" });
    expect(res.status).toBe(201);

    const snapshot = prismaMock.expoTemplate.create.mock.calls[0][0].data.snapshot;
    expect(snapshot.contentMode).toBe("design");
    expect(snapshot.pages[0].sections[0].content).toBeUndefined();
    // 옮길 이미지가 없으니 복사도 없다.
    expect(storageMock.copy).not.toHaveBeenCalled();
  });

  it("full 모드는 문구를 담고, 소유한 이미지는 템플릿 경로로 복사한다", async () => {
    const res = await post({ siteId: "site1", name: "문구 포함", contentMode: "full" });
    expect(res.status).toBe(201);

    expect(storageMock.copy).toHaveBeenCalledTimes(1);
    const [from, to] = storageMock.copy.mock.calls[0];
    expect(from).toBe("w1/expo/site1/hero.jpg");
    expect(to).toMatch(/^w1\/expo-templates\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/);

    // 스냅샷은 **복사한 새 주소**를 가리킨다 — 원본 사이트 주소가 남으면 안 된다.
    const snapshot = prismaMock.expoTemplate.create.mock.calls[0][0].data.snapshot;
    const mediaUrl = snapshot.pages[0].sections[0].content.media.url;
    expect(mediaUrl).toBe(BASE + to);
    expect(JSON.stringify(snapshot)).not.toContain("w1/expo/site1/hero.jpg");
  });

  /** 사전등록 소스는 전시마다 다르다 — 담기지 않았다는 것을 화면이 말해야 한다. */
  it("다시 연결할 것을 체크리스트로 돌려준다", async () => {
    const res = await post({ siteId: "site1", name: "x", contentMode: "full" });
    const body = await res.json();

    expect(body.checklist.map((c: { code: string }) => c.code)).toContain("source-ref");
    // 스냅샷에는 옛 소스 id 가 없다.
    const snapshot = prismaMock.expoTemplate.create.mock.calls[0][0].data.snapshot;
    expect(JSON.stringify(snapshot)).not.toContain("src-old");
  });

  it("Storage 경로는 DB id 와 같다 — 나중에 정확히 그 경로만 지운다", async () => {
    await post({ siteId: "site1", name: "x", contentMode: "full" });
    const { id, workspaceId } = prismaMock.expoTemplate.create.mock.calls[0][0].data;
    expect(storageMock.copy.mock.calls[0][1].startsWith(`${workspaceId}/expo-templates/${id}/`)).toBe(true);
  });

  it("이름이 없으면 거절한다 — 목록에서 고를 수 없다", async () => {
    const res = await post({ siteId: "site1", name: "  " });
    expect(res.status).toBe(422);
    expect((await res.json()).fields[0].path).toBe("name");
    expect(storageMock.copy).not.toHaveBeenCalled();
  });

  it("남의 워크스페이스 사이트는 없는 것으로 답한다", async () => {
    prismaMock.expoSite.findFirst.mockResolvedValue({
      id: "site9", workspaceId: "w9", projectId: "p9", theme: {}, siteUrl: null,
    });
    const res = await post({ siteId: "site9", name: "x" });
    expect(res.status).toBe(404);
    expect(prismaMock.expoTemplate.create).not.toHaveBeenCalled();
  });

  it("배정되지 않은 MEMBER 는 자기 워크스페이스 사이트도 템플릿으로 저장할 수 없다", async () => {
    prismaMock.workspaceMember.findMany.mockResolvedValue([{ workspaceId: "w1", role: "MEMBER" }]);
    prismaMock.projectMember.findMany.mockResolvedValue([]);
    expect((await post({ siteId: "site1", name: "x" })).status).toBe(404);
    expect(prismaMock.expoTemplate.create).not.toHaveBeenCalled();
  });
});

describe("저장이 실패하면 이번 작업이 만든 것만 되돌린다", () => {
  it("복사가 실패하면 DB 를 건드리지 않는다", async () => {
    storageMock.copy.mockResolvedValue({ error: "copy failed" });
    const res = await post({ siteId: "site1", name: "x", contentMode: "full" });

    expect(res.status).toBe(502);
    expect(prismaMock.expoTemplate.create).not.toHaveBeenCalled();
  });

  /** 복사는 성공하고 DB 가 실패하면 파일만 남는다 — 그게 고아다. */
  it("DB 가 실패하면 복사한 파일을 지운다", async () => {
    prismaMock.expoTemplate.create.mockRejectedValue(new Error("db down"));
    const res = await post({ siteId: "site1", name: "x", contentMode: "full" });

    expect(res.status).toBe(500);
    const copiedTo = storageMock.copy.mock.calls[0][1];
    expect(storageMock.remove).toHaveBeenCalledWith([copiedTo]);
  });

  it("되돌리기까지 실패해도 성공이라고 말하지 않는다", async () => {
    prismaMock.expoTemplate.create.mockRejectedValue(new Error("db down"));
    storageMock.remove.mockResolvedValue({ error: "remove failed" });
    const res = await post({ siteId: "site1", name: "x", contentMode: "full" });
    expect(res.status).toBe(500);
  });
});

// ── 목록·이름 변경·영구 삭제 ────────────────────────────────────────────

describe("목록", () => {
  it("내 워크스페이스 것만 조회한다", async () => {
    prismaMock.expoTemplate.findMany.mockResolvedValue([]);
    const { GET } = await import("@/app/api/expo/templates/route");
    await GET(read());
    expect(prismaMock.expoTemplate.findMany.mock.calls[0][0].where)
      .toEqual({ workspaceId: { in: ["w1"] }, id: { notIn: ["stk-home-v1"] } });
  });

  it("예약 id를 take 전에 제외해 정상 템플릿 200개 슬롯을 모두 돌려준다", async () => {
    prismaMock.expoTemplate.findMany.mockResolvedValue(Array.from({ length: 200 }, (_, index) => ({
      id: `t${index}`, workspaceId: "w1", name: `정상 행 ${index}`, description: null,
      snapshot: {}, createdAt: new Date(index),
    })));
    const { GET } = await import("@/app/api/expo/templates/route");
    const body = await (await GET(read())).json();
    expect(prismaMock.expoTemplate.findMany.mock.calls[0][0]).toMatchObject({
      where: { workspaceId: { in: ["w1"] }, id: { notIn: ["stk-home-v1"] } },
      take: 200,
    });
    expect(body.templates.filter((template: { builtIn: boolean }) => !template.builtIn)).toHaveLength(200);
  });

  it("MEMBER 에게는 관리 권한이 없다고 알려 준다", async () => {
    prismaMock.workspaceMember.findMany.mockResolvedValue([{ workspaceId: "w1", role: "MEMBER" }]);
    prismaMock.expoTemplate.findMany.mockResolvedValue([
      { id: "t1", workspaceId: "w1", name: "n", description: null, snapshot: { contentMode: "full", pages: [{}] }, createdAt: new Date() },
    ]);
    const { GET } = await import("@/app/api/expo/templates/route");
    const body = await (await GET(read())).json();
    expect(body.templates.find((template: { id: string }) => template.id === "t1"))
      .toMatchObject({ contentMode: "full", pageCount: 1, canManage: false });
  });

  it("기본 제공 STK 프리셋을 DB 템플릿 앞에 불변 항목으로 합친다", async () => {
    prismaMock.expoTemplate.findMany.mockResolvedValue([]);
    const { GET } = await import("@/app/api/expo/templates/route");
    const body = await (await GET(read())).json();
    expect(body.templates[0]).toMatchObject({
      id: "stk-home-v1", builtIn: true, contentMode: "full", pageCount: 1, canManage: false,
    });
  });

  it("예약 id로 위조한 DB 행은 기본 제공 목록에 중복 노출하지 않는다", async () => {
    prismaMock.expoTemplate.findMany.mockResolvedValue([
      { id: "stk-home-v1", workspaceId: "w1", name: "위조 행", description: null, snapshot: {}, createdAt: new Date() },
      { id: "t1", workspaceId: "w1", name: "정상 행", description: null, snapshot: {}, createdAt: new Date() },
    ]);
    const { GET } = await import("@/app/api/expo/templates/route");
    const body = await (await GET(read())).json();
    expect(body.templates.filter((template: { id: string }) => template.id === "stk-home-v1")).toHaveLength(1);
    expect(body.templates.map((template: { id: string }) => template.id)).toContain("t1");
  });
});

describe("이름 변경·영구 삭제는 워크스페이스 관리자만", () => {
  beforeEach(() => {
    prismaMock.expoTemplate.findFirst.mockResolvedValue({
      id: "t1", workspaceId: "w1", name: "옛 이름", description: null, snapshot: {}, createdAt: new Date(),
    });
  });

  /**
   * 템플릿은 워크스페이스 전역이다. 한 전시의 담당자가 지우면 **다른 전시들이 쓰던 틀이
   * 같이 사라진다** — 프로젝트 권한으로는 부족하다.
   */
  it("MEMBER 는 이름을 바꿀 수 없다", async () => {
    prismaMock.workspaceMember.findMany.mockResolvedValue([{ workspaceId: "w1", role: "MEMBER" }]);
    const { PATCH } = await import("@/app/api/expo/templates/[templateId]/route");
    expect((await PATCH(patch({ name: "새 이름" }), p())).status).toBe(403);
    expect(prismaMock.expoTemplate.update).not.toHaveBeenCalled();
  });

  it("MEMBER 는 지울 수 없다", async () => {
    prismaMock.workspaceMember.findMany.mockResolvedValue([{ workspaceId: "w1", role: "MEMBER" }]);
    const { DELETE } = await import("@/app/api/expo/templates/[templateId]/route");
    expect((await DELETE(del(), p())).status).toBe(403);
    expect(prismaMock.expoTemplate.delete).not.toHaveBeenCalled();
    expect(storageMock.remove).not.toHaveBeenCalled();
  });

  it("ADMIN 은 이름을 바꾼다", async () => {
    prismaMock.expoTemplate.update.mockResolvedValue({ id: "t1", name: "새 이름", description: null });
    const { PATCH } = await import("@/app/api/expo/templates/[templateId]/route");
    expect((await PATCH(patch({ name: "새 이름" }), p())).status).toBe(200);
    expect(prismaMock.expoTemplate.update.mock.calls[0][0].data.name).toBe("새 이름");
  });

  it("남의 워크스페이스 템플릿은 404 — 권한 이야기를 꺼내지 않는다", async () => {
    prismaMock.expoTemplate.findFirst.mockResolvedValue({
      id: "t9", workspaceId: "w9", name: "n", description: null, snapshot: {}, createdAt: new Date(),
    });
    const { PATCH, DELETE, GET } = await import("@/app/api/expo/templates/[templateId]/route");
    expect((await GET(read(), p("t9"))).status).toBe(404);
    expect((await PATCH(patch({ name: "x" }), p("t9"))).status).toBe(404);
    expect((await DELETE(del(), p("t9"))).status).toBe(404);
  });

  it("기본 제공 프리셋은 같은 id의 DB 행이 있어도 이름 변경·삭제할 수 없다", async () => {
    prismaMock.expoTemplate.findFirst.mockResolvedValue({
      id: "stk-home-v1", workspaceId: "w1", name: "위조 행", description: null, snapshot: {}, createdAt: new Date(),
    });
    const { PATCH, DELETE } = await import("@/app/api/expo/templates/[templateId]/route");
    expect((await PATCH(patch({ name: "새 이름" }), p("stk-home-v1"))).status).toBe(404);
    expect((await DELETE(del(), p("stk-home-v1"))).status).toBe(404);
    expect(prismaMock.expoTemplate.update).not.toHaveBeenCalled();
    expect(prismaMock.expoTemplate.delete).not.toHaveBeenCalled();
  });

  it("기본 제공 프리셋 상세 조회는 같은 id의 DB 행을 읽지 않는다", async () => {
    prismaMock.expoTemplate.findFirst.mockResolvedValue({
      id: "stk-home-v1", workspaceId: "w1", name: "위조 행", description: null, snapshot: {}, createdAt: new Date(),
    });
    const { GET } = await import("@/app/api/expo/templates/[templateId]/route");
    expect((await GET(read(), p("stk-home-v1"))).status).toBe(404);
    expect(prismaMock.expoTemplate.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.expoTemplate.update).not.toHaveBeenCalled();
    expect(prismaMock.expoTemplate.delete).not.toHaveBeenCalled();
  });
});

describe("영구 삭제의 순서", () => {
  beforeEach(() => {
    prismaMock.expoTemplate.findFirst.mockResolvedValue({
      id: "t1", workspaceId: "w1", name: "n", description: null, snapshot: {}, createdAt: new Date(),
    });
    prismaMock.expoTemplate.delete.mockResolvedValue({ id: "t1" });
  });

  it("자기 접두사만 훑고, 그 안의 것만 지운다", async () => {
    storageMock.list.mockResolvedValue({
      paths: ["w1/expo-templates/t1/a.jpg", "w1/expo/site1/hero.jpg"], error: null,
    });
    const { DELETE } = await import("@/app/api/expo/templates/[templateId]/route");
    expect((await DELETE(del(), p())).status).toBe(200);

    expect(storageMock.list).toHaveBeenCalledWith("w1/expo-templates/t1/");
    // 자기 파일은 지우고, 목록에 섞여 온 사이트 파일은 남긴다 — 되돌릴 수 없다.
    expect(storageMock.remove).toHaveBeenCalledWith(["w1/expo-templates/t1/a.jpg"]);
  });

  /** 파일 없는 템플릿이 목록에 남으면 다음 전시가 그걸 골라 깨진 사이트를 만든다. */
  it("DB 를 먼저 지운다", async () => {
    const order: string[] = [];
    prismaMock.expoTemplate.delete.mockImplementation(async () => { order.push("db"); return { id: "t1" }; });
    storageMock.list.mockImplementation(async (_prefix: string) => { order.push("storage"); return { paths: [], error: null }; });
    const { DELETE } = await import("@/app/api/expo/templates/[templateId]/route");
    await DELETE(del(), p());
    expect(order).toEqual(["db", "storage"]);
  });

  it("Storage 정리가 실패하면 지웠다는 것과 남았다는 것을 같이 말한다", async () => {
    storageMock.list.mockResolvedValue({ paths: ["w1/expo-templates/t1/a.jpg"], error: null });
    storageMock.remove.mockResolvedValue({ error: "remove failed" });
    const { DELETE } = await import("@/app/api/expo/templates/[templateId]/route");
    const res = await DELETE(del(), p());
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ deleted: true, cleanupPending: true });
  });
});

// ── 복제 ────────────────────────────────────────────────────────────────

const snapshotWithMedia = (mediaUrl: string) => ({
  version: 1,
  contentMode: "full",
  theme: { accent: "#1f3a5f", lightBg: "#ffffff", darkBg: "#111318" },
  pages: [{
    key: "home", slug: "home", title: "홈", isHome: true, sortOrder: 0,
    sections: [{
      type: "kv", variant: "column", design: { bg: "light", align: "left" },
      content: { title: { ko: "제목" }, media: { kind: "image", url: mediaUrl } },
    }],
  }],
});

const instantiate = async (body: unknown, templateId = "t1") =>
  (await import("@/app/api/expo/templates/[templateId]/instantiate/route"))
    .POST(write(body), { params: Promise.resolve({ templateId }) });

describe("템플릿에서 새 사이트를 만든다", () => {
  beforeEach(() => {
    prismaMock.expoTemplate.findFirst.mockResolvedValue({
      id: "t1", workspaceId: "w1", snapshot: snapshotWithMedia(`${BASE}w1/expo-templates/t1/a.jpg`),
    });
    prismaMock.project.findUnique.mockResolvedValue({ id: "proj2", workspaceId: "w1" });
  });

  /** 템플릿을 골랐다는 이유로 지난 전시 문구가 밖으로 나가면 안 된다. */
  it("발행도 공개도 꺼진 채로 만든다", async () => {
    const res = await instantiate({ projectId: "proj2", name: "새 전시" });
    expect(res.status).toBe(201);

    const page = prismaMock.expoPage.create.mock.calls[0][0].data;
    expect(page.published).toBeUndefined();
    expect(page.liveAt).toBeNull();
    // 미리보기 토큰도 새로 발급한다 — 템플릿에는 담기지 않는 값이다.
    expect(prismaMock.expoSite.create.mock.calls[0][0].data.previewToken).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("사이트와 페이지를 한 트랜잭션으로 만든다", async () => {
    await instantiate({ projectId: "proj2", name: "새 전시" });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.$transaction.mock.calls[0][0]).toHaveLength(2);
  });

  it("템플릿 미디어를 새 사이트 경로로 복사하고, 초안이 그걸 가리킨다", async () => {
    await instantiate({ projectId: "proj2", name: "새 전시" });
    const [from, to] = storageMock.copy.mock.calls[0];
    expect(from).toBe("w1/expo-templates/t1/a.jpg");
    expect(to).toMatch(/^w1\/expo\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/);

    const draft = prismaMock.expoPage.create.mock.calls[0][0].data.draft;
    expect(draft.sections[0].content.media.url).toBe(BASE + to);
  });

  /** 섹션 sid 를 새로 발급하지 않으면 옛 스니펫 URL 이 새 사이트를 가리킨다. */
  it("섹션 sid 를 새로 발급한다", async () => {
    await instantiate({ projectId: "proj2", name: "새 전시" });
    const draft = prismaMock.expoPage.create.mock.calls[0][0].data.draft;
    expect(draft.sections[0].sid).toMatch(/^[0-9a-f-]{36}$/);
    expect(draft.sections[0].embedEnabled).toBe(false);
  });

  it("새 사이트의 아임웹 주소를 연결하라고 알려 준다", async () => {
    const body = await (await instantiate({ projectId: "proj2", name: "새 전시" })).json();
    expect(body.checklist.map((c: { code: string }) => c.code)).toContain("imweb-url");
  });

  it("남의 워크스페이스 전시로는 만들 수 없다", async () => {
    prismaMock.project.findUnique.mockResolvedValue({ id: "proj9", workspaceId: "w9" });
    const res = await instantiate({ projectId: "proj9", name: "새 전시" });
    expect(res.status).toBe(404);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(storageMock.copy).not.toHaveBeenCalled();
  });

  it("배정되지 않은 MEMBER 는 목적지 프로젝트를 추측할 수 없다", async () => {
    prismaMock.workspaceMember.findMany.mockResolvedValue([{ workspaceId: "w1", role: "MEMBER" }]);
    prismaMock.projectMember.findMany.mockResolvedValue([]);
    const res = await instantiate({ projectId: "proj2", name: "새 전시" });
    expect(res.status).toBe(404);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("남의 워크스페이스 템플릿은 없는 것으로 답한다", async () => {
    prismaMock.expoTemplate.findFirst.mockResolvedValue({ id: "t9", workspaceId: "w9", snapshot: {} });
    expect((await instantiate({ projectId: "proj2", name: "x" }, "t9")).status).toBe(404);
  });

  /** 모르는 버전을 무시하고 만들면 조용히 반쪽짜리 사이트가 생긴다. */
  it("읽을 수 없는 스냅샷은 거절한다", async () => {
    prismaMock.expoTemplate.findFirst.mockResolvedValue({ id: "t1", workspaceId: "w1", snapshot: { version: 99 } });
    const res = await instantiate({ projectId: "proj2", name: "x" });
    expect(res.status).toBe(422);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("페이지가 없는 스냅샷도 거절한다", async () => {
    prismaMock.expoTemplate.findFirst.mockResolvedValue({
      id: "t1", workspaceId: "w1", snapshot: { version: 1, contentMode: "design", theme: {}, pages: [] },
    });
    expect((await instantiate({ projectId: "proj2", name: "x" })).status).toBe(422);
  });

  it("트랜잭션이 실패하면 복사한 파일만 지운다 — 템플릿 원본은 남는다", async () => {
    prismaMock.$transaction.mockRejectedValue(new Error("db down"));
    const res = await instantiate({ projectId: "proj2", name: "새 전시" });

    expect(res.status).toBe(500);
    const copiedTo = storageMock.copy.mock.calls[0][1];
    expect(storageMock.remove).toHaveBeenCalledWith([copiedTo]);
    expect(storageMock.remove.mock.calls[0][0]).not.toContain("w1/expo-templates/t1/a.jpg");
  });

  it("기본 제공 STK 프리셋은 DB 템플릿·Storage를 읽지 않고 같은 프로젝트 권한으로 만든다", async () => {
    prismaMock.project.findUnique.mockResolvedValue({ id: "proj2", workspaceId: "w1" });
    const res = await instantiate({ projectId: "proj2", name: "STK 2027" }, "stk-home-v1");
    expect(res.status).toBe(201);
    expect(prismaMock.expoTemplate.findFirst).not.toHaveBeenCalled();
    expect(storageMock.copy).not.toHaveBeenCalled();
    const draft = prismaMock.expoPage.create.mock.calls[0][0].data.draft;
    expect(draft.preset).toBe("stk-home-v1");
    expect(draft.sections.map((section: { type: string }) => section.type)).toEqual([
      "campaign-hero", "exhibition-grid", "audience-links", "speaker-carousel", "sponsor-marquee", "cta-band",
    ]);
  });

  it("기본 제공 STK 프리셋도 목적지 프로젝트 접근 권한을 우회하지 않는다", async () => {
    prismaMock.workspaceMember.findMany.mockResolvedValue([{ workspaceId: "w1", role: "MEMBER" }]);
    prismaMock.projectMember.findMany.mockResolvedValue([]);
    prismaMock.project.findUnique.mockResolvedValue({ id: "proj2", workspaceId: "w1" });
    const res = await instantiate({ projectId: "proj2", name: "STK 2027" }, "stk-home-v1");
    expect(res.status).toBe(404);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
