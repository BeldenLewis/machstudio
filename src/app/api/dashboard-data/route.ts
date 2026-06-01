import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { dashboardCache } from "@/lib/cache";
import { createHash } from "node:crypto";

type WidgetType =
  | "kpi"
  | "time_series"
  | "utm_breakdown"
  | "top_n"
  | "field_distribution"
  | "recent_feed"
  | "performance_table"
  | "heatmap"
  | "gauge"
  | "sparkline_kpi"
  | "funnel"
  | "auto_insight";

interface GlobalFilters {
  sourceId?: string | null;       // 위젯 sourceId 위에 override
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  attribution?: "last" | "first"; // 모든 utm 필드를 last/first 중 한쪽으로 해석
}

interface RequestBody {
  workspaceId: string;
  projectId: string;
  type: WidgetType;
  config: Record<string, unknown>;
  from?: string;
  to?: string;
  filters?: GlobalFilters;
}

function parseDate(s: string | undefined, fallback: Date): Date {
  if (!s) return fallback;
  const d = new Date(s);
  return isNaN(d.getTime()) ? fallback : d;
}

function getStringConfig(config: Record<string, unknown>, key: string): string | undefined {
  const v = config[key];
  return typeof v === "string" && v ? v : undefined;
}

function getNumberConfig(config: Record<string, unknown>, key: string, def: number): number {
  const v = config[key];
  return typeof v === "number" && !isNaN(v) ? v : def;
}

