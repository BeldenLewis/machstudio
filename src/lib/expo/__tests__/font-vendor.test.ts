// @vitest-environment node
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXPO_FONT_DIR, EXPO_FONT_PATH } from "@/lib/expo/css";

/**
 * 반입한 서체 파일이 **그 파일 그대로**인지.
 *
 * 이 파일은 파트너 사이트에서 로드된다. CDN 을 안 쓰는 이유가 "우리가 모르는 사이 바뀌는
 * 것" 을 막으려는 것이므로, 저장소 안에서도 같은 보장이 있어야 한다 — 그래서 바이트를 센다.
 *
 * 실패하면: 파일이 바뀌었거나 사라진 것이다. `npm run check:expo-font` 가 무엇을 해야
 * 하는지 알려 준다. 의도한 교체라면 **새 버전 디렉터리**를 만든다 — 캐시가 1년이다.
 */
describe("서체 반입", () => {
  it("해시·라이선스·출처 검사를 통과한다", () => {
    // 스크립트가 실패하면 stderr 를 그대로 보여 주며 던진다.
    const out = execFileSync("node", ["scripts/check-expo-font.mjs"], { encoding: "utf8" });
    expect(out).toContain("모두 확인");
  });

  it("코드가 가리키는 경로에 실제로 있다", () => {
    expect(existsSync(`public${EXPO_FONT_PATH}`)).toBe(true);
    expect(existsSync(`public${EXPO_FONT_DIR}/OFL.txt`)).toBe(true);
  });

  /** 재배포 조건이다 — 폰트만 넣고 라이선스를 빼면 안 된다. */
  it("OFL 1.1 전문을 함께 둔다", () => {
    const text = readFileSync(`public${EXPO_FONT_DIR}/OFL.txt`, "utf8");
    expect(text).toContain("SIL OPEN FONT LICENSE Version 1.1");
    expect(text).toContain("Pretendard");
  });

  /** proxy 를 안 열면 파트너 사이트의 요청이 로그인으로 307 된다(실측). */
  it("proxy 가 그 정확한 접두사를 열어 둔다", () => {
    expect(readFileSync("src/proxy.ts", "utf8")).toContain(`pathname.startsWith("${EXPO_FONT_DIR}/")`);
  });

  /** 폰트는 항상 CORS 로 받는다 — 헤더가 없으면 콘솔에만 보이는 조용한 실패다. */
  it("응답 헤더에 CORS·CORP·불변 캐시가 있다", () => {
    const config = readFileSync("next.config.ts", "utf8");
    expect(config).toContain(`source: "${EXPO_FONT_DIR}/:path*"`);
    expect(config).toContain("Access-Control-Allow-Origin");
    expect(config).toContain("Cross-Origin-Resource-Policy");
    expect(config).toContain("immutable");
  });
});
