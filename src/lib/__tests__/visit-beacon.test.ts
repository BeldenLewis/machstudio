// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendVisitBeacon } from "@/lib/attribution-client";
import { LANDING_RUNTIME_JS } from "@/generated/landing-runtime";

/**
 * 방문 비콘 — 퍼널의 **분모**다. 이게 빠지면 등록률이 통째로 무의미해진다.
 *
 * 실제로 났던 사고(8/11 웨비나, 실측): 등록 262건이 전부 아임웹 랜딩
 * `k-expo.org/webinar` 에서 일어나는데 그 페이지의 방문은 **0** 이었다.
 *   · 그 페이지는 랜딩 임베드(`data-ms-landing-mount` + `/w/l/{slug}`) 를 쓴다
 *   · 로더의 seen 비콘은 `data-mach-webinar-mount` 만 찾아서 `visit:false` 로 보낸다
 *     → 연결 배지(lastSeenAt)만 갱신되고 방문은 안 쌓였다
 *   · 결과: meta 광고 방문 1 · 등록 174 → 등록률 17,400%
 * 그래서 랜딩 임베드가 직접 방문 비콘을 보내고, 그 사실을 여기서 묶는다.
 */

const beacons: { url: string; body: string }[] = [];

beforeEach(() => {
  beacons.length = 0;
  vi.stubGlobal("navigator", {
    sendBeacon: (url: string, body: string) => { beacons.push({ url, body }); return true; },
  });
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

afterEach(() => vi.unstubAllGlobals());

describe("임베드는 절대 URL 로 보내야 한다", () => {
  /**
   * 이게 이 옵션의 존재 이유다. 랜딩 임베드는 호스트 문서(k-expo.org)에서 돌아서
   * 상대경로 POST 가 호스트 도메인으로 날아간다 — 404 가 되고 방문이 사라진다.
   */
  it("origin 을 주면 그 도메인으로 POST 한다", () => {
    sendVisitBeacon("my-slug", { origin: "https://machstudio.vercel.app" });
    expect(beacons).toHaveLength(1);
    expect(beacons[0].url).toBe("https://machstudio.vercel.app/api/webinar/my-slug/visit");
  });

  it("origin 이 없으면 상대경로 — 자체 페이지 경로", () => {
    sendVisitBeacon("my-slug");
    expect(beacons[0].url).toBe("/api/webinar/my-slug/visit");
  });

  /** http(s) 가 아닌 값은 쓰지 않는다 — 우리 라우트가 구워 보내는 값이지만 방어한다. */
  it("이상한 origin 은 무시하고 상대경로로 되돌린다", () => {
    for (const bad of ["javascript:alert(1)", "not-a-url", "ftp://x.io", ""]) {
      beacons.length = 0;
      sessionStorage.clear();
      sendVisitBeacon("s", { origin: bad });
      expect(beacons[0].url, bad).toBe("/api/webinar/s/visit");
    }
  });

  it("슬러그를 URL 인코딩한다", () => {
    sendVisitBeacon("a b/c", { origin: "https://x.io" });
    expect(beacons[0].url).toBe("https://x.io/api/webinar/a%20b%2Fc/visit");
  });
});

describe("세션당 1회 · 미리보기 제외", () => {
  it("같은 슬러그는 세션에서 한 번만", () => {
    sendVisitBeacon("s", { origin: "https://x.io" });
    sendVisitBeacon("s", { origin: "https://x.io" });
    expect(beacons).toHaveLength(1);
  });

  it("다른 슬러그는 각각 한 번", () => {
    sendVisitBeacon("a");
    sendVisitBeacon("b");
    expect(beacons).toHaveLength(2);
  });

  /** 운영자 미리보기가 분모를 올리면 등록률이 낮아진다(공개 면 부작용 규약). */
  it("?preview 에서는 보내지 않는다", () => {
    window.history.replaceState({}, "", "/?preview=live");
    sendVisitBeacon("s", { origin: "https://x.io" });
    expect(beacons).toHaveLength(0);
  });
});

/**
 * 번들은 커밋된 생성물이다 — 누군가 `build-landing-runtime.mjs` 를 다시 돌렸는데 비콘이
 * 빠지면 방문이 조용히 0으로 돌아간다. 그래서 문자열 자체를 검사한다
 * (attribution-normalize.test.ts 가 임베드 로더 문자열을 검사하는 것과 같은 이유).
 */
describe("커밋된 랜딩 런타임 번들에 방문 비콘이 실려 있다", () => {
  it("/visit 경로가 번들에 있다", () => {
    expect(LANDING_RUNTIME_JS).toContain("/visit");
  });

  it("세션 키 가드도 함께 실려 있다 — 매 렌더마다 세지 않게", () => {
    expect(LANDING_RUNTIME_JS).toContain("mach_visit_");
  });

  it("sendBeacon 을 쓴다 — 페이지를 떠나도 전송이 보장되게", () => {
    expect(LANDING_RUNTIME_JS).toContain("sendBeacon");
  });
});
