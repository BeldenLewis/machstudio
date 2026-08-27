import { describe, expect, it } from "vitest";
import { buildGa4DailyTrend } from "../route";

/**
 * 요약 카드의 홈페이지·사전등록 페이지 방문 미니 추이선(Sparkline)이 기대는 계약:
 * GA4는 방문이 0인 날의 행을 아예 안 준다 — 그 빈 날짜를 0으로 채워 조회 구간
 * 전체를 빠짐없이 이어야 Sparkline이 날짜를 건너뛰지 않는다(cumulativeTrend와 같은 규칙).
 */
describe("buildGa4DailyTrend", () => {
  it("행이 없으면(null) null을 그대로 돌려준다 — GA4 미설정/조회 실패와 같은 신호", () => {
    expect(buildGa4DailyTrend(null, new Date("2026-08-19T00:00:00+09:00"), new Date("2026-08-21T00:00:00+09:00"))).toBeNull();
  });

  it("빈 날짜를 0으로 채우고 구간 전체를 날짜순으로 잇는다", () => {
    const from = new Date("2026-08-19T00:00:00+09:00");
    const to = new Date("2026-08-21T00:00:00+09:00");
    const rows = [
      { date: "20260819", count: 10 },
      // 8/20 은 방문 0이라 GA4가 행 자체를 안 줌
      { date: "20260821", count: 5 },
    ];
    expect(buildGa4DailyTrend(rows, from, to)).toEqual([10, 0, 5]);
  });

  it("from~to 양 끝을 포함한다(경계 배타적이지 않음)", () => {
    const from = new Date("2026-08-19T00:00:00+09:00");
    const to = new Date("2026-08-19T00:00:00+09:00");
    expect(buildGa4DailyTrend([{ date: "20260819", count: 3 }], from, to)).toEqual([3]);
  });

  it("형식이 이상한(8자리 아닌) 날짜 행은 무시한다", () => {
    const from = new Date("2026-08-19T00:00:00+09:00");
    const to = new Date("2026-08-19T00:00:00+09:00");
    expect(buildGa4DailyTrend([{ date: "2026-08-19", count: 99 }], from, to)).toEqual([0]);
  });
});
