/**
 * 등록 폼 임베드 런타임 번들 빌드 (설계 §17).
 *
 *   src/embed/form-entry.ts  --esbuild(IIFE)-->  src/generated/form-runtime.ts
 *
 * 랜딩 런타임(build-landing-runtime.mjs)과 같은 파이프라인이다. 왜 생성물을 커밋하는가:
 * /f/{id} 라우트가 이 문자열을 그대로 서빙한다. 라우트만 열어도 동작해야 하므로(로컬 개발·
 * Vercel 빌드 모두) 런타임에 번들러를 돌리지 않는다.
 *
 * predev/prebuild 에서 재생성되고, 소스가 바뀌었는데 생성물이 낡으면
 * src/lib/__tests__/embed-runtime-fresh.test.ts 가 잡는다.
 * (랜딩 쪽은 해시를 굽기만 하고 **비교하는 곳이 없었다** — 폼을 붙이면서 둘 다 검사한다.)
 */

import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formSourceHash } from "./runtime-hash.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "src/generated/form-runtime.ts");

const result = await build({
  entryPoints: [join(root, "src/embed/form-entry.ts")],
  bundle: true,
  format: "iife",
  globalName: "__msForm",
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
  `// 자동 생성 — 직접 고치지 마세요. \`node scripts/build-form-runtime.mjs\` 로 재생성됩니다.\n` +
    `// 소스: src/embed/form-entry.ts + src/lib/collect-form/*\n\n` +
    `export const FORM_RUNTIME_SRC_HASH = ${JSON.stringify(formSourceHash(root))};\n\n` +
    `export const FORM_RUNTIME_JS = ${JSON.stringify(js)};\n`,
);

console.log(
  `form-runtime: ${(js.length / 1024).toFixed(1)}KB (minified) → src/generated/form-runtime.ts`,
);
