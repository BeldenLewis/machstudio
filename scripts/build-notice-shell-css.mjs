/**
 * 대회 공고 페이지의 **껍데기 CSS 를 웨비나 랜딩에서 추출**한다.
 *
 *   src/lib/landing/css.ts  ──(중립 구획만)──>  src/lib/notice/shell-css.ts
 *
 * 손으로 복사하지 않는 이유: 랜딩 CSS 의 규칙들은 대부분 "브라우저에서 눈으로 봐야 알았던"
 * 회귀를 막으려고 들어간 것이라(css.ts 주석 참고), 옮겨 적다 한 줄만 흘려도 그 함정이
 * 대회 쪽에서 다시 열린다. 기계로 뜨면 원본과 **바이트 단위로 같다**.
 *
 * 그리고 이 스크립트가 곧 갈라짐 감지 장치다 — 테스트가 다시 돌려서 커밋된 결과와
 * 비교하므로, 랜딩 껍데기를 고치고 재생성을 안 하면 CI 가 막는다.
 *
 * 웨비나 고유 구획(세션 카드·세션 팝업·타임테이블·추천 대상·혜택)은 가져오지 않는다.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "src/lib/landing/css.ts");
const OUT = join(root, "src/lib/notice/shell-css.ts");

/** 가져올 구획. `/* ── 이름 ──` 주석을 앵커로 쓴다(줄 번호는 원본이 바뀌면 밀린다). */
const SHELL_REGIONS = [
  "(머리)",            // 첫 구획 이전 — 루트 토큰·키컬러 전환
  "배경 모드",
  "호스트 전역 CSS 방어",
  "왼쪽 세로 목차",
  "히어로",
  "ABOUT",
  "섹션 공통",
  "body 직계 고정 레이어",
  "목차 전용 레이어",
  "FAQ",
  "스폰서",
  "스크롤 리빌",
];

// 줄바꿈을 통일한 뒤 다룬다. Windows 체크아웃은 CRLF 라 그대로 뜨면 리눅스(CI)가 다시
// 만든 결과와 **내용도 해시도 달라진다** — 실제로 CI 에서 그렇게 깨졌다.
const source = readFileSync(SRC, "utf8").split("\r\n").join("\n");
const open = source.indexOf("`", source.indexOf("export const LANDING_CSS"));
const close = source.lastIndexOf("`");
if (open < 0 || close <= open) throw new Error("LANDING_CSS 템플릿 리터럴을 찾지 못했어요");
const css = source.slice(open + 1, close);

// `/* ── 이름 ...` 을 경계로 쪼갠다.
const lines = css.split("\n");
const marks = [];
lines.forEach((line, i) => {
  const m = line.match(/\/\*\s*──\s*([^─]+?)\s*──/);
  if (m) marks.push({ index: i, name: m[1].trim() });
});

const regions = [];
regions.push({ name: "(머리)", from: 0, to: marks.length ? marks[0].index : lines.length });
marks.forEach((mark, i) => {
  regions.push({ name: mark.name, from: mark.index, to: i + 1 < marks.length ? marks[i + 1].index : lines.length });
});

const picked = [];
const missing = [];
for (const want of SHELL_REGIONS) {
  const found = regions.filter((r) => r.name === want || r.name.startsWith(want));
  if (!found.length) { missing.push(want); continue; }
  for (const r of found) picked.push(r);
}
if (missing.length) {
  throw new Error(
    `구획을 못 찾았어요: ${missing.join(", ")}\n` +
      `랜딩 CSS 의 구획 주석이 바뀐 것 같아요. 실제 구획: ${regions.map((r) => r.name).join(" / ")}`,
  );
}

picked.sort((a, b) => a.from - b.from);
/**
 * 웨비나에만 있는 클래스. 구획 단위로 못 걸러지는 자리가 하나 있다 —
 * 맨 끝 `@media (max-width: 760px)` 는 **모든 섹션의 모바일 오버라이드가 한 블록에** 있어서
 * 껍데기 규칙(.hero/.section/.faq)과 웨비나 규칙(.session/.schedule/…)이 줄 단위로 섞인다.
 * 그래서 거기서는 규칙을 한 줄씩 본다.
 */
const WEBINAR_ONLY = /\.(session|schedule|program-|join-|audience|benefit|lnd-modal)/;

/** 선택자가 **전부** 웨비나 것이면 버린다. 섞여 있으면 남기고 보고한다(사람이 봐야 한다). */
function classifyRule(line) {
  const m = line.match(/^(\s*)([^{}]+)\{/);
  if (!m) return "keep";
  const selectors = m[2].split(",").map((s) => s.trim()).filter(Boolean);
  if (!selectors.length) return "keep";
  const hits = selectors.filter((s) => WEBINAR_ONLY.test(s));
  if (hits.length === selectors.length) return "drop";
  if (hits.length > 0) return "mixed";
  return "keep";
}

const dropped = [];
const mixed = [];

function filterRegion(text) {
  const out = [];
  const src = text.split("\n");
  for (let i = 0; i < src.length; i++) {
    const line = src[i];

    // 웨비나 얘기만 하는 주석 블록은 통째로 건너뛴다 — 남으면 대회 파일에서 오해를 부른다.
    if (/^\s*\/\*/.test(line) && !/\*\//.test(line)) {
      let j = i;
      const block = [];
      while (j < src.length) { block.push(src[j]); if (/\*\//.test(src[j])) break; j += 1; }
      const joined = block.join("\n");
      if (WEBINAR_ONLY.test(joined) || /세션|연사|타임테이블|스케줄/.test(joined)) { i = j; continue; }
      out.push(...block); i = j; continue;
    }

    const verdict = classifyRule(line);
    if (verdict === "drop") { dropped.push(line.trim()); continue; }
    if (verdict === "mixed") mixed.push(line.trim());
    out.push(line);
  }
  return out.join("\n");
}

const body = picked
  .map((r) => filterRegion(lines.slice(r.from, r.to).join("\n")).replace(/\s+$/, ""))
  .join("\n\n");

const srcHash = "sha256:" + createHash("sha256").update(body).digest("hex").slice(0, 32);

writeFileSync(
  OUT,
  `// 자동 생성 — 직접 고치지 마세요. \`node scripts/build-notice-shell-css.mjs\` 로 재생성됩니다.\n` +
    `//\n` +
    `// 출처: src/lib/landing/css.ts 의 엔티티 중립 구획\n` +
    `//   ${SHELL_REGIONS.join(" · ")}\n` +
    `//\n` +
    `// **웨비나 랜딩과 같은 껍데기다.** 랜딩 쪽 껍데기를 고쳤다면 이 파일도 재생성해야 하고,\n` +
    `// 안 하면 notice-shell-sync 테스트가 막는다. 대회 고유 스타일은 여기 말고\n` +
    `// src/lib/notice/css.ts 에 쓴다.\n\n` +
    `export const NOTICE_SHELL_SRC_HASH = ${JSON.stringify(srcHash)};\n\n` +
    `export const NOTICE_SHELL_CSS = ${JSON.stringify(body)};\n`,
);

const kept = body.split("\n").length;
console.log(`notice shell css: ${kept}/${lines.length}줄 → src/lib/notice/shell-css.ts`);
console.log(`  구획 ${picked.length}개 · 웨비나 전용 규칙 ${dropped.length}줄 제외`);
if (mixed.length) {
  console.log(`  ⚠ 껍데기와 웨비나가 섞인 규칙 ${mixed.length}줄 — 사람이 확인하세요:`);
  for (const line of mixed) console.log(`      ${line}`);
}
