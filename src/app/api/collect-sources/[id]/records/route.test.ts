import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.fn();
const findUniqueSource = vi.fn();
const findUniqueMembership = vi.fn();
const findManyRecords = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    collectSource: { findUnique: (...args: unknown[]) => findUniqueSource(...args) },
    workspaceMember: { findUnique: (...args: unknown[]) => findUniqueMembership(...args) },
    collectRecord: { findMany: (...args: unknown[]) => findManyRecords(...args) },
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
  },
}));

const { GET } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  findUniqueSource.mockResolvedValue({ id: "source-1", workspaceId: "workspace-1" });
  findUniqueMembership.mockResolvedValue({ id: "membership-1", role: "ADMIN" });
  findManyRecords.mockResolvedValue([]);
  queryRaw
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ count: BigInt(0) }]);
});

describe("GET /api/collect-sources/[id]/records", () => {
  it("등록번호 검색도 기존 escaped ILIKE pattern으로 bound SQL에 넣는다", async () => {
    await GET(
      new Request("http://localhost/api/collect-sources/source-1/records?q=1234567890128"),
      { params: Promise.resolve({ id: "source-1" }) },
    );

    const firstQuery = queryRaw.mock.calls[0]?.[0] as { strings: string[]; values: unknown[] };
    // 등록번호 predicate를 빼면 현장에서 번호를 스캔해도 후보를 찾지 못한다.
    expect(firstQuery.strings.join("?")).toContain('COALESCE("registrationNo",\'\') ILIKE ?');
    // 값이 SQL 문자열에 합쳐지지 않고 기존처럼 Prisma parameter로 남아야 한다.
    expect(firstQuery.values).toContain("%1234567890128%");
  });
});
