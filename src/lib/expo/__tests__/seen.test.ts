// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reportExpoSeen, resetExpoSeen } from "@/lib/expo/seen";

/**
 * 비콘 **전송 방식**.
 *
 * 이 저장소는 여기서 실제 장애를 겪었다: 수집 스크립트가 `Blob`(application/json)으로
 * `sendBeacon` 을 불렀고, 그건 안전 목록에 없는 Content-Type 이라 **프리플라이트가
 * 필요해진다.** 그게 막혀 콘솔을 열어야만 보이는 조용한 실패가 됐다.
 *
 * 그래서 이 테스트가 지키는 것은 하나다: **단순 요청으로 남는가.**
 */

const ORIGIN = "https://mach.example.com";

function transport(options: { beaconOk?: boolean } = {}) {
  const sendBeacon = vi.fn((_url: string, _data?: BodyInit | null) => options.beaconOk !== false);
  const fetchFn = vi.fn(async () => new Response(null, { status: 204 }));
  return { sendBeacon, fetch: fetchFn as unknown as typeof fetch };
}

beforeEach(() => {
  resetExpoSeen(globalThis as never);
});

describe("단순 요청으로 남는다", () => {
  it("평문 문자열을 보낸다 — Blob 이 아니다", () => {
    const t = transport();
    expect(reportExpoSeen({ origin: ORIGIN, pageId: "pg1" }, { transport: t })).toBe(true);
    const [url, data] = t.sendBeacon.mock.calls[0];
    expect(url).toBe(`${ORIGIN}/api/expo-embed/seen`);
    expect(typeof data).toBe("string");
    expect(data).not.toBeInstanceOf(Blob);
    expect(JSON.parse(data as string)).toEqual({ pageId: "pg1" });
  });

  /** 헤더를 하나라도 붙이면 단순 요청이 아니게 되고 프리플라이트가 생긴다. */
  it("폴백 fetch 도 헤더를 붙이지 않는다", () => {
    const t = transport({ beaconOk: false });
    reportExpoSeen({ origin: ORIGIN, pageId: "pg1" }, { transport: t });
    const [, init] = (t.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init).toMatchObject({ method: "POST", keepalive: true, credentials: "omit" });
    expect(init).not.toHaveProperty("headers");
    expect(typeof init.body).toBe("string");
  });

  it("sendBeacon 이 없으면 fetch 로 간다", () => {
    const t = transport();
    reportExpoSeen({ origin: ORIGIN, pageId: "pg1" }, { transport: { fetch: t.fetch } });
    expect(t.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("한 번만 보낸다", () => {
  /** 아임웹 재렌더가 잦은 사이트에서 재마운트마다 보내면 같은 값이 초당 여러 번 갱신된다. */
  it("같은 대상은 두 번 보내지 않는다", () => {
    const t = transport();
    expect(reportExpoSeen({ origin: ORIGIN, pageId: "pg1" }, { transport: t })).toBe(true);
    expect(reportExpoSeen({ origin: ORIGIN, pageId: "pg1" }, { transport: t })).toBe(false);
    expect(t.sendBeacon).toHaveBeenCalledTimes(1);
  });

  it("페이지와 구획은 따로 센다", () => {
    const t = transport();
    reportExpoSeen({ origin: ORIGIN, pageId: "pg1" }, { transport: t });
    reportExpoSeen({ origin: ORIGIN, pageId: "pg1", sectionId: "sid-1" }, { transport: t });
    expect(t.sendBeacon).toHaveBeenCalledTimes(2);
    expect(JSON.parse(t.sendBeacon.mock.calls[1][1] as string))
      .toEqual({ pageId: "pg1", sectionId: "sid-1" });
  });
});

describe("주소를 지어내지 않는다", () => {
  /** 상대주소면 파트너 도메인으로 쏜다 — 아무 데도 안 닿고 그쪽 404 로그만 늘린다. */
  it("절대 http(s) 가 아니면 보내지 않는다", () => {
    for (const bad of ["", "/", "//cdn.example.com", "mach.example.com"]) {
      const t = transport();
      expect(reportExpoSeen({ origin: bad, pageId: "pg1" }, { transport: t })).toBe(false);
      expect(t.sendBeacon).not.toHaveBeenCalled();
    }
  });
});
