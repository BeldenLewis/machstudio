import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { LANDING_RUNTIME_JS } from "@/generated/landing-runtime";
import { COMPETITION_RUNTIME_JS } from "@/generated/competition-runtime";
import { COMPETITION_VOTE_RUNTIME_JS } from "@/generated/competition-vote-runtime";
import { COMPETITION_RESULT_RUNTIME_JS } from "@/generated/competition-result-runtime";
import { FORM_RUNTIME_JS } from "@/generated/form-runtime";

/**
 * 임베드 번들이 **브라우저에서 로드되는가.**
 *
 * 실제로 이렇게 터졌다: 라이브러리 한 곳에 `process.env.NEXT_PUBLIC_...` 를 넣었는데,
 * esbuild 빌드는 `process.env.NODE_ENV` 만 치환한다. 다른 키는 그대로 번들에 남고,
 * 브라우저에는 `process` 가 없으므로 **파일을 읽는 순간 ReferenceError** 가 난다.
 * 런타임 전체가 죽어서 외부 사이트에 붙여 둔 랜딩이 검은 화면이 됐다.
 *
 * tsc·eslint·다른 테스트가 전부 통과하는 종류다 — 서버(Node)에서는 process 가 있으니까.
 * 그래서 **process 가 없는 환경에서 실제로 실행해 본다.**
 */
const RUNTIMES = [
  ["landing", LANDING_RUNTIME_JS],
  ["competition", COMPETITION_RUNTIME_JS],
  ["competition-vote", COMPETITION_VOTE_RUNTIME_JS],
  ["competition-result", COMPETITION_RESULT_RUNTIME_JS],
  ["form", FORM_RUNTIME_JS],
] as const;

/** 브라우저 흉내 — **process 를 넣지 않는다.** 그게 이 테스트의 전부다. */
function browserContext(): Record<string, unknown> {
  const el = () => ({
    style: {}, classList: { add() {}, remove() {} },
    setAttribute() {}, appendChild() {}, addEventListener() {},
  });
  const ctx: Record<string, unknown> = {
    document: {
      createElement: el, createTextNode: () => ({}), createDocumentFragment: () => ({}),
      head: { appendChild() {} }, body: { appendChild() {} },
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
      addEventListener() {},
    },
    navigator: {}, location: { href: "http://x", origin: "http://x" },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    setTimeout, clearTimeout, setInterval, clearInterval,
    console, JSON, Math, Date, URL, URLSearchParams,
  };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.globalThis = ctx;
  return ctx;
}

describe("임베드 번들이 브라우저에서 로드된다", () => {
  it.each(RUNTIMES)("%s", (_name, js) => {
    expect(() => vm.runInNewContext(js, browserContext(), { timeout: 10_000 })).not.toThrow();
  });

  /**
   * 위 실행 검사가 본체지만, 남은 참조 자체를 막아 두면 원인을 훨씬 빨리 찾는다.
   * NODE_ENV 는 빌드가 치환하므로 번들에 남지 않는다.
   */
  it.each(RUNTIMES)("%s — 치환되지 않은 process.env 를 그대로 쓰지 않는다", (_name, js) => {
    for (const match of js.match(/process\.env[.?[\]A-Za-z_]*/g) ?? []) {
      // 남아 있어도 typeof 가드 안이면 안전하다 — 가드 없는 알몸 참조만 잡는다.
      const at = js.indexOf(match);
      const before = js.slice(Math.max(0, at - 80), at);
      expect(before, `가드 없는 ${match}`).toMatch(/typeof process\s*[!<]/);
    }
  });
});
