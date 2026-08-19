import { describe, expect, it } from "vitest";
import { buildNoticeModel } from "@/lib/notice/build-model";
import { normalizeNoticePageConfig } from "@/lib/notice/config";
import type { NoticeCompetition } from "@/lib/notice/types";

/**
 * 영어 공고에 한글이 섞이지 않는가.
 *
 * 실제로 이렇게 나왔다: LA 대회를 전부 영어로 써 놓았는데 "선발 방식"과 "심사 기준"은
 * machstudio 설정에서 자동으로 끌려오느라 그 두 섹션만 한글이었다. 운영자가 손댈 수 있는
 * 칸이 아니라 더 답답한 종류였고, **화면을 봐야만 아는 버그**라 여기서 못박는다.
 */
const competition: NoticeCompetition = {
  id: "c1",
  name: "K-POP DANCE BLAST",
  description: "Own the stage.",
  theme: { accentColor: "#7c3aed" },
  recruitOpenAt: null,
  recruitCloseAt: null,
  phase: "upcoming",
  canApply: false,
  statusMessages: { upcoming: "Applications open soon.", closed: "Applications are closed." },
  rounds: [
    { kind: "prelim", name: "Preliminary", publicWeight: 20, judgeWeight: 80, criteria: [] },
    { kind: "final", name: "Finals", publicWeight: 50, judgeWeight: 50, criteria: [] },
  ],
};

const build = (language: string) =>
  buildNoticeModel(
    competition,
    // 정규화는 **대회 config 전체**를 받아 그 안의 noticePage 를 읽는다. 벗겨서 넘기면
    // 전부 기본값(=한국어)이 되어 테스트가 통과해도 아무것도 검증하지 못한다.
    normalizeNoticePageConfig({ noticePage: { enabled: true, language, selection: { enabled: true } } }),
    { uid: "u1", embedded: false, isPreview: true },
  );

/** 한글 음절이 하나라도 있으면 걸린다. */
const hasHangul = (value: string) => /[가-힣]/.test(value);

describe("공고 문구 언어", () => {
  it("영어면 설정에서 끌어온 선발 방식에도 한글이 없다", () => {
    const m = build("en");
    for (const round of m.selectionRounds) {
      expect(hasHangul(round.note)).toBe(false);
      for (const bar of round.bars) expect(hasHangul(bar.label)).toBe(false);
    }
  });

  it("영어면 접수 상태 버튼도 영어다", () => {
    expect(hasHangul(build("en").ctaLabel)).toBe(false);
    // 반대로 한국어에서는 그대로 한글이어야 한다 — 사전이 통째로 영어로 굳으면 안 된다.
    expect(build("ko").ctaLabel).toBe("접수 시작 전");
  });

  it("라운드 이름은 번역하지 않는다 — 운영자가 쓴 글이다", () => {
    const m = build("en");
    expect(m.selectionRounds.map((r) => r.title)).toEqual(["Preliminary", "Finals"]);
  });

  it("모르는 값이면 한국어 — 기존 대회가 조용히 영어가 되면 안 된다", () => {
    expect(build("fr").ctaLabel).toBe("접수 시작 전");
  });
});
