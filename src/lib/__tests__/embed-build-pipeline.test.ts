// @vitest-environment node
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

/**
 * 빌드 파이프라인의 **연결이 끊기지 않았는지**.
 *
 * 생성물을 커밋하는 구조라, 연결이 하나 끊기면 배포는 성공하는데 **옛 코드가 돈다.**
 * 그리고 로컬에서는 predev 가 매번 다시 구워 주므로 개발자 화면에서는 멀쩡하다 —
 * 사람 눈으로 잡을 수 있는 종류가 아니다.
 */
describe("임베드 빌드 연결", () => {
  it("여섯 생성물이 모두 집합 스크립트에 있다", () => {
    const aggregate = pkg.scripts["build:embed-runtimes"];
    for (const script of [
      "build-landing-runtime.mjs",
      "build-competition-runtime.mjs",
      "build-competition-vote-runtime.mjs",
      "build-competition-result-runtime.mjs",
      "build-form-runtime.mjs",
      "build-expo-runtime.mjs",
    ]) {
      expect(`${script}: ${aggregate.includes(script)}`).toBe(`${script}: true`);
    }
  });

  it("빌드·개발 전에 집합 스크립트가 돈다", () => {
    expect(pkg.scripts.prebuild).toContain("build:embed-runtimes");
    expect(pkg.scripts.predev).toContain("build:embed-runtimes");
  });

  /**
   * 홈페이지 번들은 생성물인 `shell-css.ts` 를 문자열로 안고 들어간다. CSS 를 고치고
   * 시트를 재생성하지 않으면 **낡은 스타일이 새 번들에 그대로 구워진다.**
   * package.json 의 순서에만 기대지 않고 빌드 스크립트가 직접 부른다.
   */
  it("홈페이지 번들 빌드가 시트 생성을 먼저 부른다", () => {
    const source = readFileSync(join(ROOT, "scripts/build-expo-runtime.mjs"), "utf8");
    const callsSheet = source.indexOf("build-expo-shell-css.mjs");
    const callsBuild = source.indexOf("await build(");
    expect(callsSheet).toBeGreaterThan(-1);
    expect(callsSheet).toBeLessThan(callsBuild);
  });

  /** 라우트가 스크립트 본문으로 내려보내므로 이 두 리터럴은 빌드 단계에서 막는다. */
  it("홈페이지 번들 빌드가 위험한 리터럴을 스스로 막는다", () => {
    const source = readFileSync(join(ROOT, "scripts/build-expo-runtime.mjs"), "utf8");
    expect(source).toContain("</script");
    expect(source).toContain("process.env");
    expect(source).toContain("throw new Error");
  });
});
