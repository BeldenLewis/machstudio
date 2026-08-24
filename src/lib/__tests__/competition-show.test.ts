import { describe, expect, it } from "vitest";
import { normalizeShowConfig, rehearsalPayload, SHOW_MODES } from "@/lib/competition-show";

describe("발표 연출 설정", () => {
  it("빈 값·깨진 값이면 안전한 기본값으로 떨어진다", () => {
    const fallback = { mode: "card", showMedia: true, showScores: false, footnote: "" };
    expect(normalizeShowConfig(null)).toEqual(fallback);
    expect(normalizeShowConfig("nope")).toEqual(fallback);
    expect(normalizeShowConfig({ mode: "웃긴모드" })).toEqual(fallback);
  });

  it("정적 결과판은 항상 고를 수 있다 — 비상 폴백이라 사라지면 안 된다", () => {
    expect(SHOW_MODES.some((m) => m.value === "static")).toBe(true);
    expect(normalizeShowConfig({ mode: "static" }).mode).toBe("static");
  });

  it("바 레이스는 점수를 끌 수 없다 — 점수가 곧 연출이다", () => {
    expect(normalizeShowConfig({ mode: "bars", showScores: false }).showScores).toBe(true);
    expect(normalizeShowConfig({ mode: "card", showScores: false }).showScores).toBe(false);
  });

  it("하단 문구는 길이를 자른다", () => {
    expect(normalizeShowConfig({ footnote: "가".repeat(500) }).footnote).toHaveLength(200);
  });
});

describe("리허설 더미", () => {
  const payload = rehearsalPayload("테스트 대회");

  it("리허설임이 데이터 자체에 표시된다 — 화면 상태로만 두면 진짜와 헷갈린다", () => {
    expect(payload.rehearsal).toBe(true);
    expect(payload.competition.name).toContain("리허설");
  });

  it("연출을 연습할 만큼의 상·순위가 들어 있다", () => {
    expect(payload.awards.length).toBeGreaterThanOrEqual(3);
    expect(payload.ranking.length).toBeGreaterThanOrEqual(3);
    expect(payload.candidates.length).toBeGreaterThanOrEqual(3);
  });

  it("순위는 1위부터 내림차순으로 정렬돼 있다", () => {
    expect(payload.ranking.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    for (let i = 1; i < payload.ranking.length; i++) {
      expect(payload.ranking[i - 1].combined).toBeGreaterThan(payload.ranking[i].combined);
    }
  });
});