// 데이터 범위 빌더 — 위젯 config + 전역 필터 결합
function recordWhere(
  projectId: string,
  config: Record<string, unknown>,
  from: Date,
  to: Date,
  filters?: GlobalFilters,
): Record<string, unknown> {
  const widgetSourceId = getStringConfig(config, "sourceId");
  const globalSourceId = filters?.sourceId && filters.sourceId !== "all" ? filters.sourceId : undefined;
  // 전역 필터의 소스가 우선
  const sourceId = globalSourceId ?? widgetSourceId;

  const useFirst = filters?.attribution === "first";
  const utmCol = useFirst
    ? { source: "firstUtmSource", medium: "firstUtmMedium", campaign: "firstUtmCampaign" }
    : { source: "utmSource", medium: "utmMedium", campaign: "utmCampaign" };

  const where: Record<string, unknown> = {
    projectId,
    ...(sourceId && sourceId !== "all" ? { sourceId } : {}),
    createdAt: { gte: from, lte: to },
  };
  if (filters?.utmSource)   where[utmCol.source]   = filters.utmSource;
  if (filters?.utmMedium)   where[utmCol.medium]   = filters.utmMedium;
  if (filters?.utmCampaign) where[utmCol.campaign] = filters.utmCampaign;
  return where;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const body: RequestBody = await request.json();
  const { workspaceId, projectId, type, config } = body;
  if (!workspaceId || !projectId || !type) {
    return NextResponse.json({ error: "workspaceId, projectId, type 필요" }, { status: 400 });
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId } });
  if (!project) return NextResponse.json({ error: "프로젝트 없음" }, { status: 404 });

  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 86400_000);
  const from = parseDate(body.from, defaultFrom);
  const to = parseDate(body.to, now);

  // 캐시 키 — 동일 쿼리에 대해 15초간 결과 재사용
  const cacheKey = "dash:" + createHash("sha1").update(JSON.stringify({
    projectId, type, config, from: from.toISOString(), to: to.toISOString(), filters: body.filters,
  })).digest("hex");
  const cached = dashboardCache.get(cacheKey);
  if (cached) return NextResponse.json(cached);

  const where = recordWhere(projectId, config ?? {}, from, to, body.filters);

  const respond = (payload: unknown) => {
    dashboardCache.set(cacheKey, payload);
    return NextResponse.json(payload);
  };

  switch (type) {
    case "kpi": {
      const total = await prisma.collectRecord.count({ where });
      let previous: number | null = null;
      if (config?.compareWithPrevious) {
        const span = to.getTime() - from.getTime();
        const prevFrom = new Date(from.getTime() - span);
        const prevTo = from;
        previous = await prisma.collectRecord.count({
          where: { ...where, createdAt: { gte: prevFrom, lt: prevTo } },
        });
      }
      const change = previous !== null && previous > 0
        ? ((total - previous) / previous) * 100
        : null;
      return respond({ value: total, previous, change });
    }

    case "sparkline_kpi": {
      const total = await prisma.collectRecord.count({ where });
      const records = await prisma.collectRecord.findMany({
        where, select: { createdAt: true }, orderBy: { createdAt: "asc" },
      });
      const points = bucketize(records.map((r) => r.createdAt), "day", from, to);
      const span = to.getTime() - from.getTime();
      const prevFrom = new Date(from.getTime() - span);
      const prevTotal = await prisma.collectRecord.count({
        where: { ...where, createdAt: { gte: prevFrom, lt: from } },
      });
      const change = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;
      return respond({ value: total, points, previous: prevTotal, change });
    }

    case "gauge": {
      const total = await prisma.collectRecord.count({ where });
      const target = typeof config?.target === "number" ? config.target : 100;
      return respond({ value: total, target, percent: target > 0 ? (total / target) * 100 : 0 });
    }

    case "time_series": {
      const granularity = (getStringConfig(config ?? {}, "granularity") ?? "day") as "hour" | "day" | "week";
      // Postgres date_trunc 로 직접 버킷 집계 (메모리 부담 ↓)
      const bucketed = await groupByTimeBucket(where as Record<string, unknown>, granularity);
      const points = fillMissingBuckets(bucketed, granularity, from, to);
      let prevPoints: { date: string; count: number }[] | null = null;
      if (config?.compareWithPrevious) {
        const span = to.getTime() - from.getTime();
        const prevFrom = new Date(from.getTime() - span);
        const prevTo = from;
        const prevWhere = { ...where, createdAt: { gte: prevFrom, lt: prevTo } };
        const prevBucketed = await groupByTimeBucket(prevWhere, granularity);
        // 이전 버킷 키를 현재 기간 라벨로 shift
        const shifted = prevBucketed.map((p) => ({ date: shiftBucket(p.date, span, granularity), count: p.count }));
        prevPoints = fillMissingBuckets(shifted, granularity, from, to);
      }
      return respond({ points, prevPoints, granularity });
    }

    case "utm_breakdown": {
      const dimension = (getStringConfig(config ?? {}, "dimension") ?? "utmSource") as string;
      const ALLOWED = new Set([
        "utmSource", "utmMedium", "utmCampaign", "utmTerm", "utmContent",
        "firstUtmSource", "firstUtmMedium", "firstUtmCampaign", "firstUtmTerm", "firstUtmContent",
      ]);
      const safeDim = ALLOWED.has(dimension) ? dimension : "utmSource";

      // Postgres GROUP BY 로 집계 (메모리 사용 최소화)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const groups = await (prisma.collectRecord.groupBy as any)({
        by: [safeDim],
        where,
        _count: { _all: true },
      }) as Array<Record<string, unknown> & { _count: { _all: number } }>;

      const total = groups.reduce((s, g) => s + g._count._all, 0);
      const items = groups.map((g) => {
        const raw = g[safeDim];
        const key = (typeof raw === "string" && raw.trim()) ? raw : "(없음)";
        return { key, count: g._count._all, percent: total > 0 ? (g._count._all / total) * 100 : 0 };
      });
      return respond({ items, total });
    }

    case "top_n": {
      const dimension = (getStringConfig(config ?? {}, "dimension") ?? "utmCampaign") as string;
      const topN = getNumberConfig(config ?? {}, "topN", 5);

      let valueExtractor: (r: Record<string, unknown>) => string;
      if (dimension.startsWith("data.")) {
        const fieldKey = dimension.slice(5);
        valueExtractor = (r) => {
          const data = (r.data ?? {}) as Record<string, unknown>;
          const v = data[fieldKey];
          return v == null ? "" : String(v);
        };
      } else {
        valueExtractor = (r) => {
          const v = r[dimension];
          return v == null ? "" : String(v);
        };
      }

      const records = await prisma.collectRecord.findMany({
        where,
        select: {
          data: true,
          utmSource: true, utmMedium: true, utmCampaign: true, utmTerm: true, utmContent: true,
          firstUtmSource: true, firstUtmMedium: true, firstUtmCampaign: true, firstUtmTerm: true, firstUtmContent: true,
          referrer: true,
        },
      });
      const counts = new Map<string, number>();
      for (const r of records) {
        const v = valueExtractor(r as Record<string, unknown>).trim();
        if (!v) continue;
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      const items = Array.from(counts.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, topN);
      return respond({ items });
    }

    case "field_distribution": {
      const fieldKey = getStringConfig(config ?? {}, "field");
      if (!fieldKey) {
        return NextResponse.json({ items: [], error: "field 설정 필요" });
      }
      const records = await prisma.collectRecord.findMany({
        where,
        select: { data: true },
      });
      const counts = new Map<string, number>();
      for (const r of records) {
        const data = (r.data ?? {}) as Record<string, unknown>;
        const raw = data[fieldKey];
        if (raw == null) continue;
        // 콤마/쉼표로 구분된 다중 선택값도 분리
        const values = String(raw).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
        for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
      const items = Array.from(counts.entries())
        .map(([key, count]) => ({ key, count, percent: total > 0 ? (count / total) * 100 : 0 }))
        .sort((a, b) => b.count - a.count);
      return respond({ items, total });
    }

    case "performance_table": {
      const dimension = (getStringConfig(config ?? {}, "dimension") ?? "utmCampaign") as string;
      const topN = getNumberConfig(config ?? {}, "topN", 20);
      const ALLOWED = new Set([
        "utmSource", "utmMedium", "utmCampaign", "utmTerm", "utmContent",
        "firstUtmSource", "firstUtmMedium", "firstUtmCampaign",
        "sourceId",
      ]);
      const safeDim = ALLOWED.has(dimension) ? dimension : "utmCampaign";

      const records = await prisma.collectRecord.findMany({
        where,
        select: {
          [safeDim]: true, createdAt: true,
        } as never,
      }) as unknown as Array<Record<string, string | Date | null>>;

      const span = to.getTime() - from.getTime();
      const prevFrom = new Date(from.getTime() - span);
      const prevRecords = await prisma.collectRecord.findMany({
        where: { ...where, createdAt: { gte: prevFrom, lt: from } },
        select: { [safeDim]: true } as never,
      }) as unknown as Array<Record<string, string | null>>;

      const counts = new Map<string, number>();
      for (const r of records) {
        const v = (r[safeDim] as string | null) ?? "(없음)";
        const key = String(v) || "(없음)";
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const prevCounts = new Map<string, number>();
      for (const r of prevRecords) {
        const v = (r[safeDim] ?? "(없음)") as string;
        prevCounts.set(v, (prevCounts.get(v) ?? 0) + 1);
      }
      // 소스 ID → 소스 이름 lookup (필요할 때만)
      const nameMap = new Map<string, string>();
      if (safeDim === "sourceId") {
        const sources = await prisma.collectSource.findMany({
          where: { projectId },
          select: { id: true, name: true },
        });
        sources.forEach((s) => nameMap.set(s.id, s.name));
      }

      const total = records.length;
      const items = Array.from(counts.entries())
        .map(([key, count]) => {
          const prev = prevCounts.get(key) ?? 0;
          const change = prev > 0 ? ((count - prev) / prev) * 100 : null;
          return {
            key,
            display: nameMap.get(key) ?? key,
            count,
            previous: prev,
            change,
            share: total > 0 ? (count / total) * 100 : 0,
          };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, topN);

      return respond({ items, total, dimension: safeDim });
    }

    case "heatmap": {
      const records = await prisma.collectRecord.findMany({
        where, select: { createdAt: true },
      });
      const KST_OFFSET = 9 * 60 * 60_000;
      // 7 (월-일) x 24 (시) 매트릭스
      const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
      for (const r of records) {
        const kst = new Date(r.createdAt.getTime() + KST_OFFSET);
        const dow = (kst.getUTCDay() + 6) % 7; // 월=0
        const hour = kst.getUTCHours();
        matrix[dow][hour]++;
      }
      let max = 0;
      for (const row of matrix) for (const v of row) if (v > max) max = v;
      return respond({ matrix, max });
    }

    case "funnel": {
      const stages = Array.isArray(config?.funnelStages) ? (config.funnelStages as string[]) : [];
      if (stages.length === 0) {
        return NextResponse.json({ stages: [], error: "단계 설정 필요" });
      }
      // N+1 → 2 쿼리: 카운트 한 번 + 소스 이름 한 번
      const [counts, sources] = await Promise.all([
        prisma.collectRecord.groupBy({
          by: ["sourceId"],
          where: { sourceId: { in: stages }, projectId, createdAt: { gte: from, lte: to } },
          _count: { _all: true },
        }),
        prisma.collectSource.findMany({
          where: { id: { in: stages } },
          select: { id: true, name: true },
        }),
      ]);
      const countMap = new Map(counts.map((c) => [c.sourceId, c._count._all]));
      const nameMap = new Map(sources.map((s) => [s.id, s.name]));
      const results = stages.map((sourceId) => ({
        sourceId,
        name: nameMap.get(sourceId) ?? sourceId,
        count: countMap.get(sourceId) ?? 0,
      }));
      const top = results[0]?.count ?? 0;
      const enriched = results.map((r, i) => ({
        ...r,
        percentOfTop: top > 0 ? (r.count / top) * 100 : 0,
        percentOfPrev: i === 0 ? 100 : (results[i - 1].count > 0 ? (r.count / results[i - 1].count) * 100 : 0),
      }));
      return respond({ stages: enriched });
    }

    case "auto_insight": {
      // 현재 기간 vs 이전 기간 비교, UTM 소스/매체별 큰 변화 감지
      const span = to.getTime() - from.getTime();
      const prevFrom = new Date(from.getTime() - span);
      const useFirst = body.filters?.attribution === "first";
      const sourceCol = useFirst ? "firstUtmSource" : "utmSource";
      const mediumCol = useFirst ? "firstUtmMedium" : "utmMedium";

      const [currRows, prevRows] = await Promise.all([
        prisma.collectRecord.findMany({
          where,
          select: { [sourceCol]: true, [mediumCol]: true } as never,
        }) as unknown as Promise<Array<Record<string, string | null>>>,
        prisma.collectRecord.findMany({
          where: { ...where, createdAt: { gte: prevFrom, lt: from } },
          select: { [sourceCol]: true, [mediumCol]: true } as never,
        }) as unknown as Promise<Array<Record<string, string | null>>>,
      ]);

      function tally(rows: Array<Record<string, string | null>>, col: string) {
        const m = new Map<string, number>();
        for (const r of rows) {
          const v = (r[col] ?? "(없음)") as string;
          m.set(v, (m.get(v) ?? 0) + 1);
        }
        return m;
      }
      const insights: { type: "up" | "down" | "new" | "gone"; label: string; detail: string; change: number | null }[] = [];

      for (const col of [sourceCol, mediumCol] as const) {
        const curr = tally(currRows, col);
        const prev = tally(prevRows, col);
        const dimensionName = col === sourceCol ? "UTM 소스" : "UTM 매체";
        const keys = new Set([...curr.keys(), ...prev.keys()]);
        for (const k of keys) {
          if (k === "(없음)" || !k) continue;
          const c = curr.get(k) ?? 0;
          const p = prev.get(k) ?? 0;
          if (p === 0 && c >= 3) {
            insights.push({ type: "new", label: `🚀 신규 채널: ${k}`, detail: `${dimensionName} "${k}" 가 이번 기간 ${c}건 신규 발생`, change: null });
          } else if (c === 0 && p >= 5) {
            insights.push({ type: "gone", label: `📉 사라진 채널: ${k}`, detail: `${dimensionName} "${k}" 가 ${p}건 → 0건 (활동 중단)`, change: -100 });
          } else if (p > 0) {
            const change = ((c - p) / p) * 100;
            if (Math.abs(change) >= 50 && (c + p) >= 10) {
              insights.push({
                type: change > 0 ? "up" : "down",
                label: `${change > 0 ? "🔥" : "⚠️"} ${k}: ${change > 0 ? "+" : ""}${change.toFixed(0)}%`,
                detail: `${dimensionName} "${k}" ${p}건 → ${c}건`,
                change,
              });
            }
          }
        }
      }

      insights.sort((a, b) => Math.abs((b.change ?? 999)) - Math.abs((a.change ?? 999)));
      return respond({ insights: insights.slice(0, 10) });
    }

    case "recent_feed": {
      const limit = getNumberConfig(config ?? {}, "limit", 10);
      const records = await prisma.collectRecord.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: Math.min(Math.max(limit, 1), 50),
        include: { source: { select: { id: true, name: true } } },
      });
      return respond({ items: records });
    }

    default:
      return NextResponse.json({ error: "지원하지 않는 위젯 타입" }, { status: 400 });
  }
}

