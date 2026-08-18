import { describe, expect, it } from "vitest";
import { NOTICE_CSS } from "@/lib/notice/css";

/**
 * 운영자가 넣은 줄바꿈이 화면에 남는가.
 *
 * 처음엔 FAQ 답변 한 곳만 pre-line 이었고 나머지 10곳이 기본값(normal)이었다 —
 * 편집기에서 엔터를 쳐도 화면에서는 앞뒤 문장이 그냥 이어 붙었다. 저장소 공통 규칙
 * ("사용자 텍스트는 줄바꿈을 보존해 표시")을 어긴 것이고, **화면을 봐야만 아는 종류**라
 * 다시 빠뜨리기 쉽다. 그래서 값을 넣는 자리 목록을 여기 못박는다.
 *
 * 새 섹션을 추가하면서 텍스트 자리를 만들면 이 목록에도 넣어야 한다.
 */
const TEXT_SLOTS = [
  ".hero-subtitle",
  ".hero-note",
  ".hero-fact dd",
  ".section-desc",
  ".nt-concept-body p",
  ".nt-stat-value",
  ".nt-stat-value small",
  ".nt-tl-body p",
  ".nt-step-list li",
  ".nt-elig-item > span:last-child",
  ".nt-round-note",
  ".nt-crit-desc",
  ".nt-prize-desc",
  ".nt-faq-a",
];

/**
 * `A, B, C { … }` 형태에서 pre-line 을 선언한 선택자를 전부 모은다.
 *
 * 주석을 먼저 지운다 — 안 지우면 규칙 바로 앞의 주석이 **첫 선택자에 들러붙어**
 * 목록의 첫 항목만 못 찾는다(실제로 .hero-subtitle 하나만 실패했다).
 */
function selectorsWithPreLine(source: string): Set<string> {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, "\n");
  const found = new Set<string>();
  for (const match of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (!/white-space:\s*pre-line/.test(match[2])) continue;
    for (const sel of match[1].split(",")) {
      const trimmed = sel.trim().replace(/^\.lnd\s+/, "");
      if (trimmed) found.add(trimmed);
    }
  }
  return found;
}

describe("공고의 사용자 텍스트는 줄바꿈을 보존한다", () => {
  const withPreLine = selectorsWithPreLine(NOTICE_CSS);

  it.each(TEXT_SLOTS)("%s", (selector) => {
    expect(withPreLine).toContain(selector);
  });

  it("들여쓰기까지 굳히지는 않는다 — pre 가 아니라 pre-line 이어야 한다", () => {
    // pre / pre-wrap 은 붙여넣기로 들어온 앞 공백이 레이아웃을 밀어 버린다.
    expect(NOTICE_CSS).not.toMatch(/white-space:\s*pre\s*;/);
    expect(NOTICE_CSS).not.toMatch(/white-space:\s*pre-wrap/);
  });
});
