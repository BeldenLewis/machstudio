import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import type { RealtimeReportData } from "@/app/(app)/dashboard/RealtimeReport";
import { normalizeUtmKey } from "@/lib/attribution-normalize";
import { getGa4ActiveUsers } from "@/lib/ga4";

// 결과 캐싱 (egress 절감): 동일 조건 조회를 짧게 캐시해 반복 DB 트래픽 제거.
// 서버리스 인스턴스 단위 캐시 — 같은 인스턴스에 도달하는 반복/동시 조회에 효과.
const REPORT_CACHE = new Map<string, { at: number; data: RealtimeReportData }>();
const REPORT_CACHE_TTL_MS = 60_000;

export interface ReportFilters {
  sourceId?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  attribution?: "last" | "first";
}

interface RequestBody {
  workspaceId: string;
  projectId: string;
  from?: string;
  to?: string;
  filters?: ReportFilters;
}

const KST_OFFSET = 9 * 60 * 60_000;
const DAY_MS = 86_400_000;

type TimedRecord = { createdAt: Date; data: Prisma.JsonValue };
type CompositionRecord = { sourceId: string; data: Prisma.JsonValue };
type FieldAlias = {
  key: string;
  label: string;
  normalizedKey: string;
  normalizedLabel: string;
};

const VISITOR_DIMENSIONS = [
  {
    key: "industry",
    label: "산업/업종",
    candidates: ["industry", "industries", "산업", "업종", "종사 산업", "관심 산업", "관심분야", "관심 분야"],
  },
  {
    key: "role",
    label: "직무/직책",
    candidates: ["jobTitle", "job_title", "position", "role", "title", "직책", "직함", "직급", "직위", "부서", "department", "담당업무"],
  },
  {
    key: "interest",
    label: "관심 분야",
    candidates: ["interest", "interests", "관심", "관심 제품", "관심분야", "관심 분야", "참관목적", "참관 목적", "참관 희망 전시회", "희망 전시회", "전시회", "방문 목적", "visit_purpose"],
  },
  {
    key: "company",
    label: "회사/기관",
    candidates: ["company", "organization", "org", "회사", "소속 회사", "기관", "기관명", "소속"],
  },
] as const;

const EMAIL_FIELD_CANDIDATES = [
  "email", "이메일", "Email", "메일", "mail", "e-mail", "emailAddress", "email_address",
] as const;

const TIME_FIELD_CANDIDATES = [
  "createdAt",
  "created_at",
  "created",
  "submittedAt",
  "submitted_at",
  "submitted",
  "submissionTime",
  "submission_time",
  "timestamp",
  "datetime",
  "dateTime",
  "time",
  "date",
  "registeredAt",
  "registered_at",
  "appliedAt",
  "applied_at",
  "응답시간",
  "응답 시간",
  "응답일시",
  "응답 일시",
  "신청일시",
  "신청 일시",
  "신청시간",
  "신청 시간",
  "신청일",
  "신청 일",
  "등록일시",
  "등록 일시",
  "등록시간",
  "등록 시간",
  "등록일",
  "등록 일",
  "접수일시",
  "접수 일시",
  "접수시간",
  "접수 시간",
  "접수일",
  "접수 일",
  "작성일시",
  "작성 일시",
  "작성시간",
  "작성 시간",
  "작성일",
  "작성 일",
  "일시",
  "날짜",
  "시간",
] as const;

function parseDate(value: string | undefined, fallback: Date) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function getKstDayStart(date: Date) {
  const kst = new Date(date.getTime() + KST_OFFSET);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - KST_OFFSET);
}

function getKstYearStart(date: Date, yearOffset = 0) {
  const kst = new Date(date.getTime() + KST_OFFSET);
  return new Date(Date.UTC(kst.getUTCFullYear() + yearOffset, 0, 1) - KST_OFFSET);
}

/** 같은 달/일 기준으로 정확히 1년 전으로 이동 — 윤년 드리프트 없이 "작년 동기간"을 맞춘다. */
function shiftYears(date: Date, years: number) {
  const shifted = new Date(date.getTime());
  shifted.setUTCFullYear(shifted.getUTCFullYear() + years);
  return shifted;
}

function getUtmColumns(filters?: ReportFilters) {
  const useFirst = filters?.attribution === "first";
  return useFirst
    ? { source: "firstUtmSource", medium: "firstUtmMedium", campaign: "firstUtmCampaign" }
    : { source: "utmSource", medium: "utmMedium", campaign: "utmCampaign" };
}

function buildWhere(params: {
  workspaceId: string;
  projectId: string;
  filters?: ReportFilters;
  from?: Date;
  to?: Date;
  lt?: Date;
}) {
  const { workspaceId, projectId, filters, from, to, lt } = params;
  const utm = getUtmColumns(filters);
  const where: Prisma.CollectRecordWhereInput = { workspaceId, projectId };

  if (filters?.sourceId && filters.sourceId !== "all") where.sourceId = filters.sourceId;
  if (filters?.utmSource) Object.assign(where, { [utm.source]: filters.utmSource });
  if (filters?.utmMedium) Object.assign(where, { [utm.medium]: filters.utmMedium });
  if (filters?.utmCampaign) Object.assign(where, { [utm.campaign]: filters.utmCampaign });
  if (from || to || lt) {
    where.createdAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
      ...(lt ? { lt } : {}),
    };
  }
  return where;
}

