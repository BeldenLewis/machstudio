import { describe, expect, it } from "vitest";
import { NOTICE_LANGUAGES } from "@/lib/notice/config";
import { competitionVoteStrings } from "@/lib/competition-vote-strings";
import { competitionResultStrings } from "@/lib/competition-result-strings";
import { competitionShowStrings } from "@/lib/competition-show-strings";
import { voteWindowMessage } from "@/lib/competition-vote";

/**
 * 투표·결과·발표 화면의 **시스템 문구**가 언어를 따르는가.
 *
 * 공고·신청 폼 문구 언어(competition-form-language.test.ts)와 같은 문제 — 이 세 화면은
 * 상태를 실행 시점에 fetch 하므로 boot payload 가 아니라 응답의 competition.language 로
 * 사전을 확정한다. 응답에 language 가 빠지면 화면은 계속 한국어 기본값에 머문다.
 */
describe("지원 언어 전수 점검 — 투표·결과·발표", () => {
  const dictsFor = (language: (typeof NOTICE_LANGUAGES)[number]["value"]) => ({
    vote: competitionVoteStrings(language),
    result: competitionResultStrings(language),
    show: competitionShowStrings(language),
  });

  it.each(NOTICE_LANGUAGES.map((l) => [l.label, l.value] as const))(
    "%s — 투표·결과·발표 사전이 모두 채워져 있다",
    (_label, language) => {
      const { vote, result, show } = dictsFor(language);

      for (const [key, value] of Object.entries(vote)) {
        if (typeof value === "function") continue;
        expect(value, `vote.${key}`).toBeTruthy();
      }
      expect(vote.remaining(3, 5), "vote.remaining(3,5)").toBeTruthy();
      expect(vote.limitReached(5), "vote.limitReached(5)").toBeTruthy();
      expect(vote.voteCount(2), "vote.voteCount(2)").toBeTruthy();

      for (const [key, value] of Object.entries(result)) {
        if (typeof value === "function") continue;
        expect(value, `result.${key}`).toBeTruthy();
      }
      expect(result.resultTitle("Demo"), "result.resultTitle").toBeTruthy();
      expect(result.entryNo("001"), "result.entryNo").toBeTruthy();

      for (const [key, value] of Object.entries(show)) {
        if (typeof value === "function" || typeof value === "object") continue;
        expect(value, `show.${key}`).toBeTruthy();
      }
      expect(show.introHint(3), "show.introHint").toBeTruthy();
      expect(show.rank(1), "show.rank").toBeTruthy();
      expect(show.combinedScore("92.0"), "show.combinedScore").toBeTruthy();
      expect(show.staticResultTitle("Demo"), "show.staticResultTitle").toBeTruthy();
      // 연출 모드 5종 라벨도 빠짐없이.
      for (const [mode, label] of Object.entries(show.modeLabel)) {
        expect(label, `show.modeLabel.${mode}`).toBeTruthy();
      }

      // 투표 창 상태 문구 — "ok" 는 원래 빈 문자열(투표 가능 상태라 안내가 없다)이라 제외한다.
      for (const reason of ["disabled", "before", "closed"] as const) {
        expect(voteWindowMessage(reason, language), `voteWindowMessage.${reason}`).toBeTruthy();
      }
    },
  );

  /** 한국어 아닌 언어가 한국어 사전을 그대로 돌려주면 "고를 수는 있는데 안 바뀌는" 상태다. */
  it.each(NOTICE_LANGUAGES.filter((l) => l.value !== "ko").map((l) => [l.label, l.value] as const))(
    "%s — 한국어와 실제로 다르다",
    (_label, language) => {
      expect(competitionVoteStrings(language).voteBtnDefault).not.toBe(competitionVoteStrings("ko").voteBtnDefault);
      expect(competitionResultStrings(language).congrats).not.toBe(competitionResultStrings("ko").congrats);
      expect(competitionShowStrings(language).ceremony).not.toBe(competitionShowStrings("ko").ceremony);
      expect(voteWindowMessage("closed", language)).not.toBe(voteWindowMessage("closed", "ko"));
    },
  );

  it("모르는 언어는 한국어로 떨어진다 — 오타 하나로 화면이 비면 안 된다", () => {
    const unknown = "de" as unknown as (typeof NOTICE_LANGUAGES)[number]["value"];
    expect(competitionVoteStrings(unknown)).toEqual(competitionVoteStrings("ko"));
    expect(competitionResultStrings(unknown)).toEqual(competitionResultStrings("ko"));
    expect(competitionShowStrings(unknown)).toEqual(competitionShowStrings("ko"));
    expect(voteWindowMessage("closed", unknown)).toBe(voteWindowMessage("closed", "ko"));
  });

  it("투표 상한 도달 안내에 실제 상한 값이 들어간다", () => {
    expect(competitionVoteStrings("en").limitReached(5)).toContain("5");
    expect(competitionVoteStrings("ja").limitReached(5)).toContain("5");
  });
});
