export interface AdDailyPoint {
  date: string;
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

function kstDateKey(date: Date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60_000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
}

/** 조회 기간의 빈 날짜도 0으로 채워 그래프 X축이 폴더 설정 기간과 정확히 일치하게 한다. */
export function fillAdDailySeries(rows: readonly AdDailyPoint[], from: Date | null, to: Date | null): AdDailyPoint[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return sorted;

  const byDate = new Map(sorted.map((row) => [row.date, row]));
  const startKey = kstDateKey(from);
  const endKey = kstDateKey(to);
  const cursor = new Date(`${startKey}T00:00:00+09:00`);
  const end = new Date(`${endKey}T00:00:00+09:00`);
  const result: AdDailyPoint[] = [];

  while (cursor <= end) {
    const date = kstDateKey(cursor);
    result.push(byDate.get(date) ?? { date, cost: 0, impressions: 0, clicks: 0, conversions: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}
