import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 로그인 시점 DB User 행 보장.
 *
 * 이 함수는 **앱 첫 화면의 필수 경로**(/api/workspace GET)에 있다. 그래서 지켜야 하는 것이
 * "행을 만든다" 만이 아니다:
 *   · 있으면 쓰지 않는다 — 매 화면 로드가 쓰기 문장이 되면 안 된다.
 *   · 실패해도 던지지 않는다 — 여기서 예외가 나가면 사용자는 워크스페이스 목록조차 못 받는다.
 *     안 보이는 것보다 못 쓰는 게 나쁘다.
 * 셋 다 눈으로는 확인이 안 되는 종류라 여기서 고정한다.
 */

const findUnique = vi.fn();
const create = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      create: (...args: unknown[]) => create(...args),
    },
  },
}));

const { ensureAppUser } = await import("@/lib/app-user");

const authUser = (patch: Record<string, unknown> = {}) => ({
  id: "auth-1",
  email: "Ho@Exporum.com",
  user_metadata: { name: "엄재호" },
  ...patch,
});

beforeEach(() => {
  findUnique.mockReset();
  create.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("이미 있으면 건드리지 않는다", () => {
  it("행이 있으면 create 를 부르지 않는다 — 화면 로드마다 쓰기가 나가면 안 된다", async () => {
    findUnique.mockResolvedValue({ isSuperAdmin: true });
    expect(await ensureAppUser(authUser())).toEqual({ isSuperAdmin: true });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("없으면 만든다 — 워크스페이스와 무관하게", () => {
  it("auth id 를 그대로 쓰고 이메일은 소문자로 — 초대 조회가 이메일로 찾는다", async () => {
    findUnique.mockResolvedValue(null);
    create.mockResolvedValue({ isSuperAdmin: false });

    await ensureAppUser(authUser());

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).toEqual({
      id: "auth-1",
      email: "ho@exporum.com",
      name: "엄재호",
    });
  });

  it("이름이 없으면 이메일을 이름으로 — name 은 필수라 비면 만들 수 없다", async () => {
    findUnique.mockResolvedValue(null);
    create.mockResolvedValue({ isSuperAdmin: false });

    for (const meta of [undefined, null, {}, { name: "" }, { name: "   " }, { name: 42 }]) {
      create.mockClear();
      await ensureAppUser(authUser({ user_metadata: meta }));
      expect(create.mock.calls[0][0].data.name, JSON.stringify(meta)).toBe("ho@exporum.com");
    }
  });

  it("이메일이 없는 계정은 만들지 않는다 — email 이 필수·유니크다", async () => {
    findUnique.mockResolvedValue(null);
    for (const email of [undefined, null, ""]) {
      create.mockClear();
      expect(await ensureAppUser(authUser({ email })), String(email)).toBeNull();
      expect(create).not.toHaveBeenCalled();
    }
  });
});

describe("실패는 앱을 막지 않는다", () => {
  /**
   * 같은 이메일이 **다른 id** 로 이미 있으면 email 유니크 제약에 걸린다(지운 Auth 계정의
   * 잔여 행 등). 조용히 덮어쓰면 남의 계정을 가져가므로 만들지 않고, 그렇다고 던지지도 않는다.
   */
  it("생성이 유니크 제약으로 실패해도 null 을 돌려준다 — 던지면 첫 화면이 안 뜬다", async () => {
    findUnique.mockResolvedValue(null);
    create.mockRejectedValue(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
    await expect(ensureAppUser(authUser())).resolves.toBeNull();
  });

  it("조회 자체가 실패해도 null 을 돌려준다 — DB 순간 장애가 로그인을 막지 않는다", async () => {
    findUnique.mockRejectedValue(new Error("connection reset"));
    await expect(ensureAppUser(authUser())).resolves.toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("실패를 조용히 삼키지 않는다 — 로그가 없으면 유령 계정이 다시 생겨도 모른다", async () => {
    findUnique.mockRejectedValue(new Error("boom"));
    await ensureAppUser(authUser());
    expect(console.error).toHaveBeenCalled();
  });
});
