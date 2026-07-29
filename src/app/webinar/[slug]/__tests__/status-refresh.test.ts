import { describe, expect, it, vi } from "vitest";
import { readStatusRefresh } from "../status-refresh";

function response(body: unknown, ok = true) {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe("live status waiting count refresh", () => {
  it.each([
    {},
    { status: "registration" },
    { status: "unknown", entryOpen: false },
    { status: "live", entryOpen: "yes" },
  ])("isolates malformed 200 state payload %j from the public screen", async (body) => {
    const refresh = await readStatusRefresh(() => Promise.resolve(response(body)));

    expect(refresh).toEqual({ data: null, waitingCount: null, registrantCount: null });
  });

  it("clears a previously successful band input after every unsuccessful refresh path", async () => {
    let bandInput: number | null = null;

    bandInput = (await readStatusRefresh(() => Promise.resolve(response({
      waitingCount: 3,
      status: "registration",
      entryOpen: false,
    })))).waitingCount;
    expect(bandInput).toBe(3);

    bandInput = (await readStatusRefresh(() => Promise.resolve(response({}, false)))).waitingCount;
    expect(bandInput).toBeNull();

    bandInput = (await readStatusRefresh(() => Promise.resolve(response({
      waitingCount: "3",
      status: "registration",
      entryOpen: false,
    })))).waitingCount;
    expect(bandInput).toBeNull();

    bandInput = (await readStatusRefresh(() => Promise.reject(new Error("network")))).waitingCount;
    expect(bandInput).toBeNull();
  });

  /**
   * 사회적 증거 밴드가 쓰는 값은 registrantCount(누적 사전등록자)다 — waitingCount(지금 대기
   * 인원)와 **다른 수**이고, 하나가 없다고 다른 하나를 대신 쓰면 화면이 거짓말을 한다.
   */
  it("keeps the two counts independent", async () => {
    const both = await readStatusRefresh(() => Promise.resolve(response({
      waitingCount: 3, registrantCount: 128, status: "registration", entryOpen: false,
    })));
    expect(both.waitingCount).toBe(3);
    expect(both.registrantCount).toBe(128);

    // 한쪽만 계약을 어기면 그쪽만 null 로 떨어진다
    const partial = await readStatusRefresh(() => Promise.resolve(response({
      waitingCount: 3, registrantCount: "128", status: "registration", entryOpen: false,
    })));
    expect(partial.waitingCount).toBe(3);
    expect(partial.registrantCount).toBeNull();

    // 서버가 라이브 중이라 대기 인원을 안 세도(null) 등록자 수는 살아 있다
    const liveNow = await readStatusRefresh(() => Promise.resolve(response({
      waitingCount: null, registrantCount: 128, status: "live", entryOpen: true,
    })));
    expect(liveNow.waitingCount).toBeNull();
    expect(liveNow.registrantCount).toBe(128);
  });
});
