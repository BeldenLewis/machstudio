/**
 * 홈페이지 임베드 런타임 번들 빌드.
 *
 *   src/embed/expo-entry.ts  --esbuild(IIFE)-->  src/generated/expo-runtime.ts
 *
 * 랜딩·폼 런타임과 같은 파이프라인이다. 왜 생성물을 커밋하는가: `/h/...` 라우트가 이
 * 문자열을 그대로 서빙한다. 라우트만 열어도 동작해야 하므로(로컬 개발·Vercel 빌드 모두)
 * 런타임에 번들러를 돌리지 않는다.
 *
 * ── 시트를 먼저 굽는다 ────────────────────────────────────────────────
 * 번들은 `src/lib/expo/shell-css.ts`(생성물)를 문자열로 안고 들어간다. CSS 를 고치고
 * 재생성을 안 하면 **낡은 스타일이 새 번들에 그대로 구워진다** — 그래서 이 스크립트가
 * 시트 생성을 먼저 부른다. package.json 의 순서에만 의존하지 않는다.
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expoSourceHash } from "./runtime-hash.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "src/generated/expo-runtime.ts");

// 시트 먼저. 여기서 순서를 강제해야 package.json 이 바뀌어도 낡은 CSS 가 안 구워진다.
execFileSync("node", [join(root, "scripts/build-expo-shell-css.mjs")], { stdio: "inherit" });

const result = await build({
  entryPoints: [join(root, "src/embed/expo-entry.ts")],
  bundle: true,
  format: "iife",
  globalName: "__msExpo",
  target: ["es2020", "safari16", "chrome105", "firefox110"],
  minify: true,
  legalComments: "none",
  write: false,
  alias: { "@": join(root, "src") },
  define: { "process.env.NODE_ENV": '"production"' },
});

// 줄바꿈을 통일한다 — CRLF 체크아웃에서 구운 결과가 CI 와 갈리지 않게.
const js = result.outputFiles[0].text.split("\r\n").join("\n");

/**
 * `</script>` 가 본문에 있으면, 라우트가 이 문자열을 스크립트 태그 안에 넣는 어떤
 * 경로에서든 태그가 조기에 닫힌다. minify 결과에 그런 리터럴이 생기면 즉시 막는다.
 */
if (js.includes("</script")) throw new Error("번들에 </script 리터럴이 있습니다");
if (js.includes("process.env")) throw new Error("번들에 process.env 가 남아 있습니다");

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  `// 자동 생성 — 직접 고치지 마세요. \`node scripts/build-expo-runtime.mjs\` 로 재생성됩니다.\n` +
    `// 소스: src/embed/expo-entry.ts + src/lib/expo/*\n` +
    `//\n` +
    `// 설계 문서는 홈페이지를 다섯 번째 제품 파이프라인이라 부르지만, main 에는 이미 생성\n` +
    `// IIFE 가 다섯 개 있어서(랜딩·폼·대회 3종) 홈페이지는 **여섯 번째 생성물**이다.\n\n` +
    `export const EXPO_RUNTIME_SRC_HASH = ${JSON.stringify(expoSourceHash(root))};\n\n` +
    `export const EXPO_RUNTIME_JS = ${JSON.stringify(js)};\n`,
);

console.log(
  `expo-runtime: ${(js.length / 1024).toFixed(1)}KB (minified) → src/generated/expo-runtime.ts`,
);