// Postgres 에서 date_trunc 로 직접 버킷 집계 — 메모리 사용 ↓, 인덱스 활용
async function groupByTimeBucket(
  where: Record<string, unknown>,
  granularity: "hour" | "day" | "week",
): Promise<{ date: string; count: number }[]> {
  const trunc = granularity === "hour" ? "hour" : granularity === "week" ? "week" : "day";
  const w = where as { projectId?: string; sourceId?: string; createdAt?: { gte?: Date; lte?: Date } };
  // Prisma v7 회귀(#28963) 회피 + sourceId 파라미터화(기존 문자열 삽입은 인젝션 위험).
  // trunc 은 고정 화이트리스트(hour/week/day)라 식별자처럼 직접 삽입해도 안전.
  const conds: string[] = [`"projectId" = $1`];
  const values: unknown[] = [w.projectId];
  if (w.sourceId) { values.push(w.sourceId); conds.push(`"sourceId" = $${values.length}`); }
  values.push(w.createdAt?.gte ?? new Date(0)); conds.push(`"createdAt" >= $${values.length}`);
  values.push(w.createdAt?.lte ?? new Date()); conds.push(`"createdAt" <= $${values.length}`);
  const rows = await prisma.$queryRawUnsafe<{ bucket: Date; count: bigint }[]>(`
    SELECT date_trunc('${trunc}', "createdAt" AT TIME ZONE 'Asia/Seoul') AS bucket,
           COUNT(*)::bigint AS count
    FROM "CollectRecord"
    WHERE ${conds.join(" AND ")}
    GROUP BY bucket
    ORDER BY bucket ASC
  `, ...values);
  return rows.map((r) => ({
    date: formatBucket(r.bucket, granularity),
    count: Number(r.count),
  }));
}


