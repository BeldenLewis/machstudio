/**
 * 랜딩 임베드 런타임 번들 빌드.
 *
 *   src/embed/landing-entry.ts  --esbuild(IIFE)-->  src/generated/landing-runtime.ts
 *
 * 왜 생성물을 커밋하는가: /w/l/{slug} 라우트가 이 문자열을 그대로 서빙한다. 라우트만 열어도
 * 동작해야 하므로(로컬 개발·Vercel 빌드 모두) 런타임에 번들러를 돌리지 않는다.
 * predev/prebuild 에서 재생성되며, 소스가 바뀌었는데 생성물이 낡으면 테스트가 잡는다.
 *
 * 배포물을 왜 /w/ 아래에 두는가: src/proxy.ts 의 matcher 가 .js 를 제외하지 않아
 * public/ 에 두면 비로그인 방문자에게 "/" 로 리다이렉트된다 → nosniff 로 실행 거부.
 * /w/ 는 이미 공개 경로 allowlist 에 있다.
 */

import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "src/generated/landing-runtime.ts");

/** 입력 소스 트리 해시 — esbuild 버전이 올라가도 무관하게 stale 을 판정한다. */
function sourceHash() {
  const files = [
    join(root, "src/embed/landing-entry.ts"),
    ...readdirSync(join(root, "src/lib/landing"))
      .filter((f) => f.endsWith(".ts"))
      .sort()
      .map((f) => join(root, "src/lib/landing", f)),
    join(root, "src/lib/webinar-config.ts"),
    join(root, "src/lib/datetime.ts"),
    // 랜딩 CSS 가 로고 규격을 여기서 가져온다 — 빠뜨리면 규격을 고쳐도 번들이 stale 로 안 잡힌다
    join(root, "src/lib/webinar-logo.ts"),
  ];
  const hash = createHash("sha256");
  for (const f of files) hash.update(readFileSync(f));
  return "sha256:" + hash.digest("hex").slice(0, 32);
}

const result = await build({
  entryPoints: [join(root, "src/embed/landing-entry.ts")],
  bundle: true,
  format: "iife",
  globalName: "__msLanding",
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
  `// 자동 생성 — 직접 고치지 마세요. \`node scripts/build-landing-runtime.mjs\` 로 재생성됩니다.\n` +
    `// 소스: src/embed/landing-entry.ts + src/lib/landing/*\n\n` +
    `export const LANDING_RUNTIME_SRC_HASH = ${JSON.stringify(sourceHash())};\n\n` +
    `export const LANDING_RUNTIME_JS = ${JSON.stringify(js)};\n`,
);

console.log(
  `landing-runtime: ${(js.length / 1024).toFixed(1)}KB (minified) → src/generated/landing-runtime.ts`,
);
