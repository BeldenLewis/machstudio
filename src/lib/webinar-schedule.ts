// 웨비나 일정(시작·종료·등록마감) 파싱과 순서 규칙 — **생성과 수정이 같은 규칙을 쓰게** 하는 단일 소스.
//
// 이 파일이 생긴 이유: 순서 검증이 PATCH 에만 있었고 POST 에는 없었다. 그래서 만들기 화면에서는
// 종료가 시작보다 앞선 웨비나를 만들 수 있었고, 한번 그렇게 저장되면 상태머신이
// (webinar-status: now >= liveEndAt → ended) 시작 전인데도 '종료'로 판정한다 — 등록도 입장도
// 막힌 웨비나가 된다. 규칙을 여기 한 곳에 두면 한쪽만 고쳐지는 일이 다시 생기지 않는다.

export class WebinarScheduleError extends Error {}

/** 무효 문자열이면 Prisma 가 500 을 내므로 여기서 걸러 호출자가 400 으로 돌려준다. */
export function parseWebinarDate(value: unknown, label: string): Date {
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) throw new WebinarScheduleError(`${label} 형식이 올바르지 않아요`);
  return d;
}

/**
 * 최종 조합(변경값 + 기존값)이 성립하는지 본다. 어기면 WebinarScheduleError.
 * - 종료는 시작보다 뒤 (같아도 안 된다 — 길이 0인 라이브는 즉시 종료로 판정된다)
 * - 등록 마감은 종료보다 앞 (종료 후 등록은 의미가 없다)
 */
export function assertScheduleOrder(start: Date, end: Date, deadline: Date): void {
  if (start.getTime() >= end.getTime()) {
    throw new WebinarScheduleError("종료 시각은 시작 시각보다 뒤여야 해요");
  }
  if (deadline.getTime() > end.getTime()) {
    throw new WebinarScheduleError("등록 마감은 종료 시각보다 앞이어야 해요");
  }
}
