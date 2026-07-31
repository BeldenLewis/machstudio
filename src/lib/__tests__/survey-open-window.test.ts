import { describe, expect, it } from "vitest";
import { isSurveyAcceptingResponses, surveyOpenState, surveyAcceptingWhere } from "@/lib/webinar-survey";

/**
 * 설문 응답 기간 — 온·오프(isOpen) + 시작 예약(opensAt) + 마감 예약(closesAt).
 *
 * 이 판정이 틀리면 두 방향 모두 사고다: 너무 관대하면 시작 전 설문에 응답이 쌓이고,
 * 너무 엄격하면 열려 있어야 할 설문이 조용히 닫혀 운영자가 알 방법이 없다.
 * 그리고 판정이 **두 벌**(TS 함수 / Prisma where)이라 둘이 같은 뜻인지도 여기서 묶는다.
 */

const T = (iso: string) => new Date(iso);
const NOW = T("2026-08-11T05:00:00Z").getTime(); // 8월 11일 14:00 KST

describe("surveyOpenState — 못 받는 이유까지 답한다", () => {
  it("스위치가 꺼지면 시각과 무관하게 off — 예약이 남아 있어도 마스터가 이긴다", () => {
    expect(surveyOpenState({ isOpen: false }, NOW)).toBe("off");
    expect(surveyOpenState({ isOpen: false, opensAt: T("2026-08-01T00:00:00Z"), closesAt: T("2026-12-01T00:00:00Z") }, NOW)).toBe("off");
  });

  it("예약이 둘 다 없으면 곧바로 open — 기존 설문 수백 개가 이 경로다", () => {
    expect(surveyOpenState({ isOpen: true }, NOW)).toBe("open");
    expect(surveyOpenState({ isOpen: true, opensAt: null, closesAt: null }, NOW)).toBe("open");
  });

  it("시작 전이면 before, 시작 시각이 되면 open", () => {
    expect(surveyOpenState({ isOpen: true, opensAt: T("2026-08-11T06:00:00Z") }, NOW)).toBe("before");
    // 경계 — 시작 시각 '이후'가 아니라 '이상'이다. 14:00 부터라고 안내했으면 14:00:00 에 받아야 한다.
    expect(surveyOpenState({ isOpen: true, opensAt: T("2026-08-11T05:00:00Z") }, NOW)).toBe("open");
  });

  it("마감 시각이 되면 closed — 경계는 그 시각부터 닫힘", () => {
    expect(surveyOpenState({ isOpen: true, closesAt: T("2026-08-11T05:00:00Z") }, NOW)).toBe("closed");
    expect(surveyOpenState({ isOpen: true, closesAt: T("2026-08-11T05:00:01Z") }, NOW)).toBe("open");
  });

  it("기간 안 / 기간 밖", () => {
    const w = { isOpen: true, opensAt: T("2026-08-11T04:00:00Z"), closesAt: T("2026-08-11T07:00:00Z") };
    expect(surveyOpenState(w, NOW)).toBe("open");
    expect(surveyOpenState(w, T("2026-08-11T03:59:59Z").getTime())).toBe("before");
    expect(surveyOpenState(w, T("2026-08-11T07:00:00Z").getTime())).toBe("closed");
  });

  /**
   * 뒤집힌 기간은 어드민 PATCH 가 400 으로 막지만, 이미 저장된 데이터나 직접 DB 수정으로
   * 들어올 수 있다. 그때 **받아 버리지 않는 쪽**을 택한다 — 잘못된 설정으로 응답이 쌓이는 것보다
   * 닫혀 있는 게 되돌리기 쉽다. 그리고 "마감" 이라 답해야 운영자가 기간을 의심한다.
   */
  it("시작 > 마감 이면 마감이 이긴다", () => {
    expect(surveyOpenState({ isOpen: true, opensAt: T("2026-12-01T00:00:00Z"), closesAt: T("2026-08-01T00:00:00Z") }, NOW)).toBe("closed");
  });

  /** 판정 불가로 응답을 막으면 설문이 조용히 죽는다 — 이상한 값은 "설정 없음" 으로 본다. */
  it("깨진 날짜 문자열은 설정 없음으로 취급한다", () => {
    expect(surveyOpenState({ isOpen: true, opensAt: "어제", closesAt: "" }, NOW)).toBe("open");
    expect(surveyOpenState({ isOpen: true, opensAt: "not-a-date" }, NOW)).toBe("open");
  });

  it("ISO 문자열과 Date 를 같게 본다 — API 는 문자열, Prisma 는 Date 를 준다", () => {
    const iso = "2026-08-11T06:00:00.000Z";
    expect(surveyOpenState({ isOpen: true, opensAt: iso }, NOW)).toBe(surveyOpenState({ isOpen: true, opensAt: T(iso) }, NOW));
  });
});

