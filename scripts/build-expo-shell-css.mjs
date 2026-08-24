/**
 * 홈페이지 임베드의 CSS 를 **TypeScript 문자열로 굳힌다.**
 *
 *   src/lib/expo/expo-shell.css  ──>  src/lib/expo/shell-css.ts
 *
 * 왜 생성물로 두나: 이 CSS 는 브라우저 IIFE 안으로 들어간다. `.css` 를 import 하면
 * Next 가 문서 head 에 넣어 버리는데, 그건 **파트너 사이트의 전역 스타일**이 된다.
 * 우리 스타일은 Shadow 안에만 있어야 하므로 문자열로 실어 나른다.
 *
 * 그리고 이 스크립트가 갈라짐 감지 장치다 — 테스트가 다시 돌려서 커밋된 결과와 비교하므로,
 * CSS 를 고치고 재생성을 안 하면 CI 가 막는다. (build:expo-runtime 이 이걸 먼저 부른다.)
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "src/lib/expo/expo-shell.css");
const OUT = join(root, "src/lib/expo/shell-css.ts");

// 줄바꿈을 먼저 통일한다. Windows 체크아웃은 CRLF 라 그대로 뜨면 리눅스(CI)가 다시 만든
// 결과와 **내용도 해시도 달라진다** — 이 저장소는 실제로 그렇게 깨진 적이 있다.
const source = readFileSync(SRC, "utf8").split("\r\n").join("\n");

/**
 * 보수적으로 줄인다.
 *
 * `:` 주변 공백은 **절대 건드리지 않는다.** `.msx-root :focus-visible` 의 공백을 지우면
 * `.msx-root:focus-visible` 이 되어 전혀 다른 요소를 가리킨다 — 눈에 안 띄는 회귀다.
 * 그래서 주석 제거·공백 축약·`{};,` 주변 정리까지만 한다.
 */
function minify(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")   // 주석
    .replace(/\s+/g, " ")               // 줄바꿈·들여쓰기 → 공백 하나
    .replace(/\s*([{};,])\s*/g, "$1")   // 구두점 주변
    .replace(/;}/g, "}")                // 마지막 세미콜론
    .trim();
}

const css = minify(source);
if (!css.includes(".msx-root :focus-visible")) {
  throw new Error("자손 결합자가 사라졌어요 — minify 가 `:` 주변 공백을 건드렸습니다");
}

// 해시는 **원본**에 대해 낸다. 원본이 바뀌면 재생성해야 한다는 것이 이 해시의 뜻이다.
const srcHash = "sha256:" + createHash("sha256").update(source).digest("hex").slice(0, 32);

writeFileSync(
  OUT,
  `// 자동 생성 — 직접 고치지 마세요. \`node scripts/build-expo-shell-css.mjs\` 로 재생성됩니다.\n` +
    `//\n` +
    `// 출처: src/lib/expo/expo-shell.css\n` +
    `// 스타일을 고치려면 그 파일을 고치고 다시 생성하세요. 안 하면 shell-css-sync 테스트가 막습니다.\n\n` +
    `export const EXPO_SHELL_SRC_HASH = ${JSON.stringify(srcHash)};\n\n` +
    `export const EXPO_SHELL_CSS = ${JSON.stringify(css)};\n`,
);

const before = new TextEncoder().encode(source).length;
const after = new TextEncoder().encode(css).length;
console.log(`expo shell css: ${before} → ${after} bytes (${Math.round((1 - after / before) * 100)}% 감소)`);