function formatBucket(d: Date, g: "hour" | "day" | "week"): string {
  // date_trunc 결과는 UTC date. KST 라벨로 포맷.
  // AT TIME ZONE 'Asia/Seoul' 결과를 UTC 로 받아옴 → KST 시각으로 해석하려면 +9시간 보정.
  const kst = new Date(d.getTime());
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  if (g === "hour") {
    const h = String(kst.getUTCHours()).padStart(2, "0");
    return `${y}-${m}-${day} ${h}:00`;
  }
  return `${y}-${m}-${day}`;
}

function fillMissingBuckets(
  points: { date: string; count: number }[],
  granularity: "hour" | "day" | "week",
  from: Date,
  to: Date,
): { date: string; count: number }[] {
  const KST = 9 * 60 * 60_000;
  const out = new Map<string, number>();
  const step = granularity === "hour" ? 3600_000 : granularity === "week" ? 7 * 86400_000 : 86400_000;
  for (let t = from.getTime(); t <= to.getTime(); t += step) {
    const kst = new Date(t + KST);
    const y = kst.getUTCFullYear();
    const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
    const d = String(kst.getUTCDate()).padStart(2, "0");
    const key = granularity === "hour"
      ? `${y}-${m}-${d} ${String(kst.getUTCHours()).padStart(2, "0")}:00`
      : `${y}-${m}-${d}`;
    out.set(key, 0);
  }
  for (const p of points) out.set(p.date, (out.get(p.date) ?? 0) + p.count);
  return Array.from(out.entries()).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
}

