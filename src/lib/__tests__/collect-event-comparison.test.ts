import { describe, expect, it } from "vitest";
import {
  collectEventKey,
  equivalentPreviousCutoff,
  eventDday,
  resolveCollectEventPair,
  type CollectComparisonSource,
} from "../collect-event-comparison";

const source = (id: string, name: string, active: boolean, eventDate?: string): CollectComparisonSource => ({
  id,
  name,
  isActive: active,
  formConfig: eventDate ? { eventInfo: { eventDates: [eventDate] } } : {},
  createdAt: new Date("2025-01-01T00:00:00Z"),
  updatedAt: new Date(`${id === "26" ? "2026" : "2025"}-01-01T00:00:00Z`),
});

describe("사전등록 전년 행사 연결", () => {
  it("연도를 하드코딩하지 않고 같은 행사명의 직전 연도만 연결한다", () => {
    const pair = resolveCollectEventPair([
      source("25", "2025 에듀테크 코리아 페어", false, "2025-09-18"),
      source("26", "2026 에듀테크 코리아 페어", true, "2026-09-23"),
      source("other", "2025 다른 행사", false, "2025-09-18"),
    ], null, new Date("2026-08-25T00:00:00Z"));
    expect(pair.current?.source.id).toBe("26");
    expect(pair.previous?.source.id).toBe("25");
  });

  it("전년 행사가 없으면 비교 대상을 만들지 않는다", () => {
    const pair = resolveCollectEventPair([
      source("26", "2026 에듀테크 코리아 페어", true, "2026-09-23"),
    ], null);
    expect(pair.previous).toBeNull();
  });

  it("연동형 소스는 기본 정보의 행사 시작일을 D-day 기준으로 쓴다", () => {
    const current = {
      ...source("26", "2026 에듀테크 코리아 페어", true),
      venueConfig: { eventStart: "2026-09-23" },
    };
    const pair = resolveCollectEventPair([current], "26");
    expect(pair.current?.eventStart?.toISOString()).toBe(new Date("2026-09-23T00:00:00+09:00").toISOString());
  });

  it("상세 화면에서는 비활성이어도 URL이 지정한 소스를 집계 기준으로 쓴다", () => {
    const pair = resolveCollectEventPair([
      source("25", "2025 에듀테크 코리아 페어", false, "2025-09-18"),
      source("26", "2026 에듀테크 코리아 페어", true, "2026-09-23"),
    ], "25");
    expect(pair.current?.source.id).toBe("25");
    expect(pair.previous).toBeNull();
  });

  it("표기 차이는 정리하되 행사 자체가 다른 이름은 합치지 않는다", () => {
    expect(collectEventKey("2026 에듀테크 코리아 페어")).toBe(collectEventKey("에듀테크 코리아 페어 2025"));
    expect(collectEventKey("2026 에듀테크 코리아 페어")).not.toBe(collectEventKey("2025 코리아 빌드"));
  });
});

describe("행사 D-day 속도 비교", () => {
  it("KST 달력일로 D-day를 계산한다", () => {
    expect(eventDday(new Date("2026-09-23T00:00:00+09:00"), new Date("2026-08-25T23:00:00+09:00"))).toBe(29);
  });

  it("현재 행사의 상대 시점을 전년 행사에 그대로 옮긴다", () => {
    const cutoff = equivalentPreviousCutoff(
      new Date("2026-09-23T00:00:00+09:00"),
      new Date("2025-09-18T00:00:00+09:00"),
      new Date("2026-08-25T12:30:00+09:00"),
    );
    expect(cutoff.toISOString()).toBe(new Date("2025-08-20T12:30:00+09:00").toISOString());
  });
});
