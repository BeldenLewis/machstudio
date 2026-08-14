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

  it("동점은 참가번호(접수 순서)가 빠른 쪽이 앞선다", () => {
    const tied = combineScores({
      entries: ENTRIES,
      voteCounts: new Map([["e1", 4], ["e2", 4], ["e3", 4], ["e4", 4]]),
      judgeScores: [],
      criteriaMax: 100,
      publicWeight: 100,
      judgeWeight: 0,
    });
    expect(tied.map((r) => r.entryNo)).toEqual(["1", "2", "3", "4"]);
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