// Build a parameterized SQL WHERE clause ($1, $2, …) + value list.
// NOTE: Prisma v7 regression (#28963) — nested Prisma.sql fragments inside
// $queryRaw template literals are serialized as JSON instead of composed as SQL.
// So we build a plain string + values and run it via $queryRawUnsafe.
// Column names come only from getUtmColumns (fixed whitelist), never user input.
function buildRawWhere(params: {
  workspaceId: string;
  projectId: string;
  filters?: ReportFilters;
  from?: Date;
  to?: Date;
  lt?: Date;
}): { clause: string; values: unknown[] } {
  const { workspaceId, projectId, filters, from, to, lt } = params;
  const utm = getUtmColumns(filters);
  const conds: string[] = [];
  const values: unknown[] = [];
  const push = (col: string, val: unknown) => { values.push(val); conds.push(`${col} = $${values.length}`); };
  push(`"workspaceId"`, workspaceId);
  push(`"projectId"`, projectId);
  if (filters?.sourceId && filters.sourceId !== "all") push(`"sourceId"`, filters.sourceId);
  if (filters?.utmSource) push(`"${utm.source}"`, filters.utmSource);
  if (filters?.utmMedium) push(`"${utm.medium}"`, filters.utmMedium);
  if (filters?.utmCampaign) push(`"${utm.campaign}"`, filters.utmCampaign);
  if (from) { values.push(from); conds.push(`"createdAt" >= $${values.length}`); }
  if (to) { values.push(to); conds.push(`"createdAt" <= $${values.length}`); }
  if (lt) { values.push(lt); conds.push(`"createdAt" < $${values.length}`); }
  return { clause: conds.join(" AND "), values };
}

