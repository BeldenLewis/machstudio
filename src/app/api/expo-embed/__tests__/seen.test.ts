// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "붙어 있다" 비콘.
 *
 * 여기서 지키는 것 셋:
 *  · 공개 승인 전에는 **DB 를 건드리지 않는다**
 *  · `lastSeenAt`·`lastSeenOrigin` **둘만** 쓴다 — `draftRevision` 을 올리면 운영자가
 *    타이핑 중인 자동저장이 충돌로 막힌다
 *  · 크롤러가 배지를 켜지 못한다 — 거짓 배지는 없는 배지보다 나쁘다
 */

const prismaMock = { expoPage: { updateMany: vi.fn() } };
const rateLimitAsync = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/ratelimit", () => ({
  getClientIp: () => "1.2.3.4",
  rateLimitAsync: (...args: unknown[]) => rateLimitAsync(...args),
}));

const post = async (body: string, headers: Record<string, string> = {}) => {
  const { POST } = await import("@/app/api/expo-embed/seen/route");
  return POST(new Request("https://machstudio.example.com/api/expo-embed/seen", {
    method: "POST",
    // 런타임은 평문으로 보낸다 — Content-Type 을 붙이지 않는다.
    headers: { origin: "https://partner.example.com", ...headers },
    body,
  }));
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("EXPO_PUBLIC_EMBED_RELEASE", "on");
  rateLimitAsync.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
  prismaMock.expoPage.updateMany.mockResolvedValue({ count: 1 });
});

describe("공개 승인", () => {
  it("승인이 없으면 DB 를 건드리지 않고 204 다", async () => {
    vi.stubEnv("EXPO_PUBLIC_EMBED_RELEASE", "");
    const res = await post(JSON.stringify({ pageId: "pg1" }));
    expect(res.status).toBe(204);
    expect(prismaMock.expoPage.updateMany).not.toHaveBeenCalled();
    expect(rateLimitAsync).not.toHaveBeenCalled();
  });

  /** 승인을 켠 뒤에 no-op 응답을 엣지에서 물려받지 않게. */
  it("모든 응답이 캐시되지 않는다", async () => {
    const res = await post(JSON.stringify({ pageId: "pg1" }));
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("프리플라이트는 꺼져 있어도 204 다", async () => {
    vi.stubEnv("EXPO_PUBLIC_EMBED_RELEASE", "");
    const { OPTIONS } = await import("@/app/api/expo-embed/seen/route");
    expect((await OPTIONS()).status).toBe(204);
  });
});

describe("무엇을 쓰는가", () => {
  /** 그 번호는 편집기 자동저장의 비교-교환 값이다 — 비콘이 올리면 저장이 충돌로 막힌다. */
  it("lastSeenAt·lastSeenOrigin 둘만 쓴다", async () => {
    await post(JSON.stringify({ pageId: "pg1" }));
    const call = prismaMock.expoPage.updateMany.mock.calls[0][0];
    expect(Object.keys(call.data).sort()).toEqual(["lastSeenAt", "lastSeenOrigin"]);
    expect(call.data).not.toHaveProperty("draftRevision");
    expect(call.data).not.toHaveProperty("draft");
    expect(call.data).not.toHaveProperty("published");
  });

  /** 발행 전 페이지가 관측됐다는 것은 뜻이 없고, 삭제된 페이지에 쓰면 거짓 배지가 남는다. */
  it("발행된, 삭제되지 않은 페이지만 갱신한다", async () => {
    await post(JSON.stringify({ pageId: "pg1" }));
    expect(prismaMock.expoPage.updateMany.mock.calls[0][0].where).toEqual({
      id: "pg1",
      deletedAt: null,
      publishedAt: { not: null },
      site: { deletedAt: null },
    });
  });

  /** 본문이 보낸 주소는 믿지 않는다 — 서버가 본 헤더만 쓴다. */
  it("주소는 서버가 본 값에서만 온다", async () => {
    await post(JSON.stringify({ pageId: "pg1", origin: "https://evil.example.com" }));
    expect(prismaMock.expoPage.updateMany.mock.calls[0][0].data.lastSeenOrigin)
      .toBe("https://partner.example.com");
  });

  it("origin 이 없으면 referer 에서 오리진만 딴다", async () => {
    await post(JSON.stringify({ pageId: "pg1" }), { origin: "", referer: "https://p.example.com/a/b?c=1" });
    expect(prismaMock.expoPage.updateMany.mock.calls[0][0].data.lastSeenOrigin)
      .toBe("https://p.example.com");
  });

  it("이상한 주소는 아예 쓰지 않는다", async () => {
    await post(JSON.stringify({ pageId: "pg1" }), { origin: "javascript:alert(1)", referer: "" });
    expect(prismaMock.expoPage.updateMany.mock.calls[0][0].data)
      .not.toHaveProperty("lastSeenOrigin");
  });

  it("구획 비콘도 그 페이지를 갱신한다", async () => {
    await post(JSON.stringify({ pageId: "pg1", sectionId: "sid-1" }));
    expect(prismaMock.expoPage.updateMany.mock.calls[0][0].where.id).toBe("pg1");
  });
});

describe("받지 않는 것", () => {
  /** 운영자가 안 붙였는데 배지가 켜지면 그 배지가 거짓이 된다. */
  it("크롤러는 무시한다", async () => {
    for (const ua of ["Googlebot/2.1", "facebookexternalhit/1.1", "HeadlessChrome/120"]) {
      await post(JSON.stringify({ pageId: "pg1" }), { "user-agent": ua });
    }
    expect(prismaMock.expoPage.updateMany).not.toHaveBeenCalled();
  });

  it("한도를 넘으면 쓰지 않는다", async () => {
    rateLimitAsync.mockResolvedValue({ allowed: false, retryAfterMs: 1000 });
    expect((await post(JSON.stringify({ pageId: "pg1" }))).status).toBe(429);
    expect(prismaMock.expoPage.updateMany).not.toHaveBeenCalled();
  });

  /** 비콘 payload 는 200바이트가 안 된다 — 넘으면 우리가 보낸 것이 아니다. */
  it("본문이 상한을 넘으면 읽지 않는다", async () => {
    await post(JSON.stringify({ pageId: "pg1", pad: "x".repeat(4000) }));
    expect(prismaMock.expoPage.updateMany).not.toHaveBeenCalled();
  });

  it("빈·깨진·배열 본문은 무시한다", async () => {
    for (const body of ["", "not json", "[]", "null", "{}", '{"pageId":123}', '{"pageId":""}']) {
      await post(body);
    }
    expect(prismaMock.expoPage.updateMany).not.toHaveBeenCalled();
  });

  it("DB 가 실패해도 방문자에게는 204 다", async () => {
    prismaMock.expoPage.updateMany.mockRejectedValue(new Error("down"));
    expect((await post(JSON.stringify({ pageId: "pg1" }))).status).toBe(204);
  });
});
