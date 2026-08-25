const KST_OFFSET_MS = 9 * 60 * 60_000;
const DAY_MS = 86_400_000;

export interface CollectComparisonSource {
  id: string;
  name: string;
  isActive: boolean;
  formConfig: unknown;
  venueConfig?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResolvedCollectSource {
  source: CollectComparisonSource;
  eventStart: Date | null;
  eventYear: number | null;
  eventKey: string;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/** 빌더 행사 개요의 첫 개최일. 날짜는 KST 자정으로 읽는다. */
export function collectEventStart(formConfig: unknown, venueConfig?: unknown): Date | null {
  const venue = object(venueConfig);
  const dashboardDate = String(venue.eventStart ?? venue.dashboardEventDate ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(dashboardDate)) {
    const date = new Date(`${dashboardDate}T00:00:00+09:00`);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const eventInfo = object(object(formConfig).eventInfo);
  const dates = Array.isArray(eventInfo.eventDates) ? eventInfo.eventDates : [];
  const first = dates
    .map((value) => String(value).trim())
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort()[0];
  if (!first) return null;
  const date = new Date(`${first}T00:00:00+09:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function collectEventYear(name: string, eventStart: Date | null): number | null {
  if (eventStart) return new Date(eventStart.getTime() + KST_OFFSET_MS).getUTCFullYear();
  const years = [...name.matchAll(/(?:^|\D)((?:19|20)\d{2})(?=\D|$)/g)].map((match) => Number(match[1]));
  return years.length === 1 ? years[0] : null;
}

/** 행사명에서 연도와 구두점 차이만 걷어 전년 행사 후보를 찾는 키로 쓴다. */
export function collectEventKey(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/(?:19|20)\d{2}/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function resolve(source: CollectComparisonSource): ResolvedCollectSource {
  const eventStart = collectEventStart(source.formConfig, source.venueConfig);
  return {
    source,
    eventStart,
    eventYear: collectEventYear(source.name, eventStart),
    eventKey: collectEventKey(source.name),
  };
}

function currentRank(item: ResolvedCollectSource, now: Date): [number, number, number] {
  const start = item.eventStart?.getTime() ?? Number.NEGATIVE_INFINITY;
  const upcoming = start >= now.getTime() ? 1 : 0;
  // 예정 행사가 여러 개면 가장 가까운 것, 모두 지난 행사면 가장 최근 것을 고른다.
  const dateRank = upcoming ? -start : start;
  return [upcoming, dateRank, item.source.updatedAt.getTime()];
}

function compareRank(a: ResolvedCollectSource, b: ResolvedCollectSource, now: Date): number {
  const ar = currentRank(a, now);
  const br = currentRank(b, now);
  for (let i = 0; i < ar.length; i += 1) {
    if (ar[i] !== br[i]) return br[i] - ar[i];
  }
  return 0;
}

/**
 * 현재 소스와 실제 전년 소스를 고른다.
 *
 * 상세 화면은 requestedSourceId가 URL 자원이므로 그것을 절대 우선한다. 요약 화면은 활성 소스
 * 중 개최일 기준 현재 행사를 하나 고른다. 전년 행사는 같은 행사명 키 + 정확히 전년도인 경우만
 * 인정한다. 이름이나 연도가 불명확하면 억지 비교하지 않고 null로 둔다.
 */
export function resolveCollectEventPair(
  sources: CollectComparisonSource[],
  requestedSourceId: string | null | undefined,
  now = new Date(),
): { current: ResolvedCollectSource | null; previous: ResolvedCollectSource | null } {
  const resolved = sources.map(resolve);
  const current = requestedSourceId
    ? resolved.find((item) => item.source.id === requestedSourceId) ?? null
    : resolved.filter((item) => item.source.isActive).sort((a, b) => compareRank(a, b, now))[0] ?? null;

  if (!current?.eventYear || !current.eventKey) return { current, previous: null };
  const candidates = resolved
    .filter((item) => item.source.id !== current.source.id)
    .filter((item) => item.eventKey === current.eventKey && item.eventYear === current.eventYear! - 1)
    .sort((a, b) => (b.eventStart?.getTime() ?? b.source.updatedAt.getTime()) - (a.eventStart?.getTime() ?? a.source.updatedAt.getTime()));
  return { current, previous: candidates[0] ?? null };
}

/** 오늘의 행사 D-day. 행사 당일 0, 전날 1, 다음날 -1이다. */
export function eventDday(eventStart: Date, now: Date): number {
  const kstDay = (date: Date) => {
    const shifted = new Date(date.getTime() + KST_OFFSET_MS);
    return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  };
  return Math.round((kstDay(eventStart) - kstDay(now)) / DAY_MS);
}

/** 현재 시각이 행사 시작점에서 떨어진 만큼을 전년 행사 시작점에도 똑같이 적용한다. */
export function equivalentPreviousCutoff(currentStart: Date, previousStart: Date, at: Date): Date {
  return new Date(previousStart.getTime() + (at.getTime() - currentStart.getTime()));
}
