// 이 플랫폼의 모든 사용자 노출 시간은 한국시간(KST) 기준이에요.
// 저장은 UTC ISO로 하되, 표시/파일명/필터링은 항상 이 유틸을 통해 KST로 변환합니다.

export const KST = "Asia/Seoul";

function toDate(input: Date | string | number): Date {
  return input instanceof Date ? input : new Date(input);
}

/**
 * 시각은 **항상 24시간제**다 — `hourCycle: "h23"` 을 여기서 못박는다.
 *
 * 왜 기본값으로 넣는가: ko-KR 은 옵션이 없으면 14시를 **02:00** 으로 준다. 그래서 시각을
 * 쓰는 호출 12곳 중 랜딩 히어로 1곳만 hour12:false 를 넘기고 나머지 11곳이 12시간제였다 —
 * 같은 웨비나의 같은 시작 시각이 랜딩에서는 "14:00", 대기 화면에서는 "02:00" 으로 보였다.
 * 오후 시작이 흔한 웨비나에서 02:00 은 새벽으로 읽힌다. 호출부마다 옵션을 기억해야 하는
 * 규칙은 이렇게 새는 게 정상이라, 기본값을 바꿨다.
 *
 * 오전/오후 마커에 기대지 말 것: ko-KR dayPeriod 는 ICU 로케일 데이터에 따라 갈린다
 * (Node 24/ICU 78 은 "PM 02:00", 브라우저 조합에 따라 "오후 02:00"). 시(hour) 숫자가 문제다.
 *
 * hour12 대신 hourCycle 을 쓰는 이유: 호출부가 `hour12: true` 로 **명시적으로** 12시간제를
 * 원할 때 그게 이겨야 한다. hour12 를 기본값에 두면 스프레드 순서에 따라 조용히 무시된다.
 * (Intl 은 둘이 함께 오면 hour12 를 우선한다 — 즉 옵트아웃이 열려 있다.)
 */
export function formatKst(
  input: Date | string | number,
  options: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" },
): string {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: KST, hourCycle: "h23", ...options }).format(toDate(input));
}

// "YYYY-MM-DD HH:mm:ss" KST (CSV/엑셀에 쓰기 좋은 형식)
export function formatKstDateTime(input: Date | string | number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(toDate(input));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

// "YYYY-MM-DD" KST (파일명용)
export function kstDateString(input: Date | string | number = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(toDate(input));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function kstYear(input: Date | string | number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: KST, year: "numeric" }).format(toDate(input));
}

// <input type="datetime-local"> 값 ↔ 저장(UTC ISO) 변환.
// 입력칸은 항상 KST 벽시각으로 다룬다 (목록·상세·라이브 표시와 동일 기준).
// 저장 UTC ISO → datetime-local 값("YYYY-MM-DDTHH:mm", KST)
export function kstDateTimeLocalInput(input: Date | string | number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(toDate(input));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  // en-CA 가 자정을 "24"로 줄 수 있어 보정
  const hour = g("hour") === "24" ? "00" : g("hour");
  return `${g("year")}-${g("month")}-${g("day")}T${hour}:${g("minute")}`;
}

// datetime-local 값(KST 벽시각) → 저장용 UTC ISO
export function kstDateTimeLocalToIso(local: string): string {
  if (!local) return "";
  return new Date(`${local}:00+09:00`).toISOString();
}
