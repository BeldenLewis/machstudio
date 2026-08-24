import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { LANDING_RUNTIME_JS, LANDING_RUNTIME_SRC_HASH } from "@/generated/landing-runtime";
import { FORM_RUNTIME_JS, FORM_RUNTIME_SRC_HASH } from "@/generated/form-runtime";
import { COLLECT_FORM_CSS } from "@/lib/collect-form/css";
import { formSourceHash, landingSourceHash } from "../../../scripts/runtime-hash.mjs";

const ROOT = resolve(__dirname, "../../..");

/**
 * ── 커밋된 번들이 소스와 맞는가 ──────────────────────────────────────
 *
 * 두 런타임 모두 **생성물을 커밋**해서 라우트가 문자열 그대로 서빙한다. 그래서 소스를 고치고
 * 번들을 다시 굽지 않으면 **배포는 성공하는데 옛 코드가 돈다** — 가장 알아채기 어려운 종류의
 * 사고다(로컬에서는 predev 가 매번 다시 구워 주므로 개발자 화면에서는 멀쩡하다).
 *
 * 랜딩 쪽은 해시를 굽기만 하고 **비교하는 코드가 어디에도 없었다.** 폼 런타임을 붙이면서
 * 둘 다 여기서 검사한다.
 */
describe("임베드 번들이 소스와 동기화돼 있다", () => {
  it("랜딩 런타임", () => {
    expect(LANDING_RUNTIME_SRC_HASH).toBe(landingSourceHash(ROOT));
  });

  it("등록 폼 런타임", () => {
    expect(FORM_RUNTIME_SRC_HASH).toBe(formSourceHash(ROOT));
  });
});

/**
 * ── 호스트 문서 안전 ────────────────────────────────────────────────
 *
 * 이 코드들은 파트너 사이트(아임웹 등) 문서에 **직접 마운트된다.** 서버에서 이스케이프한
 * HTML 을 innerHTML 로 넣는 방식이면 렌더 함수 한 곳에서 esc() 를 빠뜨리는 순간 파트너
 * 도메인 전체가 XSS 에 노출된다. h.ts 머리말이 "이 테스트가 강제한다" 고 적고 있는데
 * **실제로는 그 테스트가 없었다** — 여기서 만든다.
 */
/**
 * `src/lib/expo` 도 여기 든다 — 홈페이지 임베드는 파트너 문서 안의 Shadow 에 마운트된다.
 * Shadow 경계는 **CSS 를 막지 XSS 를 막지 않는다**: Shadow 안에서 실행된 스크립트도
 * 파트너 도메인의 스크립트이고, 그 페이지의 쿠키·DOM 에 전부 닿는다.
 *
 * 예외는 `iframe.srcdoc` 하나다(custom-code). 그건 운영자가 붙여넣은 코드를 **격리해서**
 * 실행하려고 일부러 쓰는 것이고, 아래 금지 목록에 들어 있지 않다.
 */
const HOST_MOUNTED_DIRS = ["src/lib/landing", "src/lib/collect-form", "src/lib/dom", "src/lib/expo", "src/embed"];
const BANNED = ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write"];

/**
 * **아직 이 규칙을 못 지키는 파일들.** 목록을 늘리지 마라 — 줄이려고 두는 것이다.
 *
 * 대회 임베드 3종은 HTML 문자열로 마운트한다. 값은 escapeHtml 을 거치고 있어서 지금
 * 당장 뚫린 곳을 찾은 것은 아니지만, 이 규칙의 요점은 "이스케이프를 빠뜨렸는지 매번
 * 눈으로 확인해야 하는 구조를 애초에 만들지 않는다" 이다 — 한 군데만 놓쳐도 파트너
 * 페이지에서 임의 스크립트가 돈다.
 *
 * 예외로 둔 이유: 이 세 파일은 다른 작업(PR #116)의 산출물이고, 사전등록 브랜치를
 * 내보내려고 남의 코드를 재작성하는 것은 범위를 벗어난다. 규칙 자체를 없애면 내
 * 런타임의 보호도 같이 사라지므로, **지운 게 아니라 이름을 적어 남긴다.**
 */
const KNOWN_VIOLATIONS = new Set([
  "src/embed/competition-entry.ts",
  "src/embed/competition-vote-entry.ts",
  "src/embed/competition-result-entry.ts",
]);