describe("isSurveyAcceptingResponses — 판정은 한 곳에서만 나온다", () => {
  it("open 일 때만 true", () => {
    expect(isSurveyAcceptingResponses({ isOpen: true })).toBe(true);
    expect(isSurveyAcceptingResponses({ isOpen: false })).toBe(false);
    expect(isSurveyAcceptingResponses({ isOpen: true, opensAt: new Date(Date.now() + 60_000) })).toBe(false);
    expect(isSurveyAcceptingResponses({ isOpen: true, closesAt: new Date(Date.now() - 60_000) })).toBe(false);
  });

  /** opensAt 을 타입에서 빼먹은 호출부가 있으면 여기가 아니라 그 호출부가 조용히 틀린다(#LiveConsoleTab). */
  it("필드가 없으면(undefined) 그 예약은 없는 것 — 기존 호출부가 깨지지 않는다", () => {
    expect(isSurveyAcceptingResponses({ isOpen: true, closesAt: null })).toBe(true);
  });
});

describe("surveyAcceptingWhere — Prisma 조건이 TS 판정과 같은 뜻인가", () => {
  const now = T("2026-08-11T05:00:00Z");

  /** where 를 실제 SQL 로 돌릴 수 없으니, 같은 술어를 JS 로 평가해 두 벌을 대조한다. */
  const matches = (row: { isOpen: boolean; opensAt: Date | null; closesAt: Date | null }) => {
    const w = surveyAcceptingWhere(now);
    if (row.isOpen !== w.isOpen) return false;
    return w.AND.every((clause) =>
      clause.OR.some((cond) => {
        const [field] = Object.keys(cond) as ["opensAt" | "closesAt"];
        const expected = (cond as Record<string, unknown>)[field];
        const actual = row[field];
        if (expected === null) return actual === null;
        const range = expected as { lte?: Date; gt?: Date };
        if (actual === null) return false;
        if (range.lte) return actual.getTime() <= range.lte.getTime();
        return actual.getTime() > range.gt!.getTime();
      }),
    );
  };

  const rows: Array<{ isOpen: boolean; opensAt: Date | null; closesAt: Date | null }> = [
    { isOpen: true, opensAt: null, closesAt: null },
    { isOpen: false, opensAt: null, closesAt: null },
    { isOpen: true, opensAt: T("2026-08-11T06:00:00Z"), closesAt: null }, // 시작 전
    { isOpen: true, opensAt: T("2026-08-11T05:00:00Z"), closesAt: null }, // 시작 경계
    { isOpen: true, opensAt: T("2026-08-01T00:00:00Z"), closesAt: T("2026-08-11T05:00:00Z") }, // 마감 경계
    { isOpen: true, opensAt: T("2026-08-01T00:00:00Z"), closesAt: T("2026-08-11T07:00:00Z") }, // 기간 안
    { isOpen: true, opensAt: T("2026-12-01T00:00:00Z"), closesAt: T("2026-08-01T00:00:00Z") }, // 뒤집힘
  ];

  it("모든 조합에서 두 벌의 답이 같다", () => {
    for (const row of rows) {
      expect(matches(row), JSON.stringify(row)).toBe(surveyOpenState(row, now.getTime()) === "open");
    }
  });

  it("다른 조건과 스프레드해도 OR 키가 부딪히지 않는다", () => {
    const where = { webinarId: "w1", showOnEnded: true, ...surveyAcceptingWhere(now) };
    expect(Object.keys(where)).toEqual(["webinarId", "showOnEnded", "isOpen", "AND"]);
    expect(where.AND).toHaveLength(2);
  });
});
