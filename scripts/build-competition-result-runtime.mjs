/**
 * 대회 결과 발표 임베드 런타임 번들 빌드.
 *
 *   src/embed/competition-result-entry.ts  --esbuild(IIFE)-->  src/generated/competition-result-runtime.ts
 *
 * 투표 런타임(build-competition-vote-runtime.mjs)과 같은 규약이다: 생성물을 커밋하고,
 * /c/{id}/result 라우트가 이 문자열을 그대로 서빙한다.
 */
import { competitionResultSourceHash } from "./runtime-hash.mjs";
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "src/generated/competition-result-runtime.ts");


const result = await build({
  entryPoints: [join(root, "src/embed/competition-result-entry.ts")],
  bundle: true,
  format: "iife",
  globalName: "__msCompetitionResult",
  target: ["es2020", "safari16", "chrome105", "firefox110"],
  minify: true,
  legalComments: "none",
  write: false,
  alias: { "@": join(root, "src") },
  define: { "process.env.NODE_ENV": '"production"' },
});

const js = result.outputFiles[0].text;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  `// 자동 생성 — 직접 고치지 마세요. \`node scripts/build-competition-result-runtime.mjs\` 로 재생성됩니다.\n` +
    `// 소스: src/embed/competition-result-entry.ts + src/lib/competition-*.ts\n\n` +
    `export const COMPETITION_RESULT_RUNTIME_SRC_HASH = ${JSON.stringify(competitionResultSourceHash(root))};\n\n` +
    `export const COMPETITION_RESULT_RUNTIME_JS = ${JSON.stringify(js)};\n`,
);

console.log(
  `competition-result-runtime: ${(js.length / 1024).toFixed(1)}KB (minified) → src/generated/competition-result-runtime.ts`,
);