/**
 * 주석은 검사에서 뺀다 — 이 파일들의 주석은 "innerHTML 을 쓰지 않는 이유" 를 설명하느라
 * 금지어를 그대로 적는다. 규칙은 **코드**에 대한 것이다.
 *
 * 문자열 안의 `//`(URL 등)도 같이 잘리지만, 그건 텍스트가 줄어드는 방향이라 금지어를
 * 놓치는 쪽으로만 틀릴 수 있다 — 이 파일들에 그런 문자열은 없고, 생기면 별건으로 다룬다.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
}

function tsFilesUnder(rel: string): string[] {
  const dir = join(ROOT, rel);
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.isDirectory()) {
      // 테스트는 검사 대상이 아니다 — 단언문에 금지어가 등장할 수 있다.
      if (name.name === "__tests__") continue;
      out.push(...tsFilesUnder(join(rel, name.name)));
      continue;
    }
    if (name.name.endsWith(".ts") || name.name.endsWith(".tsx")) out.push(join(rel, name.name));
  }
  // Windows 에서는 join 이 역슬래시를 준다 — 예외 목록(KNOWN_VIOLATIONS)은 슬래시 표기라
  // 그대로 두면 목록이 아무것도 못 걸러 **개발자 기계에서만** 4건이 실패한다(CI 는 리눅스라 통과).
  return out.map((f) => f.split(sep).join("/"));
}

describe("호스트 문서에 마운트되는 코드는 HTML 문자열을 쓰지 않는다", () => {
  const allFiles = HOST_MOUNTED_DIRS.flatMap(tsFilesUnder);
  const files = allFiles.filter((f) => !KNOWN_VIOLATIONS.has(f));

  /** 예외 목록이 유령을 가리키면(파일명이 바뀌거나 지워지면) 조용히 무의미해진다. */
  it("예외 목록의 파일이 실재한다", () => {
    for (const f of KNOWN_VIOLATIONS) expect(allFiles).toContain(f);
  });

  it("검사 대상이 실제로 잡힌다 — 경로가 바뀌면 0건 통과로 조용히 무력화된다", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files)("%s", (rel) => {
    const src = stripComments(readFileSync(join(ROOT, rel), "utf8"));
    for (const banned of BANNED) {
      expect(src, `${rel} 이 ${banned} 를 쓴다 — h() 로 DOM 을 만들 것`).not.toContain(banned);
    }
  });
});

/**
 * ── 템플릿 리터럴 함정 ──────────────────────────────────────────────
 * CSS 는 TS 템플릿 리터럴로 들고 있다. 그 안에 백틱이나 달러+중괄호가 하나라도 들어가면
 * **문자열이 거기서 끊겨** 뒤가 코드로 해석된다(esbuild 가 "Expected ; but found span" 으로
 * 죽는다 — 실제로 밟았다). 주석에 선택자를 인용하려다 백틱을 쓰는 게 전형적인 경로다.
 * 웨비나 로더·랜딩 CSS 도 같은 제약을 주석으로만 적어 뒀는데, 주석은 잊힌다.
 */
describe("문자열로 들고 있는 CSS 는 템플릿 리터럴을 깨지 않는다", () => {
  it("백틱과 달러+중괄호가 없다", () => {
    expect(COLLECT_FORM_CSS).not.toContain("`");
    expect(COLLECT_FORM_CSS).not.toContain("${");
  });
});

/**
 * 번들에 실제로 들어갔는지 — import 를 지워도 타입은 통과하므로 문자열로 확인한다.
 * (랜딩 쪽 visit-beacon 테스트가 같은 이유로 같은 방식을 쓴다.)
 */
describe("폼 번들에 핵심 경로가 실려 있다", () => {
  it("제출·중복확인 엔드포인트", () => {
    expect(FORM_RUNTIME_JS).toContain("/submit");
    expect(FORM_RUNTIME_JS).toContain("/check");
  });

  it("dataLayer 창구(§18) — 픽셀을 직접 부르지 않는다", () => {
    expect(FORM_RUNTIME_JS).toContain("dataLayer");
    expect(FORM_RUNTIME_JS).toContain("generate_lead");
    expect(FORM_RUNTIME_JS).not.toContain("fbq(");
    expect(FORM_RUNTIME_JS).not.toContain("gtag(");
  });

  it("스타일이 함께 실려 있다 — 별도 CSS 요청이 없어야 요청 1회로 끝난다", () => {
    expect(FORM_RUNTIME_JS).toContain(".msf");
  });
});
