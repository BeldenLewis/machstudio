/**
 * 입력 정규화 — 날짜는 "YYYY-MM-DD" 로 받아 **KST 자정**으로 저장한다.
 * 브라우저 date input 의 값을 그대로 new Date() 하면 UTC 자정이 되어, 한국 시간으로 하루 앞당겨진다.
 */
export function parseDueDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
