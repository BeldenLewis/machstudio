// @vitest-environment node
import { build } from "esbuild";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  competitionResultSourceFiles, competitionSourceFiles, competitionVoteSourceFiles,
  expoSourceFiles, formSourceFiles, landingSourceFiles,
} from "../../../scripts/runtime-hash.mjs";

/**
 * 소스 목록이 **실제 번들 입력과 같은지**.
 *
 * ── 왜 이 검사가 필요한가 ─────────────────────────────────────────────
 * stale 검사(embed-runtime.test.ts)는 "목록에 적힌 파일들의 해시" 를 커밋된 값과 비교한다.
 * 그러니 **목록에서 빠진 파일**은 아무리 바뀌어도 검사가 초록이다 — 커밋된 번들은 낡았는데
 * 아무도 모른다. 그게 이 검사가 막으려던 바로 그 상황이다.
 *
 * ── 왜 여기서 esbuild 를 돌려도 되나 ──────────────────────────────────
 * `write:false` 라 생성물을 건드리지 않는다. 검사 대상을 검사가 새로 만들어 버리는 문제
 * (runtime-hash.mjs 주석 참고)는 **파일을 쓸 때** 생긴다.
 */

const ROOT = resolve(__dirname, "../../..");

async function bundleInputs(entry: string): Promise<string[]> {
  const result = await build({
    entryPoints: [join(ROOT, entry)],
    bundle: true,
    format: "iife",
    target: ["es2020", "safari16", "chrome105", "firefox110"],
    write: false,
    metafile: true,
    alias: { "@": join(ROOT, "src") },
    define: { "process.env.NODE_ENV": '"production"' },
  });
  return Object.keys(result.metafile.inputs).map((p) => resolve(ROOT, p)).sort();
}

describe("소스 목록 ↔ 실제 번들 입력", () => {
  /**
   * 실패하면: 번들에 파일이 새로 들어왔거나 빠진 것이다.
   * `scripts/runtime-hash.mjs` 의 목록을 실제 입력에 맞추고, 번들을 다시 구워 커밋한다.
   */
  it("등록 폼 런타임", async () => {
    const actual = await bundleInputs("src/embed/form-entry.ts");
    expect(formSourceFiles(ROOT)).toEqual(actual);
  }, 30_000);

  it("랜딩 런타임", async () => {
    const actual = await bundleInputs("src/embed/landing-entry.ts");
    expect(landingSourceFiles(ROOT)).toEqual(actual);
  }, 30_000);

  it("홈페이지 런타임", async () => {
    const actual = await bundleInputs("src/embed/expo-entry.ts");
    expect(expoSourceFiles(ROOT)).toEqual(actual);
  }, 30_000);

  /**
   * 대회 3종은 이 대조를 받은 적이 없었고, 받자마자 셋 다 어긋났다(2026-08-25):
   *   competition 11개 적힘 / 실제 20개 · vote 5개 / 6개 · result 3개 / 6개
   * 게다가 번들에 들어가지도 않는 파일을 해시하고 있었다. 즉 `competition-strings.ts`
   * (방문자에게 보이는 문구)를 고쳐도 stale 검사가 초록이었다.
   */
  it("대회 신청 런타임", async () => {
    const actual = await bundleInputs("src/embed/competition-entry.ts");
    expect(competitionSourceFiles(ROOT)).toEqual(actual);
  }, 30_000);

  it("대회 투표 런타임", async () => {
    const actual = await bundleInputs("src/embed/competition-vote-entry.ts");
    expect(competitionVoteSourceFiles(ROOT)).toEqual(actual);
  }, 30_000);

  it("대회 결과 런타임", async () => {
    const actual = await bundleInputs("src/embed/competition-result-entry.ts");
    expect(competitionResultSourceFiles(ROOT)).toEqual(actual);
  }, 30_000);
});
