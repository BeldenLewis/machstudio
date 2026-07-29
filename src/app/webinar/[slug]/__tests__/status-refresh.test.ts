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

    expect(refresh).toEqual({ data: null, waitingCount: null });
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
});
