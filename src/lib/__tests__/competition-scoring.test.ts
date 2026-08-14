import { describe, expect, it } from "vitest";
import {
  combineScores,
  criteriaMaxTotal,
  judgeScoreTotal,
  normalizeCriteria,
  type ScoreInputJudgeScore,
} from "@/lib/competition-scoring";

const CRITERIA = normalizeCriteria([
  { key: "creativity", label: "창의성", maxScore: 40 },
  { key: "feasibility", label: "실현가능성", maxScore: 30 },
  { key: "impact", label: "임팩트", maxScore: 30 },
]);

const ENTRIES = [
  { id: "e1", entryNo: "1", title: "참가작 1", teamName: "팀 1" },
  { id: "e2", entryNo: "2", title: "참가작 2", teamName: "팀 2" },
  { id: "e3", entryNo: "3", title: "참가작 3", teamName: "팀 3" },
  { id: "e4", entryNo: "4", title: "참가작 4", teamName: "팀 4" },
];

describe("심사 항목", () => {
  it("깨진 항목은 버리고 빠진 값은 기본값으로 채운다", () => {
    expect(normalizeCriteria([{ label: "창의성" }, null, "x", { key: "b", maxScore: -3 }])).toEqual([
      { key: "c1", label: "창의성", maxScore: 10 },
      { key: "b", label: "b", maxScore: 10 },
    ]);
    expect(criteriaMaxTotal(CRITERIA)).toBe(100);
  });

  it("범위를 벗어난 점수는 잘라낸다 — 조작된 요청이 만점을 넘기지 못한다", () => {
    expect(judgeScoreTotal({ creativity: 999, feasibility: -5, impact: 20 }, CRITERIA)).toBe(60);
    // 숫자로 읽히는 값은 받아들이고(JSON 왕복에서 문자열이 될 수 있다), 아닌 값은 무시한다.
    expect(judgeScoreTotal({ creativity: "40" as unknown as number }, CRITERIA)).toBe(40);
    expect(judgeScoreTotal({ creativity: "많이" as unknown as number, impact: null as unknown as number }, CRITERIA)).toBe(0);
  });
});

