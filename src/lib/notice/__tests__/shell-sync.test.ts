import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NOTICE_SHELL_CSS, NOTICE_SHELL_SRC_HASH } from "@/lib/notice/shell-css";

/**
 * 대회 공고의 껍데기 CSS 가 **웨비나 랜딩과 갈라지지 않았는지** 확인한다.
 *
 * 두 페이지는 지금 같은 껍데기를 쓰되 코드는 두 벌이다(웨비나를 건드리지 않으려는 선택).
 * 그 대가로 생기는 위험이 "한쪽만 고치고 다른 쪽은 모른 채 지나가는 것"인데, 그건 사람이
 * 기억해서 막을 수 있는 종류가 아니다. 그래서 기계가 막는다.
 *
 * 실패하면: 랜딩 껍데기가 바뀐 것이다. `node scripts/build-notice-shell-css.mjs` 로
 * 재생성하고, **대회 공고 화면도 한 번 열어보고** 커밋한다.
 */
describe("공고 껍데기 ↔ 웨비나 랜딩 동기화", () => {
  it("추출을 다시 돌려도 커밋된 결과와 같다", () => {
    execFileSync("node", ["scripts/build-notice-shell-css.mjs"], { stdio: "pipe" });
    const regenerated = readFileSync("src/lib/notice/shell-css.ts", "utf8");
    expect(regenerated).toContain(NOTICE_SHELL_SRC_HASH);
    // 파일이 다시 쓰였는데 해시가 그대로면 원본 구획이 안 바뀐 것이다.
  });

  it("껍데기에 웨비나 고유 개념이 섞여 들어오지 않았다", () => {
    // 세션·연사·타임테이블은 대회에 없다. 추출 범위가 넓어지면 여기서 걸린다.
    expect(NOTICE_SHELL_CSS).not.toMatch(/\.session-card|\.lnd-modal-speaker|\.schedule-summary/);
  });

  it("껍데기가 실제 내용을 담고 있다", () => {
    // 추출이 조용히 빈 문자열이 되는 사고를 막는다.
    expect(NOTICE_SHELL_CSS.length).toBeGreaterThan(10000);
    expect(NOTICE_SHELL_CSS).toContain("[data-bg=");
    expect(NOTICE_SHELL_CSS).toContain(".hero");
  });
});
