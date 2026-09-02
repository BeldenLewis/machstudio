/**
 * Mach 서버에 다시 연결하지 않는 복구용 홈페이지 IIFE를 생성한다.
 * HTML exporter가 이 문자열을 inline script로 넣으므로 생성물을 커밋하고 해시로 감시한다.
 */
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { standaloneExpoSourceHash } from "./runtime-hash.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "src/generated/expo-standalone-runtime.ts");

const result = await build({
  entryPoints: [join(root, "src/embed/expo-standalone-entry.ts")],
  bundle: true,
  format: "iife",
  globalName: "__msExpoStandalone",
  target: ["es2020", "safari16", "chrome105", "firefox110"],
  minify: true,
  legalComments: "none",
  write: false,
  alias: { "@": join(root, "src") },
  define: { "process.env.NODE_ENV": '"production"' },
});

const js = result.outputFiles[0].text.split("\r\n").join("\n");
if (js.includes("</script")) throw new Error("standalone 번들에 </script 리터럴이 있습니다");
if (js.includes("process.env")) throw new Error("standalone 번들에 process.env 가 남아 있습니다");

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  `// 자동 생성 — 직접 고치지 마세요. \`node scripts/build-expo-standalone-runtime.mjs\` 로 재생성됩니다.\n` +
    `// 소스: src/embed/expo-standalone-entry.ts + 정적 Expo renderer\n\n` +
    `export const EXPO_STANDALONE_RUNTIME_SRC_HASH = ${JSON.stringify(standaloneExpoSourceHash(root))};\n\n` +
    `export const EXPO_STANDALONE_RUNTIME_JS = ${JSON.stringify(js)};\n`,
);

console.log(`expo-standalone-runtime: ${(js.length / 1024).toFixed(1)}KB (minified) → src/generated/expo-standalone-runtime.ts`);
