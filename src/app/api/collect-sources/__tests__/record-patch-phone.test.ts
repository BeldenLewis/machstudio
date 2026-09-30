// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **레코드를 고칠 때 전화가 살아남는가** — 라우트를 실제로 태운다.
 *
 * 단위 테스트만으로는 부족했다: 같은 계산을 테스트 안에 **다시 적으면** 라우트가 그 계산을
 * 안 쓰게 바뀌어도 초록이다. 여기서는 PATCH 를 실제로 불러 `prisma.update` 에 무엇이
 * 실려 가는지 본다.
 *
 * 막는 사고: 기본 국가가 US 인 전시(LA)에 한국 번호로 등록한 사람의 **이름 오타를 고쳐
 * 주면** 전화가 통째로 사라지던 것. 오류도 경고도 없어서 원인을 아무도 못 찾는다.
 */

const prismaMock = {
  collectSource: { findUnique: vi.fn() },
  workspaceMember: { findUnique: vi.fn() },
  collectRecord: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
};
const getUser = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser } }) }));
vi.mock("@/lib/activity", () => ({ logActivity: vi.fn() }));

const SOURCE = {
  id: "src1", workspaceId: "w1", projectId: "p1", mode: "builder", deletedAt: null,
  formConfig: {
    fields: [
      { key: "name", type: "text", label: { ko: "이름" } },
      { key: "tel", type: "tel", label: { ko: "연락처" } },
      { key: "email", type: "email", label: { ko: "이메일" } },
    ],
    // LA 전시라 기본 국가가 US 다 — 한국 참관객이 오는 것이 기본 시나리오다.
    validation: { defaultCountry: "US" },
  },
};

const patch = async (data: Record<string, string>) => {
  const { PATCH } = await import("@/app/api/collect-sources/[id]/records/[recordId]/route");
  return PATCH(
    new Request("https://machstudio.vercel.app/x", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data }),
    }),
    { params: Promise.resolve({ id: "src1", recordId: "rec1" }) },
  );
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  prismaMock.collectSource.findUnique.mockResolvedValue(SOURCE);
  prismaMock.workspaceMember.findUnique.mockResolvedValue({ role: "OWNER" });
  prismaMock.collectRecord.update.mockResolvedValue({ id: "rec1", data: {} });
});

describe("전화 재파싱", () => {
  /** 이 사고가 실제로 나던 경로다. */
  it("US 기본 전시에서 이름만 고쳐도 한국 번호가 살아남는다", async () => {
    prismaMock.collectRecord.findFirst.mockResolvedValue({ id: "rec1", phoneE164: "+821012345678" });

    await patch({ name: "홍길동", tel: "01012345678", email: "hong@example.com" });

    const sent = prismaMock.collectRecord.update.mock.calls[0][0].data;
    expect(sent.phoneE164).toBe("+821012345678");
  });

  it("기본 국가로 읽히는 번호는 그쪽이 이긴다", async () => {
    prismaMock.collectRecord.findFirst.mockResolvedValue({ id: "rec1", phoneE164: "+821012345678" });

    await patch({ name: "Jane", tel: "2025550147", email: "jane@example.com" });

    expect(prismaMock.collectRecord.update.mock.calls[0][0].data.phoneE164).toBe("+12025550147");
  });

  it("전화를 비우면 비워진다", async () => {
    prismaMock.collectRecord.findFirst.mockResolvedValue({ id: "rec1", phoneE164: "+821012345678" });

    await patch({ name: "홍길동", tel: "", email: "hong@example.com" });

    expect(prismaMock.collectRecord.update.mock.calls[0][0].data.phoneE164).toBeNull();
  });

  /** 이메일 정규화는 원래 의도대로 계속 따라와야 한다 — 폴백을 넣으며 깨뜨리지 않았다. */
  it("이메일 정규화는 그대로 따라온다", async () => {
    prismaMock.collectRecord.findFirst.mockResolvedValue({ id: "rec1", phoneE164: null });

    await patch({ name: "홍길동", tel: "", email: "  Hong@Example.COM  " });

    expect(prismaMock.collectRecord.update.mock.calls[0][0].data.emailNormalized).toBe("hong@example.com");
  });

  /** 연동형(capture)은 이 컬럼들을 안 쓴다 — 52,000건이 그대로 돌아가야 한다. */
  it("연동형 소스는 정규화 컬럼을 건드리지 않는다", async () => {
    prismaMock.collectSource.findUnique.mockResolvedValue({ ...SOURCE, mode: "capture" });
    prismaMock.collectRecord.findFirst.mockResolvedValue({ id: "rec1", phoneE164: null });

    await patch({ name: "홍길동", tel: "01012345678" });

    const sent = prismaMock.collectRecord.update.mock.calls[0][0].data;
    expect(sent.phoneE164).toBeUndefined();
    expect(sent.emailNormalized).toBeUndefined();
  });
});
