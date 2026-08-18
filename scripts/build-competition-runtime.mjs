/**
 * 대회 임베드 런타임 번들 빌드.
 *
 *   src/embed/competition-entry.ts  --esbuild(IIFE)-->  src/generated/competition-runtime.ts
 *
 * 랜딩 런타임(build-landing-runtime.mjs)과 같은 규약이다: 생성물을 커밋하고, /c/{id} 라우트가
 * 이 문자열을 그대로 서빙한다. 라우트만 열어도 동작해야 하므로 런타임에 번들러를 돌리지 않는다.
 * predev/prebuild 에서 재생성되며, 소스가 바뀌었는데 생성물이 낡으면 해시로 드러난다.
 */
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "src/generated/competition-runtime.ts");

/** 입력 소스 트리 해시 — esbuild 버전이 올라가도 무관하게 stale 을 판정한다. */
function sourceHash() {
  const files = [
    join(root, "src/embed/competition-entry.ts"),
    join(root, "src/lib/competition-render.ts"),
    join(root, "src/lib/competition-config.ts"),
    join(root, "src/lib/competition-status.ts"),
    join(root, "src/lib/notice/mount.ts"),
    join(root, "src/lib/notice/css.ts"),
    join(root, "src/lib/notice/shell-css.ts"),
    join(root, "src/lib/notice/build-model.ts"),
    join(root, "src/lib/notice/view-hero.ts"),
    join(root, "src/lib/notice/view-sections.ts"),
    join(root, "src/lib/notice/config.ts"),
  ];
  const hash = createHash("sha256");
  for (const f of files) hash.update(readFileSync(f));
  return "sha256:" + hash.digest("hex").slice(0, 32);
}

const result = await build({
  entryPoints: [join(root, "src/embed/competition-entry.ts")],
  bundle: true,
  format: "iife",
  globalName: "__msCompetition",
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
  `// 자동 생성 — 직접 고치지 마세요. \`node scripts/build-competition-runtime.mjs\` 로 재생성됩니다.\n` +
    `// 소스: src/embed/competition-entry.ts + src/lib/competition-*.ts\n\n` +
    `export const COMPETITION_RUNTIME_SRC_HASH = ${JSON.stringify(sourceHash())};\n\n` +
    `export const COMPETITION_RUNTIME_JS = ${JSON.stringify(js)};\n`,
);

console.log(
  `competition-runtime: ${(js.length / 1024).toFixed(1)}KB (minified) → src/generated/competition-runtime.ts`,
);
