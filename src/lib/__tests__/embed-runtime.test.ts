import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
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
const HOST_MOUNTED_DIRS = ["src/lib/landing", "src/lib/collect-form", "src/lib/dom", "src/embed"];
const BANNED = ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write"];

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
  return out;
}

describe("호스트 문서에 마운트되는 코드는 HTML 문자열을 쓰지 않는다", () => {
  const files = HOST_MOUNTED_DIRS.flatMap(tsFilesUnder);

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
