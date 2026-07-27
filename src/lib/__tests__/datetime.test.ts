import { describe, expect, it } from "vitest";
import { formatKst } from "@/lib/datetime";

/**
 * formatKst 는 **기본값이 24시간제**다 — 화면 16곳이 이 함수 하나로 시각을 그린다.
 *
 * 왜 기본값으로 못박나: hour 옵션을 넘긴 곳이 12군데인데, hour12: false 를 같이 넘긴 곳은
 * 랜딩 히어로 하나뿐이었다. 나머지 11곳(대기 화면 히어로 · 운영 콘솔 타임라인 · 등록자
 * 목록 · Q&A 시각)이 14:00 시작을 **02:00** 으로 그렸다. 웨비나는 오후 시작이 흔해서
 * 02:00 은 새벽 2시로 읽힌다.
 *
 * 오전/오후 마커에 기대지 않는 이유: ko-KR 의 dayPeriod 는 ICU 로케일 데이터에 따라 달라진다
 * (Node 24 / ICU 78 은 "PM 02:00", 브라우저에서는 "오후 02:00" 이 나오는 조합도 있다).
 * 그래서 이 파일은 마커 문자열이 아니라 **시(hour) 숫자**를 검사한다 — 그게 오해의 원인이다.
 *
 * hour12 가 아니라 hourCycle 로 고정한 이유도 여기서 잠근다 — Intl 은 둘이 함께 오면
 * hour12 를 우선하므로, hourCycle 을 기본값으로 두면 호출부가 hour12: true 로 12시간제를
 * **되돌릴 수 있다**. hour12: false 를 기본값으로 두면 그 문이 닫힌다.
 */

const AT_14_KST = "2026-08-20T05:00:00.000Z"; // KST 14:00
const AT_MIDNIGHT_KST = "2026-08-20T15:00:00.000Z"; // KST 다음날 00:00

describe("formatKst — 24시간제가 기본", () => {
  it("옵션을 안 주면 24시간제로 그린다 — 웨비나 목록·상세의 기본 표기", () => {
        expect(formatKst(AT_14_KST)).toBe("2026. 08. 20. 14:00");
  });

  it("hour 를 넘긴 모든 조합에서 14:00 이다 — 면마다 다른 시간제로 갈라지지 않는다", () => {
    const shapes: Intl.DateTimeFormatOptions[] = [
      { hour: "2-digit", minute: "2-digit" },
      { month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }, // 대기 화면 히어로
      { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }, // 등록자 목록
      { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit" }, // 랜딩 히어로
    ];
    for (const opts of shapes) {
      expect(formatKst(AT_14_KST, opts), JSON.stringify(opts)).toContain("14:00");
      expect(formatKst(AT_14_KST, opts), JSON.stringify(opts)).not.toContain("02:00");
    }
  });

  it("자정은 24:00 이 아니라 00:00 이다 — h23 이 h24 로 새면 날짜와 어긋난다", () => {
    expect(formatKst(AT_MIDNIGHT_KST, { hour: "2-digit", minute: "2-digit" })).toBe("00:00");
  });

  it("hour12: true 로 12시간제를 되돌릴 수 있다 — 기본값이지 강제가 아니다", () => {
    /* Intl 은 hour12 와 hourCycle 이 함께 오면 hour12 를 우선한다. 그래서 hour12: false 가
       아니라 hourCycle 로 기본값을 잡았다 — 호출부가 되돌릴 문을 남겨 둔다. */
    expect(formatKst(AT_14_KST, { hour: "2-digit", minute: "2-digit", hour12: true })).toContain("02:00");
  });

  it("시각을 안 그리는 호출부는 영향이 없다 — 날짜만 넘긴 곳이 4군데 있다", () => {
    expect(formatKst(AT_14_KST, { year: "numeric", month: "2-digit", day: "2-digit" })).toBe("2026. 08. 20.");
  });
});