function shiftBucket(date: string, spanMs: number, granularity: "hour" | "day" | "week"): string {
  const [datePart, timePart] = date.split(" ");
  const [y, m, d] = datePart.split("-").map(Number);
  const h = timePart ? parseInt(timePart.split(":")[0]) : 0;
  const t = Date.UTC(y, m - 1, d, h) + spanMs;
  const dt = new Date(t);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  if (granularity === "hour") return `${yy}-${mm}-${dd} ${String(dt.getUTCHours()).padStart(2, "0")}:00`;
  return `${yy}-${mm}-${dd}`;
}

// (legacy) 시계열 버킷화 — JS 메모리 처리. 작은 데이터셋용으로 유지.
function bucketize(dates: Date[], granularity: "hour" | "day" | "week", from: Date, to: Date) {
  const KST_OFFSET = 9 * 60 * 60_000;
  const buckets = new Map<string, number>();

  const bucketKey = (d: Date): string => {
    const kst = new Date(d.getTime() + KST_OFFSET);
    if (granularity === "hour") {
      return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")} ${String(kst.getUTCHours()).padStart(2, "0")}:00`;
    }
    if (granularity === "week") {
      // ISO week 시작(월요일) KST 기준
      const dow = kst.getUTCDay() || 7;
      const monday = new Date(kst.getTime() - (dow - 1) * 86400_000);
      return `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, "0")}-${String(monday.getUTCDate()).padStart(2, "0")}`;
    }
    // day
    return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
  };

  // 미리 모든 버킷을 0으로 채워서 빈 구간도 표시
  const fillBuckets = () => {
    const start = new Date(from.getTime());
    const step = granularity === "hour" ? 3600_000 : granularity === "week" ? 7 * 86400_000 : 86400_000;
    for (let t = start.getTime(); t <= to.getTime(); t += step) {
      buckets.set(bucketKey(new Date(t)), 0);
    }
  };
  fillBuckets();

  for (const d of dates) {
    const k = bucketKey(d);
    if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
    else buckets.set(k, 1);
  }

  return Array.from(buckets.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