describe("대중 + 심사 합산", () => {
  // 실측 시나리오(2026-08-14 로컬 검증): 대중 1위(4번)가 심사에서 밀려 종합 3위가 된다.
  const judgeScores: ScoreInputJudgeScore[] = [
    { entryId: "e1", judgeId: "A", total: 100, submitted: true },
    { entryId: "e1", judgeId: "B", total: 85, submitted: true },
    { entryId: "e2", judgeId: "A", total: 60, submitted: true },
    { entryId: "e2", judgeId: "B", total: 60, submitted: true },
    { entryId: "e3", judgeId: "A", total: 50, submitted: true },
    { entryId: "e3", judgeId: "B", total: 35, submitted: true },
    { entryId: "e4", judgeId: "A", total: 30, submitted: true },
    // B 는 4번을 아직 제출하지 않았다 — 평균에 들어가면 안 된다.
    { entryId: "e4", judgeId: "B", total: 100, submitted: false },
  ];

  const rows = combineScores({
    entries: ENTRIES,
    voteCounts: new Map([["e1", 1], ["e2", 5], ["e3", 3], ["e4", 9]]),
    judgeScores,
    criteriaMax: 100,
    publicWeight: 40,
    judgeWeight: 60,
  });

  it("표 수를 최다 득표 기준 0~100 으로 정규화한다", () => {
    expect(rows.map((r) => [r.entryNo, r.publicScore])).toEqual([
      ["1", 11.11], ["2", 55.56], ["4", 100], ["3", 33.33],
    ]);
  });

  it("미제출 심사는 평균에서 제외한다 — 안 낸 사람 때문에 점수가 깎이면 안 된다", () => {
    const e4 = rows.find((r) => r.entryNo === "4")!;
    expect(e4.judgeCount).toBe(1);
    expect(e4.judgeAverage).toBe(30);
  });

  it("가중 합산 결과로 순위를 매긴다 — 대중 1위가 종합 1위가 아닐 수 있다", () => {
    expect(rows.map((r) => [r.rank, r.entryNo, r.combined])).toEqual([
      [1, "1", 59.94],
      [2, "2", 58.22],
      [3, "4", 58],
      [4, "3", 38.83],
    ]);
  });

  it("심사위원 가중치를 적용한다", () => {
    const weighted = combineScores({
      entries: [ENTRIES[0]],
      voteCounts: new Map([["e1", 1]]),
      judgeScores: judgeScores.filter((s) => s.entryId === "e1"),
      judgeWeights: new Map([["A", 3], ["B", 1]]),
      criteriaMax: 100,
      publicWeight: 0,
      judgeWeight: 100,
    });
    // (100*3 + 85*1) / 4 = 96.25
    expect(weighted[0].judgeAverage).toBe(96.25);
  });

  it("아무도 심사하지 않으면 심사 점수는 0이고 대중 점수만 남는다", () => {
    const noJudges = combineScores({
      entries: ENTRIES,
      voteCounts: new Map([["e1", 1], ["e2", 5], ["e3", 3], ["e4", 9]]),
      judgeScores: [],
      criteriaMax: 0,
      publicWeight: 50,
      judgeWeight: 50,
    });
    expect(noJudges[0].entryNo).toBe("4");
    expect(noJudges.every((r) => r.judgeScore === 0 && r.judgeAverage === null)).toBe(true);
  });

  it("예선 동점은 참가번호(접수 순서)가 빠른 쪽이 앞선다", () => {
    const tied = combineScores({
      entries: ENTRIES,
      voteCounts: new Map([["e1", 4], ["e2", 4], ["e3", 4], ["e4", 4]]),
      judgeScores: [],
      criteriaMax: 100,
      publicWeight: 100,
      judgeWeight: 0,
    });
    expect(tied.map((r) => r.entryNo)).toEqual(["1", "2", "3", "4"]);
    expect(tied.every((r) => r.tied)).toBe(true);
  });

  describe("본선 동점 — 관람객 점수가 높은 팀이 앞선다", () => {
    // 심사가 표 차이를 정확히 상쇄해 합산이 같아지는 상황.
    // e3: 표 2 → public 50, 심사 90  → 70
    // e1: 표 4 → public 100, 심사 40 → 70
    const options = {
      entries: [ENTRIES[0], ENTRIES[2]],
      voteCounts: new Map([["e1", 4], ["e3", 2]]),
      judgeScores: [
        { entryId: "e1", judgeId: "A", total: 40, submitted: true },
        { entryId: "e3", judgeId: "A", total: 90, submitted: true },
      ],
      criteriaMax: 100,
      publicWeight: 50,
      judgeWeight: 50,
    };

    it("본선은 관람객 점수로 가른다", () => {
      const rows = combineScores({ ...options, tieBreak: "public" });
      expect(rows.map((r) => [r.entryNo, r.combined, r.publicScore])).toEqual([
        ["1", 70, 100],
        ["3", 70, 50],
      ]);
    });

    it("예선 규칙이었다면 참가번호 순이라 결과가 같을 수 있으니, 뒤집힌 경우로도 확인한다", () => {
      // 참가번호가 큰 쪽(3번)이 표를 더 받은 상황 — 규칙이 실제로 다르게 동작하는지 본다.
      const flipped = {
        ...options,
        voteCounts: new Map([["e1", 2], ["e3", 4]]),
        judgeScores: [
          { entryId: "e1", judgeId: "A", total: 90, submitted: true },
          { entryId: "e3", judgeId: "A", total: 40, submitted: true },
        ],
      };
      expect(combineScores({ ...flipped, tieBreak: "public" }).map((r) => r.entryNo)).toEqual(["3", "1"]);
      expect(combineScores({ ...flipped, tieBreak: "entryNo" }).map((r) => r.entryNo)).toEqual(["1", "3"]);
    });

    it("관람객 점수까지 같으면 순위를 억지로 만들지 않고 동점으로 표시한다", () => {
      const rows = combineScores({
        entries: [ENTRIES[0], ENTRIES[1]],
        voteCounts: new Map([["e1", 3], ["e2", 3]]),
        judgeScores: [],
        criteriaMax: 100,
        publicWeight: 100,
        judgeWeight: 0,
        tieBreak: "public",
      });
      expect(rows.every((r) => r.tied)).toBe(true);
      expect(rows[0].combined).toBe(rows[1].combined);
    });

    it("점수가 갈리면 동점 표시가 붙지 않는다", () => {
      const rows = combineScores({ ...options, voteCounts: new Map([["e1", 4], ["e3", 1]]), tieBreak: "public" });
      expect(rows.some((r) => r.tied)).toBe(false);
    });
  });

  it("표가 하나도 없어도 0으로 나눈 NaN 이 나오지 않는다", () => {
    const empty = combineScores({
      entries: ENTRIES,
      voteCounts: new Map(),
      judgeScores: [],
      criteriaMax: 100,
      publicWeight: 50,
      judgeWeight: 50,
    });
    expect(empty.every((r) => Number.isFinite(r.combined) && r.combined === 0)).toBe(true);
  });
});
