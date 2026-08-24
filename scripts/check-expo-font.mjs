/**
 * 홈페이지 임베드 서체의 **반입 검사**.
 *
 * ── 왜 자체 호스팅인가 ────────────────────────────────────────────────
 * 이 서체는 파트너 사이트(아임웹 등)의 문서 안에서 로드된다. CDN 을 쓰면
 *  ① 그 CDN 이 죽는 날 남의 사이트에서 우리 화면만 깨지고,
 *  ② 그 CDN 이 파일을 바꾸면 우리가 모른 채 화면이 바뀌고,
 *  ③ 방문자의 요청이 제3자에게 흘러간다.
 * 그래서 파일을 저장소에 넣고, **바이트 단위로 고정**한다.
 *
 * ── 이 스크립트가 하는 일 ─────────────────────────────────────────────
 * ① 파일이 그 자리에 있는가
 * ② SHA-256 이 고정값과 같은가 — 다르면 누가 바꾼 것이다
 * ③ 라이선스(OFL 1.1) 본문이 함께 있는가 — 재배포 조건이다
 * ④ 코드 어디에도 외부 폰트 주소·`local()` 이 없는가
 *
 * 새 버전을 올릴 때는 **새 디렉터리**를 만든다(경로에 버전이 박혀 있고 캐시가 1년이다).
 * 그리고 아래 PINNED 를 새 해시로 바꾼다.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const FONT_VERSION = "v1.3.9";
const DIR = join(root, "public/fonts/pretendard", FONT_VERSION);
const FONT = join(DIR, "PretendardVariable.woff2");
const LICENSE = join(DIR, "OFL.txt");

/**
 * 고정 해시. **반입한 그 파일**의 SHA-256 이다.
 * null 이면 아직 반입 전이라는 뜻이고, 이 검사는 실패한다 — 그게 의도다.
 */
const PINNED = null;

/** 코드에 있으면 안 되는 것 — 외부 폰트 출처. */
const FORBIDDEN = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "cdn.jsdelivr.net",
  "unpkg.com",
  "local(",
];
const SCAN_DIRS = ["src/lib/expo", "src/embed"];

const problems = [];

// ── ①② 파일과 해시 ─────────────────────────────────────────────────
if (!existsSync(FONT)) {
  problems.push(
    `서체 파일이 없습니다: public/fonts/pretendard/${FONT_VERSION}/PretendardVariable.woff2\n` +
      `    Pretendard ${FONT_VERSION} 의 공식 배포본에서 PretendardVariable.woff2 를 그 경로에 넣고,\n` +
      `    아래 해시를 이 스크립트의 PINNED 에 적으세요.`,
  );
} else {
  const bytes = readFileSync(FONT);
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (!PINNED) {
    problems.push(
      `서체 해시가 아직 고정되지 않았습니다.\n` +
        `    scripts/check-expo-font.mjs 의 PINNED 를 다음 값으로 바꾸세요:\n` +
        `    "${sha}"   (${bytes.length} bytes)`,
    );
  } else if (sha !== PINNED) {
    problems.push(
      `서체 파일이 고정값과 다릅니다.\n` +
        `    기대: ${PINNED}\n    실제: ${sha}\n` +
        `    파일이 바뀌었습니다. 의도한 교체라면 새 버전 디렉터리를 만드세요 — 캐시가 1년입니다.`,
    );
  }
}

// ── ③ 라이선스 ──────────────────────────────────────────────────────
if (!existsSync(LICENSE)) {
  problems.push(`라이선스 본문이 없습니다: public/fonts/pretendard/${FONT_VERSION}/OFL.txt`);
} else {
  const text = readFileSync(LICENSE, "utf8");
  if (!/SIL OPEN FONT LICENSE/i.test(text) || text.length < 2000) {
    problems.push("OFL.txt 가 OFL 1.1 전문으로 보이지 않습니다.");
  }
}

// ── ④ 외부 출처 ─────────────────────────────────────────────────────
function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if ([".ts", ".tsx", ".css"].includes(extname(full))) out.push(full);
  }
  return out;
}

/**
 * 주석과 테스트는 건너뛴다. 둘 다 "이걸 쓰지 않는다" 를 **글자 그대로** 담고 있어서
 * (주석의 설명, 테스트의 `not.toContain("local(")`), 그대로 훑으면 전부 걸린다.
 * 검사해야 하는 것은 실행되는 코드다.
 */
const stripComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

for (const dir of SCAN_DIRS) {
  for (const file of walk(join(root, dir))) {
    if (file.includes("__tests__")) continue;
    const text = stripComments(readFileSync(file, "utf8"));
    for (const needle of FORBIDDEN) {
      if (text.includes(needle)) {
        problems.push(`${file.slice(root.length + 1)} 에 외부 폰트 출처가 있습니다: ${needle}`);
      }
    }
  }
}

if (problems.length) {
  console.error("홈페이지 서체 검사 실패:");
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}

console.log(`홈페이지 서체 ${FONT_VERSION}: 파일·해시·라이선스·출처 모두 확인`);
