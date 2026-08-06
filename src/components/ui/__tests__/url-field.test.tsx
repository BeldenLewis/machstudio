// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { UrlField } from "../primitives";
import { isHttpUrl, isHttpUrlOrSitePath } from "@/lib/webinar-config";

/**
 * UrlField — 어드민의 URL 칸 12곳이 공유하는 프리미티브.
 *
 * 이 파일이 붙잡는 것은 **자동 https:// 붙이기가 값의 뜻을 바꾸지 않는다** 는 것이다.
 * 배포 전 리뷰가 잡은 실제 결함: "붙였을 때 파싱되면 붙인다" 규칙은 호스트가 없어도
 * 통과하는 new URL() 때문에 아래를 조용히 망가진 절대 URL 로 바꿨고, 그 결과가 protocol
 * https 라 경고조차 뜨지 않았다.
 *   /webinarlive → https://webinarlive/      · /files/deck.pdf → https://files/deck.pdf
 *   999          → https://0.0.3.231/        · tally           → https://tally/
 * 실측 피해: 배포 탭 라이브 페이지 URL 에 `/webinarlive` 를 적으면 파트너 사이트 입장 버튼이
 * 죽은 호스트로 나갔다(전에는 라우트가 null 로 만들고 로더가 올바른 URL 로 폴백했다).
 */

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let host: HTMLDivElement | null = null;
let root: Root | null = null;

/** 실제 컴포넌트를 제어형으로 띄우고, blur 뒤의 값을 돌려준다. */
function blurWith(raw: string, predicate: (v: string) => boolean): { value: string; warned: boolean } {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  let current = "";
  const render = () => {
    root?.render(
      <UrlField
        label="테스트 URL"
        value={current}
        onChange={(next) => { current = next; render(); }}
        placeholder="https://…"
        isValidHttpUrl={predicate}
      />,
    );
  };
  act(() => render());
  const input = host.querySelector("input")!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, raw);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  // React 17+ 는 onBlur 를 루트에서 focusout 으로 위임받는다 — 네이티브 blur 는 버블링하지 않는다.
  act(() => { input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
  return { value: current, warned: (host.textContent ?? "").includes("저장되지 않아요") };
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  host = null;
  root = null;
});

describe("자동 https:// — 도메인처럼 생긴 값만", () => {
  it.each([
    ["www.acme.co.kr", "https://www.acme.co.kr"],
    ["cdn.io/hero.jpg", "https://cdn.io/hero.jpg"],
    ["localhost/x", "https://localhost/x"],
    ["user@example.com/p", "https://user@example.com/p"],
  ])("스킴만 없는 도메인은 살린다: %s", (raw, expected) => {
    expect(blurWith(raw, isHttpUrl).value).toBe(expected);
  });

  /**
   * `localhost:3000` 은 **손대지 않는다** — HAS_SCHEME 이 `localhost:` 를 스킴으로 읽는다.
   * 포트가 붙은 호스트와 스킴을 정규식으로 구분할 방법이 없고, 어드민에서 포트 있는 주소를
   * 넣는 건 개발 중에만 있는 일이라 그대로 둔다(경고는 뜨므로 조용히 망가지지 않는다).
   */
  it("포트가 붙은 localhost 는 스킴으로 읽혀 손대지 않는다", () => {
    const r = blurWith("localhost:3000/x", isHttpUrl);
    expect(r.value).toBe("localhost:3000/x");
    expect(r.warned).toBe(true);
  });

  /**
   * 호스트 자리가 도메인이 아니면 **건드리지 않는다.** 건드리면 뜻이 바뀐 URL 을 만들면서
   * protocol 이 https 라 경고도 안 뜬다 — 값이 조용히 망가지는 최악의 조합이다.
   */
  it.each(["/webinarlive", "/files/deck.pdf", "999", "tally", "webinarlive", "files/deck.pdf"])(
    "호스트가 아닌 값은 원문 그대로 남는다: %s",
    (raw) => {
      expect(blurWith(raw, isHttpUrl).value).toBe(raw);
    },
  );

  it("호스트가 아닌 값은 경고가 그대로 떠 있다 — 통과시킨 척하지 않는다", () => {
    for (const raw of ["/webinarlive", "999", "tally"]) {
      expect(blurWith(raw, isHttpUrl).warned, raw).toBe(true);
    }
  });

  it("이미 스킴이 있으면 손대지 않는다", () => {
    for (const raw of ["http://acme.co.kr", "https://acme.co.kr", "javascript:alert(1)", "mailto:a@b.c"]) {
      expect(blurWith(raw, isHttpUrl).value, raw).toBe(raw);
    }
  });

  it("javascript: 는 경고 대상이다 — 스킴이 있어 붙이지도 않는다", () => {
    expect(blurWith("javascript:alert(1)", isHttpUrl).warned).toBe(true);
  });
});

/**
 * 내부 경로가 정상인 칸(종료 자료·다음 웨비나·CTA 버튼·팝업 버튼) — 뷰어가 이 값을
 * safeHttpUrl 로 걸러내지 않고 href 에 그대로 넣기 때문에 `/files/x.pdf` 가 실제로 동작한다.
 * http(s) 만 통과시키면 화면이 **거짓으로** "저장되지 않아요" 라고 말한다(저장도 되고 링크도 먹는다).
 */
describe("내부 경로 허용 칸", () => {
  it("사이트 내부 경로는 경고 없이 통과한다", () => {
    const r = blurWith("/files/deck.pdf", isHttpUrlOrSitePath);
    expect(r.value).toBe("/files/deck.pdf");
    expect(r.warned).toBe(false);
  });

  it("프로토콜 상대 URL(//evil.com)은 내부 경로가 아니다 — 외부로 나간다", () => {
    expect(isHttpUrlOrSitePath("//evil.com")).toBe(false);
    expect(blurWith("//evil.com", isHttpUrlOrSitePath).warned).toBe(true);
  });

  it("javascript:·data: 는 여기서도 막힌다", () => {
    expect(isHttpUrlOrSitePath("javascript:alert(1)")).toBe(false);
    expect(isHttpUrlOrSitePath("data:text/html,<script>")).toBe(false);
  });

  it("http(s) 는 당연히 통과", () => {
    expect(isHttpUrlOrSitePath("https://cdn.io/a.pdf")).toBe(true);
  });
});

describe("빈 값", () => {
  it("빈 칸에는 경고를 띄우지 않고 blur 에도 아무 일이 없다", () => {
    const r = blurWith("", isHttpUrl);
    expect(r.value).toBe("");
    expect(r.warned).toBe(false);
  });

  /**
   * `type="url"` 은 HTML 표준의 value sanitization 으로 **앞뒤 공백을 스스로 지운다.**
   * 그래서 공백만 입력하면 빈 값이 되고, blur 도 아무 일을 하지 않는다 — 이게 우리가 원하는
   * 결과이고, 여기 적어 두는 이유는 이 동작이 UrlField 의 코드가 아니라 input type 에서
   * 온다는 것을 나중에 헷갈리지 않게 하려는 것이다.
   */
  it("공백만 입력하면 type=url 이 스스로 지운다 — blur 도 아무 일 없다", () => {
    const r = blurWith("   ", isHttpUrl);
    expect(r.value).toBe("");
    expect(r.warned).toBe(false);
  });
});