function normalizeKey(key: string) {
  return key.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

function hasMeaningfulKstTime(date: Date) {
  const kst = new Date(date.getTime() + KST_OFFSET);
  return kst.getUTCHours() !== 0 || kst.getUTCMinutes() !== 0 || kst.getUTCSeconds() !== 0 || kst.getUTCMilliseconds() !== 0;
}

function makeKstDateTimeFromParts(params: { year: string | number; month: string | number; day: string | number; hour?: string | number; minute?: string | number; second?: string | number }) {
  const iso = `${params.year}-${String(params.month).padStart(2, "0")}-${String(params.day).padStart(2, "0")}T${String(params.hour ?? 0).padStart(2, "0")}:${String(params.minute ?? 0).padStart(2, "0")}:${String(params.second ?? 0).padStart(2, "0")}+09:00`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateLike(value: unknown, baseDate?: Date): { date: Date; hasTime: boolean } | null {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return {
      date: value,
      hasTime: hasMeaningfulKstTime(value),
    };
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const timeOnly = raw.match(/^(오전|오후|AM|PM|am|pm)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (timeOnly && baseDate) {
    const baseKst = new Date(baseDate.getTime() + KST_OFFSET);
    let hour = Number(timeOnly[2]);
    const minute = Number(timeOnly[3]);
    const second = Number(timeOnly[4] ?? 0);
    const meridiem = timeOnly[1]?.toLowerCase();

    if (meridiem === "오후" || meridiem === "pm") {
      if (hour < 12) hour += 12;
    } else if ((meridiem === "오전" || meridiem === "am") && hour === 12) {
      hour = 0;
    }

    const parsed = makeKstDateTimeFromParts({
      year: baseKst.getUTCFullYear(),
      month: baseKst.getUTCMonth() + 1,
      day: baseKst.getUTCDate(),
      hour,
      minute,
      second,
    });
    if (parsed) return { date: parsed, hasTime: true };
  }

  const hasExplicitZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);
  if (hasExplicitZone) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return { date: parsed, hasTime: /\d{1,2}:\d{2}/.test(raw) };
  }

  const dateTime = raw.match(/^(\d{4})[-/.]\s*(\d{1,2})[-/.]\s*(\d{1,2})(?:\s*(?:[T ]|일|\.)\s*)?(?:(오전|오후|AM|PM|am|pm)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (dateTime) {
    let hour = dateTime[5] ? Number(dateTime[5]) : 0;
    const minute = dateTime[6] ? Number(dateTime[6]) : 0;
    const second = dateTime[7] ? Number(dateTime[7]) : 0;
    const meridiem = dateTime[4]?.toLowerCase();

    if (meridiem === "오후" || meridiem === "pm") {
      if (hour < 12) hour += 12;
    } else if ((meridiem === "오전" || meridiem === "am") && hour === 12) {
      hour = 0;
    }

    const parsed = makeKstDateTimeFromParts({
      year: dateTime[1],
      month: dateTime[2],
      day: dateTime[3],
      hour,
      minute,
      second,
    });
    if (parsed) {
      return { date: parsed, hasTime: !!dateTime[5] };
    }
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return {
    date: parsed,
    hasTime: /\d{1,2}:\d{2}/.test(raw) || /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw),
  };
}

function resolveEventTime(record: TimedRecord) {
  // 수집 레코드 자체의 createdAt 시간을 메인 기준으로 사용한다.
  // CSV/엑셀 일괄등록에서 createdAt이 날짜만 들어와 KST 00:00이 된 경우에만
  // 원본 데이터의 시간 필드로 보정한다.
  if (hasMeaningfulKstTime(record.createdAt)) return record.createdAt;

  if (record.data && typeof record.data === "object" && !Array.isArray(record.data)) {
    const data = record.data as Record<string, unknown>;
    const normalizedCandidates = new Set(TIME_FIELD_CANDIDATES.map(normalizeKey));

    for (const [key, value] of Object.entries(data)) {
      if (!normalizedCandidates.has(normalizeKey(key))) continue;

      const parsed = parseDateLike(value, record.createdAt);
      if (parsed?.hasTime) return parsed.date;
    }
  }

  return record.createdAt;
}

function splitValues(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap(splitValues);
  if (typeof value === "boolean") return value ? ["동의"] : [];
  return String(value)
    .split(/[,;/|、，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildFieldAliasLookup(sources: Array<{ id: string; fieldMappings: Array<{ key: string; label: string }> }>) {
  return new Map(
    sources.map((source) => [
      source.id,
      source.fieldMappings.map((field) => ({
        key: field.key,
        label: field.label,
        normalizedKey: normalizeKey(field.key),
        normalizedLabel: normalizeKey(field.label),
      })),
    ]),
  );
}

function matchesCandidate(value: string, candidate: string) {
  return value === candidate || value.includes(candidate) || candidate.includes(value);
}

// composition / email / dedup 계산에 쓰이는 후보 키 전체.
// 이 후보들과 매칭되는 필드만 DB에서 추출하면 data JSON 전체를 안 받아도 됨(egress 절감).
const COMPOSITION_EMAIL_CANDIDATES: readonly string[] = [
  ...VISITOR_DIMENSIONS.flatMap((d) => d.candidates),
  ...EMAIL_FIELD_CANDIDATES,
];

// 소스 fieldMappings 에서 후보(키 또는 라벨)와 매칭되는 실제 data 키 목록을 산출한다.
// pickValue 의 매칭 규칙(normalizeKey + 양방향 부분일치)을 그대로 재현 → 결과 동일성 보존.
function resolveCompositionKeys(
  sources: Array<{ id: string; fieldMappings: Array<{ key: string; label: string }> }>,
): string[] {
  const normCandidates = COMPOSITION_EMAIL_CANDIDATES.map(normalizeKey).filter((c) => c.length > 1);
  const keys = new Set<string>();
  for (const src of sources) {
    for (const fm of src.fieldMappings) {
      const nk = normalizeKey(fm.key);
      const nl = normalizeKey(fm.label);
      if (normCandidates.some((c) => matchesCandidate(nk, c) || (nl ? matchesCandidate(nl, c) : false))) {
        keys.add(fm.key);
      }
    }
  }
  return [...keys];
}

function pickValue(data: Prisma.JsonValue, candidates: readonly string[], fieldAliases: FieldAlias[] = []) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const record = data as Record<string, unknown>;
  const normalizedCandidates = candidates.map(normalizeKey).filter((candidate) => candidate.length > 1);
  const entries = Object.entries(record).map(([key, value]) => {
    const alias = fieldAliases.find((field) => field.key === key);
    return {
      key,
      value,
      normalizedKey: normalizeKey(key),
      normalizedLabel: alias?.normalizedLabel ?? "",
    };
  });

  for (const candidate of normalizedCandidates) {
    const matched = entries.find(({ normalizedKey, normalizedLabel }) => (
      matchesCandidate(normalizedKey, candidate) ||
      (normalizedLabel ? matchesCandidate(normalizedLabel, candidate) : false)
    ));
    if (matched) return splitValues(matched.value);
  }
  return [];
}

function topEntriesBySectionMax(counts: Map<string, number>, limit: number) {
  const max = Math.max(0, ...Array.from(counts.values()));
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count, percent: max > 0 ? (count / max) * 100 : 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function cleanUtmValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildHeatmapFromRows(rows: Array<{ dow: number; hour: number; count: number }>) {
  const dayLabels = ["월", "화", "수", "목", "금", "토", "일"];
  const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const dayTotals = Array(7).fill(0) as number[];
  const hourTotals = Array(24).fill(0) as number[];

  for (const row of rows) {
    // Postgres DOW: 0=Sunday..6=Saturday. We want 0=Mon..6=Sun.
    const dayIndex = (row.dow + 6) % 7;
    const hour = row.hour;
    if (dayIndex < 0 || dayIndex > 6 || hour < 0 || hour > 23) continue;
    matrix[dayIndex][hour] += row.count;
    dayTotals[dayIndex] += row.count;
    hourTotals[hour] += row.count;
  }

  const max = matrix.flat().reduce((peak, count) => Math.max(peak, count), 0);
  const peakDayIndex = dayTotals.reduce((best, count, index) => count > dayTotals[best] ? index : best, 0);
  const peakHour = hourTotals.reduce((best, count, index) => count > hourTotals[best] ? index : best, 0);
  const topSlots = matrix
    .flatMap((row, dayIndex) => row.map((count, hour) => ({ day: dayLabels[dayIndex], hour, count })))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    dayLabels,
    matrix,
    max,
    peakDay: { label: dayLabels[peakDayIndex], count: dayTotals[peakDayIndex] ?? 0 },
    peakHour: { hour: peakHour, count: hourTotals[peakHour] ?? 0 },
    topSlots,
  };
}

function buildCumulativeTrendFromRows(
  rows: Array<{ day: string; count: number }>,
  from: Date,
  to: Date,
  initialCount: number,
) {
  const dailyCounts = new Map<string, number>();
  for (const row of rows) {
    // row.day is already a KST date string yyyy-mm-dd
    dailyCounts.set(row.day, (dailyCounts.get(row.day) ?? 0) + row.count);
  }
  const points: Array<{ date: string; label: string; count: number; cumulative: number }> = [];
  let cumulative = initialCount;
  let cursor = getKstDayStart(from);
  const end = getKstDayStart(to);
  while (cursor.getTime() <= end.getTime()) {
    const date = getKstDateKey(cursor);
    const count = dailyCounts.get(date) ?? 0;
    cumulative += count;
    points.push({
      date,
      label: date.slice(5).replace("-", "."),
      count,
      cumulative,
    });
    cursor = new Date(cursor.getTime() + DAY_MS);
  }
  return points;
}

function buildDailyUtmTrendFromRows(
  rows: Array<{ day: string; source: string | null; medium: string | null; count: number }>,
  from: Date,
  to: Date,
): { source: DailyUtmView; medium: DailyUtmView; combined: DailyUtmView } {
  const TOP = 5;

  // 같은 채널이 대소문자 차이로 추이 차트에 두 시리즈로 갈라지지 않게 접는다(utmTop 과 같은 규칙).
  const getKey = (row: { source: string | null; medium: string | null }, dimension: "source" | "medium" | "combined") => {
    const src = normalizeUtmKey(row.source);
    const med = normalizeUtmKey(row.medium);
    if (dimension === "source") return src;
    if (dimension === "medium") return med;
    return [src, med].filter(Boolean).join(" / ");
  };

  const buildView = (dimension: "source" | "medium" | "combined"): DailyUtmView => {
    const totals = new Map<string, number>();
    const daily = new Map<string, Map<string, number>>();

    for (const row of rows) {
      const key = getKey(row, dimension);
      if (!key) continue;
      const date = row.day;
      totals.set(key, (totals.get(key) ?? 0) + row.count);
      if (!daily.has(date)) daily.set(date, new Map());
      const dayMap = daily.get(date)!;
      dayMap.set(key, (dayMap.get(key) ?? 0) + row.count);
    }

    const topKeys = Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP)
      .map(([k]) => k);

    const rowsOut: DailyUtmRow[] = [];
    let cursor = getKstDayStart(from);
    const end = getKstDayStart(to);
    while (cursor.getTime() <= end.getTime()) {
      const date = getKstDateKey(cursor);
      const dayMap = daily.get(date) ?? new Map<string, number>();
      const row: DailyUtmRow = { date };
      for (const key of topKeys) row[key] = dayMap.get(key) ?? 0;
      rowsOut.push(row);
      cursor = new Date(cursor.getTime() + DAY_MS);
    }

    return { topKeys, rows: rowsOut };
  };

  return {
    source: buildView("source"),
    medium: buildView("medium"),
    combined: buildView("combined"),
  };
}

function buildHeatmap(records: TimedRecord[]) {
  const dayLabels = ["월", "화", "수", "목", "금", "토", "일"];
  const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const dayTotals = Array(7).fill(0) as number[];
  const hourTotals = Array(24).fill(0) as number[];

  for (const record of records) {
    const eventTime = resolveEventTime(record);
    const kst = new Date(eventTime.getTime() + KST_OFFSET);
    const dayIndex = (kst.getUTCDay() + 6) % 7;
    const hour = kst.getUTCHours();
    matrix[dayIndex][hour] += 1;
    dayTotals[dayIndex] += 1;
    hourTotals[hour] += 1;
  }

  const max = matrix.flat().reduce((peak, count) => Math.max(peak, count), 0);
  const peakDayIndex = dayTotals.reduce((best, count, index) => count > dayTotals[best] ? index : best, 0);
  const peakHour = hourTotals.reduce((best, count, index) => count > hourTotals[best] ? index : best, 0);
  const topSlots = matrix
    .flatMap((row, dayIndex) => row.map((count, hour) => ({ day: dayLabels[dayIndex], hour, count })))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    dayLabels,
    matrix,
    max,
    peakDay: { label: dayLabels[peakDayIndex], count: dayTotals[peakDayIndex] ?? 0 },
    peakHour: { hour: peakHour, count: hourTotals[peakHour] ?? 0 },
    topSlots,
  };
}

function getKstDateKey(date: Date) {
  const kst = new Date(date.getTime() + KST_OFFSET);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface UtmTrendRecord {
  createdAt: Date;
  utmSource: string | null;
  utmMedium: string | null;
  firstUtmSource: string | null;
  firstUtmMedium: string | null;
}

interface DailyUtmRow {
  date: string;
  [key: string]: number | string;
}

interface DailyUtmView {
  topKeys: string[];
  rows: DailyUtmRow[];
}

function buildDailyUtmTrend(
  records: UtmTrendRecord[],
  from: Date,
  to: Date,
  useFirst: boolean,
): { source: DailyUtmView; medium: DailyUtmView; combined: DailyUtmView } {
  const TOP = 5;

  const getKey = (record: UtmTrendRecord, dimension: "source" | "medium" | "combined") => {
    const src = (useFirst ? record.firstUtmSource : record.utmSource) ?? "";
    const med = (useFirst ? record.firstUtmMedium : record.utmMedium) ?? "";
    if (dimension === "source") return src;
    if (dimension === "medium") return med;
    return [src, med].filter(Boolean).join(" / ");
  };

  const buildView = (dimension: "source" | "medium" | "combined"): DailyUtmView => {
    const totals = new Map<string, number>();
    const daily = new Map<string, Map<string, number>>();

    for (const record of records) {
      const key = getKey(record, dimension);
      if (!key) continue;
      const date = getKstDateKey(resolveEventTime(record as unknown as TimedRecord));
      totals.set(key, (totals.get(key) ?? 0) + 1);
      if (!daily.has(date)) daily.set(date, new Map());
      const dayMap = daily.get(date)!;
      dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
    }

    const topKeys = Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP)
      .map(([k]) => k);

    const rows: DailyUtmRow[] = [];
    let cursor = getKstDayStart(from);
    const end = getKstDayStart(to);
    while (cursor.getTime() <= end.getTime()) {
      const date = getKstDateKey(cursor);
      const dayMap = daily.get(date) ?? new Map<string, number>();
      const row: DailyUtmRow = { date };
      for (const key of topKeys) row[key] = dayMap.get(key) ?? 0;
      rows.push(row);
      cursor = new Date(cursor.getTime() + DAY_MS);
    }

    return { topKeys, rows };
  };

  return {
    source: buildView("source"),
    medium: buildView("medium"),
    combined: buildView("combined"),
  };
}

function buildCumulativeTrend(records: TimedRecord[], from: Date, to: Date, initialCount: number) {
  const dailyCounts = new Map<string, number>();
  for (const record of records) {
    const key = getKstDateKey(resolveEventTime(record));
    dailyCounts.set(key, (dailyCounts.get(key) ?? 0) + 1);
  }

  const points: Array<{ date: string; label: string; count: number; cumulative: number }> = [];
  let cumulative = initialCount;
  let cursor = getKstDayStart(from);
  const end = getKstDayStart(to);

  while (cursor.getTime() <= end.getTime()) {
    const date = getKstDateKey(cursor);
    const count = dailyCounts.get(date) ?? 0;
    cumulative += count;
    points.push({
      date,
      label: date.slice(5).replace("-", "."),
      count,
      cumulative,
    });
    cursor = new Date(cursor.getTime() + DAY_MS);
  }

  return points;
}

export interface GenerateReportOptions {
  workspaceId: string;
  projectId: string;
  from?: string;
  to?: string;
  filters?: ReportFilters;
}

export async function generateDashboardReport(options: GenerateReportOptions) {
  const { workspaceId, projectId, filters } = options;

  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId } });
  if (!project) return { error: "프로젝트 없음" as const };

  const cacheKey = JSON.stringify({ workspaceId, projectId, filters, from: options.from, to: options.to });
  const cachedHit = REPORT_CACHE.get(cacheKey);
  if (cachedHit && Date.now() - cachedHit.at < REPORT_CACHE_TTL_MS) {
    return { data: cachedHit.data };
  }

  const now = new Date();
  const to = parseDate(options.to, now);
  const from = parseDate(options.from, new Date(to.getTime() - 7 * DAY_MS));
  const todayStart = getKstDayStart(now);
  const yesterdayStart = new Date(todayStart.getTime() - DAY_MS);
  const span = Math.max(to.getTime() - from.getTime(), DAY_MS);
  const previousFrom = new Date(from.getTime() - span);
  const thisYearStart = getKstYearStart(now, 0);
  const lastYearStart = getKstYearStart(now, -1);
  const lastYearRangeFrom = shiftYears(from, -1);
  const lastYearRangeTo = shiftYears(to, -1);

  const baseParams = { workspaceId, projectId, filters };
  const rangeWhere = buildWhere({ ...baseParams, from, to });
  const rangeRawWhere = buildRawWhere({ ...baseParams, from, to });
  const utmCols = getUtmColumns(filters);
  const utmSourceCol = utmCols.source === "firstUtmSource" ? "firstUtmSource" : "utmSource";
  const utmMediumCol = utmCols.medium === "firstUtmMedium" ? "firstUtmMedium" : "utmMedium";

  // composition/email/dedup 에 필요한 필드만 추출하기 위해 소스 필드 정의를 먼저 조회
  const sourceFields = await prisma.collectSource.findMany({
    where: {
      workspaceId,
      projectId,
      ...(filters?.sourceId && filters.sourceId !== "all" ? { id: filters.sourceId } : {}),
    },
    select: { id: true, fieldMappings: { select: { key: true, label: true } } },
  });
  const compositionKeys = resolveCompositionKeys(sourceFields);

  const [yesterdayCount, todayCount, cumulativeCount, rangeCount, previousRangeCount, cumulativeBeforeRange, thisYearCumulativeCount, lastYearTotalCount, lastYearRangeCount, heatmapRecords, utmGroups, heatmapRows, cumulativeDailyRows, utmTrendRows] = await Promise.all([
    prisma.collectRecord.count({ where: buildWhere({ ...baseParams, from: yesterdayStart, lt: todayStart }) }),
    prisma.collectRecord.count({ where: buildWhere({ ...baseParams, from: todayStart, to: now }) }),
    prisma.collectRecord.count({ where: buildWhere(baseParams) }),
    prisma.collectRecord.count({ where: rangeWhere }),
    prisma.collectRecord.count({ where: buildWhere({ ...baseParams, from: previousFrom, lt: from }) }),
    prisma.collectRecord.count({ where: buildWhere({ ...baseParams, lt: from }) }),
    // 작년 대비 지표 — 같은 프로젝트를 매년 재사용하므로(연도만 이름에서 바뀜) CollectRecord 자체에서 바로 계산 가능.
    prisma.collectRecord.count({ where: buildWhere({ ...baseParams, from: thisYearStart, to: now }) }),
    prisma.collectRecord.count({ where: buildWhere({ ...baseParams, from: lastYearStart, lt: thisYearStart }) }),
    prisma.collectRecord.count({ where: buildWhere({ ...baseParams, from: lastYearRangeFrom, lt: lastYearRangeTo }) }),
    // composition / emailDomainTop / dedup 용 — data JSON 전체 대신 집계에 필요한 필드만 추출(egress 절감).
    // 매칭되는 필드가 없으면 빈 배열. jsonb_build_object 로 부분 data 객체를 재구성 → 기존 메모리 로직 그대로 동작.
    (() => {
      if (compositionKeys.length === 0) {
        return Promise.resolve([] as Array<{ sourceId: string; data: Prisma.JsonValue }>);
      }
      const base = rangeRawWhere.values.length;
      // pg 파라미터 타입 모호성 회피: jsonb_build_object 키와 data-> 키 모두 ::text 캐스팅
      const pairs = compositionKeys.map((_, i) => `$${base + i + 1}::text, data->($${base + i + 1}::text)`).join(", ");
      return prisma.$queryRawUnsafe<Array<{ sourceId: string; data: Prisma.JsonValue }>>(
        `SELECT "sourceId", jsonb_build_object(${pairs}) AS data FROM "CollectRecord" WHERE ${rangeRawWhere.clause} LIMIT 50000`,
        ...rangeRawWhere.values, ...compositionKeys,
      );
    })(),
    (prisma.collectRecord.groupBy as unknown as (args: {
      by: string[];
      where: Prisma.CollectRecordWhereInput;
      _count: { _all: true };
    }) => Promise<Array<Record<string, string | null> & { _count: { _all: number } }>>)({
      by: [getUtmColumns(filters).source, getUtmColumns(filters).medium, getUtmColumns(filters).campaign],
      where: rangeWhere,
      _count: { _all: true },
    }),
    // Heatmap: KST day-of-week + hour aggregation in SQL.
    prisma.$queryRawUnsafe<Array<{ dow: number; hour: number; count: number }>>(`
      SELECT
        (EXTRACT(DOW FROM ("createdAt" + INTERVAL '9 hours')))::int AS dow,
        (EXTRACT(HOUR FROM ("createdAt" + INTERVAL '9 hours')))::int AS hour,
        COUNT(*)::int AS count
      FROM "CollectRecord"
      WHERE ${rangeRawWhere.clause}
      GROUP BY dow, hour
    `, ...rangeRawWhere.values),
    // Cumulative daily counts (KST).
    prisma.$queryRawUnsafe<Array<{ day: string; count: number }>>(`
      SELECT
        TO_CHAR(DATE_TRUNC('day', "createdAt" + INTERVAL '9 hours'), 'YYYY-MM-DD') AS day,
        COUNT(*)::int AS count
      FROM "CollectRecord"
      WHERE ${rangeRawWhere.clause}
      GROUP BY day
      ORDER BY day
    `, ...rangeRawWhere.values),
    // Daily UTM trend (source + medium pair, per KST day).
    prisma.$queryRawUnsafe<Array<{ day: string; source: string | null; medium: string | null; count: number }>>(`
      SELECT
        TO_CHAR(DATE_TRUNC('day', "createdAt" + INTERVAL '9 hours'), 'YYYY-MM-DD') AS day,
        "${utmSourceCol}" AS source,
        "${utmMediumCol}" AS medium,
        COUNT(*)::int AS count
      FROM "CollectRecord"
      WHERE ${rangeRawWhere.clause}
      GROUP BY day, source, medium
    `, ...rangeRawWhere.values),
  ]);

  const fieldAliasesBySource = buildFieldAliasLookup(sourceFields);
  const composition = VISITOR_DIMENSIONS.map((dimension) => {
    const counts = new Map<string, number>();
    for (const record of heatmapRecords as unknown as CompositionRecord[]) {
      const fieldAliases = fieldAliasesBySource.get(record.sourceId) ?? [];
      for (const value of pickValue(record.data, dimension.candidates, fieldAliases)) {
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
    }
    const items = topEntriesBySectionMax(counts, 5);
    return { key: dimension.key, label: dimension.label, items, total: Array.from(counts.values()).reduce((sum, count) => sum + count, 0) };
  }).filter((section) => section.items.length > 0).slice(0, 4);

  // Email domain TOP 10
  const emailDomainCounts = new Map<string, number>();
  for (const record of heatmapRecords as unknown as CompositionRecord[]) {
    const fieldAliases = fieldAliasesBySource.get(record.sourceId) ?? [];
    const emails = pickValue(record.data, EMAIL_FIELD_CANDIDATES, fieldAliases);
    for (const email of emails) {
      const trimmed = email.trim().toLowerCase();
      const atIndex = trimmed.lastIndexOf("@");
      if (atIndex < 1 || atIndex === trimmed.length - 1) continue;
      const domain = trimmed.slice(atIndex + 1);
      if (!domain.includes(".")) continue;
      emailDomainCounts.set(domain, (emailDomainCounts.get(domain) ?? 0) + 1);
    }
  }
  const emailDomainTotal = Array.from(emailDomainCounts.values()).reduce((s, c) => s + c, 0);
  const emailDomainTop = Array.from(emailDomainCounts.entries())
    .map(([domain, count]) => ({
      domain,
      count,
      percent: emailDomainTotal > 0 ? (count / emailDomainTotal) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Unique vs duplicate email (within range)
  const emailSeen = new Map<string, number>();
  let recordsWithEmail = 0;
  for (const record of heatmapRecords as unknown as CompositionRecord[]) {
    const fieldAliases = fieldAliasesBySource.get(record.sourceId) ?? [];
    const emails = pickValue(record.data, EMAIL_FIELD_CANDIDATES, fieldAliases);
    if (emails.length === 0) continue;
    const email = emails[0].trim().toLowerCase();
    if (!email || !email.includes("@")) continue;
    recordsWithEmail += 1;
    emailSeen.set(email, (emailSeen.get(email) ?? 0) + 1);
  }
  const uniqueEmails = emailSeen.size;
  const duplicateRecords = recordsWithEmail - uniqueEmails;
  const dedup = {
    totalRecordsWithEmail: recordsWithEmail,
    uniqueEmails,
    duplicateRecords,
    uniqueRatio: recordsWithEmail > 0 ? uniqueEmails / recordsWithEmail : null,
  };

  /**
   * source/medium 은 접은 키로 **재병합**한다.
   *
   * groupBy 는 DB 원본값으로 묶으므로 naver / Naver 가 별개 그룹으로 나온다. 예전엔 trim 만 하고
   * 재병합을 안 해서 같은 채널이 리포트에 두 줄로 잡히고 비율(percent)이 서로 나뉘었다.
   * 정규화 규칙은 웨비나 분석 표와 같은 함수(attribution-normalize)를 쓴다 — 한 제품 안에서
   * 같은 채널이 화면마다 다른 이름·다른 비율로 보이면 안 된다.
   */
  const mergedUtm = new Map<string, { source: string; medium: string; campaign: string; count: number }>();
  for (const group of utmGroups) {
    const source = normalizeUtmKey(group[utmCols.source]);
    const medium = normalizeUtmKey(group[utmCols.medium]);
    const campaign = cleanUtmValue(group[utmCols.campaign]);
    if (!source && !medium && !campaign) continue;
    const key = `${source}|${medium}|${campaign}`;
    const prev = mergedUtm.get(key);
    if (prev) prev.count += group._count._all;
    else mergedUtm.set(key, { source, medium, campaign, count: group._count._all });
  }
  const utmRows = Array.from(mergedUtm.values());
  const utmTotal = utmRows.reduce((sum, group) => sum + group.count, 0);
  const utmTop = utmRows
    .map((group) => ({
      source: group.source || "소스 미지정",
      medium: group.medium || "매체 미지정",
      campaign: group.campaign || "캠페인 미지정",
      count: group.count,
      percent: utmTotal > 0 ? (group.count / utmTotal) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  function aggregateUtm(keyFn: (row: { source: string; medium: string; count: number }) => string) {
    const map = new Map<string, number>();
    for (const row of utmRows) {
      const k = keyFn(row);
      if (!k) continue;
      map.set(k, (map.get(k) ?? 0) + row.count);
    }
    return topEntriesBySectionMax(map, Infinity);
  }
  const utmBySource = aggregateUtm((row) => row.source);
  const utmByMedium = aggregateUtm((row) => row.medium);
  const utmBySourceMedium = aggregateUtm((row) => [row.source, row.medium].filter(Boolean).join(" / "));

  const rangeChange = previousRangeCount > 0 ? ((rangeCount - previousRangeCount) / previousRangeCount) * 100 : null;
  const goalProgressPercent = lastYearTotalCount > 0 ? (thisYearCumulativeCount / lastYearTotalCount) * 100 : null;
  const lastYearRangeChange = lastYearRangeCount > 0 ? ((rangeCount - lastYearRangeCount) / lastYearRangeCount) * 100 : null;

  // GA4 퍼널 — 사전등록 폼 자체엔 방문 추적이 없어서(collect-script.ts는 제출만 잡음), 이미 설치된
  // GA4에서 방문자 수를 끌어온다. 속성 미설정이거나 조회 실패면 퍼널 전체를 숨긴다(부분 데이터로 오해 방지).
  const funnel = project.ga4PropertyId
    ? await (async () => {
        const propertyId = project.ga4PropertyId!;
        const pagePathPrefix = project.ga4RegistrationPagePath || null;
        const [homepageVisitors, previousHomepageVisitors, registrationPageVisitors, previousRegistrationPageVisitors] = await Promise.all([
          getGa4ActiveUsers({ propertyId, from, to }),
          getGa4ActiveUsers({ propertyId, from: previousFrom, to: from }),
          pagePathPrefix ? getGa4ActiveUsers({ propertyId, pagePathPrefix, from, to }) : Promise.resolve(null),
          pagePathPrefix ? getGa4ActiveUsers({ propertyId, pagePathPrefix, from: previousFrom, to: from }) : Promise.resolve(null),
        ]);
        if (homepageVisitors === null) return null;
        const homepageVisitorsChange =
          previousHomepageVisitors && previousHomepageVisitors > 0
            ? ((homepageVisitors - previousHomepageVisitors) / previousHomepageVisitors) * 100
            : null;
        const registrationPageVisitorsChange =
          registrationPageVisitors !== null && previousRegistrationPageVisitors && previousRegistrationPageVisitors > 0
            ? ((registrationPageVisitors - previousRegistrationPageVisitors) / previousRegistrationPageVisitors) * 100
            : null;
        return {
          homepageVisitors,
          homepageVisitorsChange,
          registrationPageVisitors,
          registrationPageVisitorsChange,
          registrants: rangeCount,
          homepageToPageRate:
            registrationPageVisitors !== null && homepageVisitors > 0
              ? (registrationPageVisitors / homepageVisitors) * 100
              : null,
          pageToRegistrantRate:
            registrationPageVisitors !== null && registrationPageVisitors > 0
              ? (rangeCount / registrationPageVisitors) * 100
              : null,
        };
      })()
    : null;

  // Anomaly detection
  const cumulativeTrend = buildCumulativeTrendFromRows(cumulativeDailyRows, from, to, cumulativeBeforeRange);
  const dailyCounts = cumulativeTrend.map((p) => p.count);
  let anomaly: null | { date: string; count: number; avg: number; severity: "low" | "high"; deviation: number } = null;
  if (dailyCounts.length >= 7) {
    const recent = cumulativeTrend[cumulativeTrend.length - 1];
    const baseline = dailyCounts.slice(-8, -1);
    if (baseline.length >= 5) {
      const avg = baseline.reduce((s, c) => s + c, 0) / baseline.length;
      const variance = baseline.reduce((s, c) => s + (c - avg) ** 2, 0) / baseline.length;
      const sd = Math.sqrt(variance);
      const threshold = Math.max(sd * 1.5, avg * 0.25);
      const diff = recent.count - avg;
      if (Math.abs(diff) >= threshold && avg > 0) {
        anomaly = {
          date: recent.date,
          count: recent.count,
          avg: Math.round(avg * 10) / 10,
          severity: diff < 0 ? "low" : "high",
          deviation: Math.round((diff / avg) * 100),
        };
      }
    }
  }

  const payload: RealtimeReportData = {
    generatedAt: now.toISOString(),
    project: { id: project.id, name: project.name },
    performance: {
      yesterdayCount,
      todayCount,
      cumulativeCount,
      rangeCount,
      previousRangeCount,
      rangeChange,
      thisYearCumulativeCount,
      lastYearTotalCount,
      goalProgressPercent,
      lastYearRangeCount,
      lastYearRangeChange,
    },
    funnel,
    composition,
    emailDomainTop,
    emailDomainTotal,
    dedup,
    anomaly,
    cumulativeTrend,
    dailyUtmTrend: buildDailyUtmTrendFromRows(utmTrendRows, from, to),
    utmTop,
    utmBySource,
    utmByMedium,
    utmBySourceMedium,
    heatmap: buildHeatmapFromRows(heatmapRows),
  };
  REPORT_CACHE.set(cacheKey, { at: Date.now(), data: payload });
  return { data: payload };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const body: RequestBody = await request.json();
  const { workspaceId, projectId, filters, from, to } = body;
  if (!workspaceId || !projectId) {
    return NextResponse.json({ error: "workspaceId, projectId 필요" }, { status: 400 });
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const result = await generateDashboardReport({ workspaceId, projectId, filters, from, to });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  return NextResponse.json(result.data);
}
