"use client";

import { Activity, BarChart3, CalendarDays, Clock3, Mail, TrendingUp, UserCheck, Users } from "lucide-react";
import type { ElementType } from "react";
import { useState } from "react";
import { motion } from "framer-motion";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useChartColors, seriesColor } from "@/components/ui/use-chart-colors";
import { formatKstDateTime } from "@/lib/datetime";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

interface MetricChange {
  rangeChange: number | null;
}

export interface RealtimeReportData {
  generatedAt: string;
  project: { id: string; name: string };
  performance: {
    yesterdayCount: number;
    todayCount: number;
    cumulativeCount: number;
    rangeCount: number;
    previousRangeCount: number;
    rangeChange: number | null;
  };
  composition: Array<{
    key: string;
    label: string;
    total: number;
    items: Array<{ label: string; count: number; percent: number }>;
  }>;
  cumulativeTrend: Array<{
    date: string;
    label: string;
    count: number;
    cumulative: number;
  }>;
  utmTop: Array<{
    source: string;
    medium: string;
    campaign: string;
    count: number;
    percent: number;
  }>;
  utmBySource: Array<{ label: string; count: number; percent: number }>;
  utmByMedium: Array<{ label: string; count: number; percent: number }>;
  utmBySourceMedium: Array<{ label: string; count: number; percent: number }>;
  dailyUtmTrend?: {
    source: { topKeys: string[]; rows: Array<{ date: string; [key: string]: number | string }> };
    medium: { topKeys: string[]; rows: Array<{ date: string; [key: string]: number | string }> };
    combined: { topKeys: string[]; rows: Array<{ date: string; [key: string]: number | string }> };
  };
  heatmap: {
    dayLabels: string[];
    matrix: number[][];
    max: number;
    peakDay: { label: string; count: number };
    peakHour: { hour: number; count: number };
    topSlots: Array<{ day: string; hour: number; count: number }>;
  };
  emailDomainTop: Array<{ domain: string; count: number; percent: number }>;
  emailDomainTotal: number;
  dedup: {
    totalRecordsWithEmail: number;
    uniqueEmails: number;
    duplicateRecords: number;
    uniqueRatio: number | null;
  };
  anomaly: null | {
    date: string;
    count: number;
    avg: number;
    severity: "low" | "high";
    deviation: number;
  };
}

interface Props {
  data: RealtimeReportData | null;
  loading: boolean;
  rangeLabel: string;
}

export function formatNumber(value: number) {
  return value.toLocaleString("ko-KR");
}

export function formatPercent(value: number | null) {
  if (value === null || Number.isNaN(value)) return "비교 데이터 없음";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function MetricCard({ label, value, helper, icon: Icon, badge }: {
  label: string;
  value: string;
  helper: string;
  icon: ElementType;
  badge?: { label: string; tone: "warning" | "good" | "danger" };
}) {
  const toneClass = badge
    ? badge.tone === "warning"
      ? "bg-amber-500/10 text-amber-600"
      : badge.tone === "good"
        ? "bg-emerald-500/10 text-emerald-600"
        : "bg-red-500/10 text-red-600"
    : "";
  return (
    <div className="rounded-2xl border border-border bg-background px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon className="w-4 h-4 text-violet-500" />
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {badge && (
        <motion.span
          initial={{ opacity: 0, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className={`mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${toneClass}`}
        >
          {badge.label}
        </motion.span>
      )}
      <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}

function getKstDateKey(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60_000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
}

function EmailDomainSection({ items, total }: { items: RealtimeReportData["emailDomainTop"]; total: number }) {
  return (
    <section className="rounded-[24px] border border-border bg-background p-5">
      <div className="mb-4 flex items-center gap-2">
        <Mail className="w-4 h-4 text-violet-500" />
        <h3 className="text-sm font-semibold">이메일 도메인</h3>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">등록자 회사·기관 분포 (TOP 10)</p>
      {total > 0 && items.length > 0 ? (
        <div className="space-y-2.5">
          {items.map((item, index) => (
            <div key={item.domain}>
              <div className="flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="shrink-0 font-semibold text-muted-foreground">#{index + 1}</span>
                  <span className="truncate font-medium">{item.domain}</span>
                </div>
                <span className="shrink-0 font-mono font-semibold">{formatNumber(item.count)}건</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-secondary overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(item.percent, 100)}%` }}
                  transition={spring}
                  className="h-full rounded-full bg-violet-500/70"
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          등록자 이메일 정보가 없어요
        </p>
      )}
    </section>
  );
}

function DedupCard({ dedup }: { dedup: RealtimeReportData["dedup"] }) {
  if (dedup.totalRecordsWithEmail === 0) return null;
  const uniquePct = dedup.uniqueRatio !== null ? dedup.uniqueRatio * 100 : 0;
  return (
    <motion.section
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="rounded-2xl border border-border bg-background p-5"
    >
      <div className="mb-3 flex items-center gap-2">
        <UserCheck className="w-4 h-4 text-violet-500" />
        <h3 className="text-sm font-semibold">신규 vs 중복</h3>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">신규 이메일</p>
          <p className="mt-1 text-xl font-semibold text-emerald-600">{formatNumber(dedup.uniqueEmails)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">재등록</p>
          <p className="mt-1 text-xl font-semibold text-muted-foreground">{formatNumber(dedup.duplicateRecords)}</p>
        </div>
      </div>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-secondary">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${uniquePct}%` }}
          transition={spring}
          className="h-full bg-emerald-500/80"
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        기간 내 이메일 보유 등록 {formatNumber(dedup.totalRecordsWithEmail)}건 중
      </p>
    </motion.section>
  );
}

export function ChangeBadge({ rangeChange }: MetricChange) {
  if (rangeChange === null) {
    return <span className="rounded-full bg-secondary px-2 py-1 text-xs text-muted-foreground">비교 준비 중</span>;
  }
  const positive = rangeChange >= 0;
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-medium ${positive ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}`}>
      {formatPercent(rangeChange)}
    </span>
  );
}

function CumulativeLineChart({ points }: { points: RealtimeReportData["cumulativeTrend"] }) {
  const colors = useChartColors();
  if (!points.length) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
        누적 추이를 표시할 등록 데이터가 아직 없습니다.
      </div>
    );
  }

  const first = points[0];
  const last = points[points.length - 1];

  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-violet-500" />
            <h3 className="text-sm font-semibold">누적 등록 추이</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">선택 기간 동안 누적 등록 수가 어떻게 쌓였는지 보여줍니다.</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-muted-foreground">기간 증분</p>
          <p className="text-sm font-semibold">{formatNumber(last.cumulative - first.cumulative + first.count)}건</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={points} margin={{ top: 8, right: 10, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id="cumulativeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={colors.viewers} stopOpacity={0.28} />
              <stop offset="95%" stopColor={colors.viewers} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.45} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            minTickGap={18}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={44}
          />
          <Tooltip
            formatter={(value, name) => [
              `${formatNumber(Number(value))}건`,
              name === "cumulative" ? "누적 등록" : String(name),
            ]}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""}
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "0.75rem",
              fontSize: "12px",
            }}
          />
          <Area
            type="monotone"
            dataKey="cumulative"
            stroke={colors.viewers}
            strokeWidth={2.5}
            fill="url(#cumulativeGradient)"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function DailyBarChart({ points }: { points: RealtimeReportData["cumulativeTrend"] }) {
  const colors = useChartColors();
  if (!points.length) return null;

  // 7일 이동평균 대비 급등(+50%) 감지 — 최소 5건 이상일 때만 (작은 수치 노이즈 방지)
  const SPIKE_THRESHOLD = 1.5;
  const SPIKE_MIN_COUNT = 5;
  const enriched = points.map((p, i) => {
    const baselineStart = Math.max(0, i - 7);
    const baselinePoints = points.slice(baselineStart, i);
    const baselineAvg = baselinePoints.length > 0
      ? baselinePoints.reduce((s, b) => s + b.count, 0) / baselinePoints.length
      : 0;
    const isSpike =
      p.count >= SPIKE_MIN_COUNT &&
      baselineAvg > 0 &&
      p.count >= baselineAvg * SPIKE_THRESHOLD;
    return { ...p, baselineAvg, isSpike };
  });

  const max = Math.max(...points.map((p) => p.count));
  const total = points.reduce((s, p) => s + p.count, 0);
  const avg = total / points.length;
  const spikeCount = enriched.filter((p) => p.isSpike).length;
  const peak = enriched.reduce((best, p) => (p.count > best.count ? p : best), enriched[0]);

  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-violet-500" />
            <h3 className="text-sm font-semibold">일일 등록 현황</h3>
            {spikeCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                급등 {spikeCount}일
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            평소 대비 1.5배 이상 튄 날은 주황색으로 표시돼요
          </p>
        </div>
        <div className="shrink-0 grid grid-cols-2 gap-x-4 gap-y-0.5 text-right">
          <p className="text-[10px] text-muted-foreground">일평균</p>
          <p className="text-[10px] text-muted-foreground">최고</p>
          <p className="text-xs font-semibold tabular-nums">{formatNumber(Math.round(avg))}건</p>
          <p className="text-xs font-semibold tabular-nums text-amber-600">{formatNumber(peak.count)}건</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={enriched} margin={{ top: 8, right: 10, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.45} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            minTickGap={18}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={44}
            domain={[0, Math.ceil(max * 1.1)]}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
            formatter={(value, _name, item) => {
              const p = item?.payload as { baselineAvg?: number; isSpike?: boolean } | undefined;
              const main = `${formatNumber(Number(value))}건`;
              if (p?.isSpike && p.baselineAvg) {
                return [`${main} (평소 ${Math.round(p.baselineAvg)}건 대비 +${Math.round(((Number(value) - p.baselineAvg) / p.baselineAvg) * 100)}%)`, "일일 등록"];
              }
              return [main, "일일 등록"];
            }}
            labelFormatter={(_, payload) => (payload?.[0]?.payload as { date?: string })?.date ?? ""}
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "0.75rem",
              fontSize: "12px",
            }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={32}>
            {enriched.map((p) => (
              <Cell key={p.date} fill={p.isSpike ? colors.series[3] : colors.viewers} fillOpacity={p.isSpike ? 0.9 : 0.75} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CompositionSection({ section }: { section: RealtimeReportData["composition"][number] }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{section.label}</h4>
        <span className="text-xs text-muted-foreground">{formatNumber(section.total)}건</span>
      </div>
      <div className="space-y-1.5">
        {section.items.map((item) => (
          <div key={item.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center">
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-muted-foreground">{item.label}</span>
                <span className="font-mono text-foreground">{formatNumber(item.count)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                <div className="h-full rounded-full bg-violet-500/70" style={{ width: `${Math.min(item.percent, 100)}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UtmTrendChart({ trend }: { trend: RealtimeReportData["dailyUtmTrend"] }) {
  const [tab, setTab] = useState<"source" | "medium" | "combined">("source");
  /**
   * 하드코딩 배열 ["#8b5cf6","#ec4899","#f59e0b","#0a66c2","#10b981"] 을 토큰으로 교체.
   * 그 배열은 세 가지가 틀렸다 — 슬롯1 #8b5cf6 은 리브랜드로 팔레트에서 사라진 보라라
   * 만들기·랜딩이 네이비인데 이 그래프만 보라로 보였고, 배열이 한 벌이라 다크에서
   * 라이트 색이 그대로 나왔고, 슬롯4 #0a66c2 는 슬롯1을 네이비로 바꾸면 구분되지 않는다.
   */
  const colors = useChartColors();

  const view = trend?.[tab];
  const { topKeys = [], rows = [] } = view ?? {};

  const hasData = topKeys.length > 0 && rows.some((row) =>
    topKeys.some((k) => Number(row[k] ?? 0) > 0)
  );

  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-violet-500" />
            <h3 className="text-sm font-semibold">유입 경로별 등록 추이</h3>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">UTM 기준 상위 5개 경로의 일별 등록 흐름입니다.</p>
        </div>
        <div className="relative grid h-8 grid-cols-3 rounded-xl border border-border bg-secondary/30 p-0.5 shrink-0">
          {(["source", "medium", "combined"] as const).map((t, i) => {
            const active = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`relative z-10 rounded-lg px-2.5 text-xs font-medium transition-colors ${
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="utm-trend-pill"
                    transition={spring}
                    className="absolute inset-0 -z-10 rounded-lg bg-background shadow-sm"
                  />
                )}
                {["소스", "매체", "소스/매체"][i]}
              </button>
            );
          })}
        </div>
      </div>
      {hasData ? (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={rows} margin={{ top: 4, right: 10, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.45} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              minTickGap={20}
              tickFormatter={(v: string) => v.slice(5).replace("-", ".")}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={32}
            />
            <Tooltip
              formatter={(value, name) => [`${formatNumber(Number(value))}건`, String(name)]}
              labelFormatter={(label) => String(label)}
              itemSorter={(item) => -Number(item.value ?? 0)}
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "0.75rem",
                fontSize: "12px",
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            {topKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={seriesColor(colors, i)}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-[220px] items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
          선택한 기간에 UTM 유입 데이터가 아직 없습니다.
        </div>
      )}
    </div>
  );
}

type UtmTab = "source" | "medium" | "combined";

const UTM_TABS: Array<{ value: UtmTab; label: string }> = [
  { value: "source", label: "소스" },
  { value: "medium", label: "매체" },
  { value: "combined", label: "소스/매체" },
];

function UtmBreakdownSection({ data }: { data: RealtimeReportData }) {
  const [tab, setTab] = useState<UtmTab>("source");

  const items =
    tab === "source" ? data.utmBySource
    : tab === "medium" ? data.utmByMedium
    : data.utmBySourceMedium;

  return (
    <section className="rounded-[24px] border border-border bg-background p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-violet-500" />
          <h3 className="text-sm font-semibold">유입 경로</h3>
        </div>
        <div className="relative grid h-8 grid-cols-3 rounded-xl border border-border bg-secondary/30 p-0.5">
          {UTM_TABS.map((t) => {
            const active = tab === t.value;
            return (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={`relative z-10 rounded-lg px-3 text-xs font-medium transition-colors ${
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="utm-breakdown-pill"
                    transition={spring}
                    className="absolute inset-0 -z-10 rounded-lg bg-background shadow-sm"
                  />
                )}
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      {items.length > 0 ? (
        <div className="overflow-y-auto max-h-[380px] space-y-2.5 pr-1">
          {items.map((item, index) => (
            <div key={item.label}>
              <div className="flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="shrink-0 font-semibold text-muted-foreground">#{index + 1}</span>
                  <span className="truncate font-medium">{item.label}</span>
                </div>
                <span className="shrink-0 font-mono font-semibold">{formatNumber(item.count)}건</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-secondary overflow-hidden">
                <div className="h-full rounded-full bg-violet-500/70 transition-all duration-300" style={{ width: `${Math.min(item.percent, 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          선택한 기간에 UTM 유입 데이터가 아직 없습니다.
        </p>
      )}
    </section>
  );
}

function Heatmap({ heatmap }: { heatmap: RealtimeReportData["heatmap"] }) {
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const gridClass = "grid grid-cols-[24px_repeat(24,minmax(20px,1fr))] gap-1 items-center";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-secondary/20 px-3 py-2">
          <p className="text-xs text-muted-foreground">가장 강한 요일</p>
          <p className="mt-1 text-sm font-medium">{heatmap.peakDay.label}요일 · {formatNumber(heatmap.peakDay.count)}건</p>
        </div>
        <div className="rounded-2xl border border-border bg-secondary/20 px-3 py-2">
          <p className="text-xs text-muted-foreground">가장 강한 시간</p>
          <p className="mt-1 text-sm font-medium">{String(heatmap.peakHour.hour).padStart(2, "0")}시 · {formatNumber(heatmap.peakHour.count)}건</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[660px] space-y-1">
          <div className={gridClass}>
            <span className="text-[10px] text-muted-foreground" aria-hidden="true" />
            {hours.map((hour) => (
              <span
                key={hour}
                className="text-center font-mono text-[9px] leading-none text-muted-foreground"
                title={`${hour}시`}
              >
                {String(hour).padStart(2, "0")}
              </span>
            ))}
          </div>
          {heatmap.matrix.map((row, dayIndex) => (
            <div key={heatmap.dayLabels[dayIndex]} className={gridClass}>
              <span className="text-[10px] text-muted-foreground">{heatmap.dayLabels[dayIndex]}</span>
              {row.map((count, hour) => {
                const opacity = heatmap.max > 0 ? Math.max(0.08, count / heatmap.max) : 0.04;
                return (
                  <span
                    key={`${dayIndex}-${hour}`}
                    title={`${heatmap.dayLabels[dayIndex]} ${hour}시 · ${count}건`}
                    className="h-4 rounded-[4px] bg-violet-500"
                    style={{ opacity }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {heatmap.topSlots.filter((slot) => slot.count > 0).map((slot) => (
          <span key={`${slot.day}-${slot.hour}`} className="rounded-full bg-secondary px-2 py-1 text-xs text-muted-foreground">
            {slot.day} {String(slot.hour).padStart(2, "0")}시 · {formatNumber(slot.count)}건
          </span>
        ))}
      </div>
    </div>
  );
}

export default function RealtimeReport({ data, loading, rangeLabel }: Props) {
  if (loading && !data) {
    return (
      <section className="rounded-[28px] border border-border bg-secondary/10 p-6">
        <div className="h-5 w-36 rounded-full bg-secondary animate-pulse" />
        <div className="mt-4 h-16 rounded-2xl bg-secondary animate-pulse" />
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="h-28 rounded-2xl bg-secondary animate-pulse" />
          <div className="h-28 rounded-2xl bg-secondary animate-pulse" />
          <div className="h-28 rounded-2xl bg-secondary animate-pulse" />
        </div>
      </section>
    );
  }

  if (!data) return null;

  const now = new Date();
  const todayKey = getKstDateKey(now);
  const yesterdayKey = getKstDateKey(new Date(now.getTime() - 86_400_000));
  const anomaly = data.anomaly;
  const anomalyBadge = anomaly
    ? {
        label: `평소 대비 ${anomaly.deviation > 0 ? "+" : ""}${anomaly.deviation}% ${anomaly.severity === "low" ? "낮음" : "높음"}`,
        tone: (anomaly.severity === "low" ? "danger" : "good") as "danger" | "good",
      }
    : undefined;
  const yesterdayBadge = anomaly && anomaly.date === yesterdayKey ? anomalyBadge : undefined;
  const todayBadge = anomaly && anomaly.date === todayKey ? anomalyBadge : undefined;

  return (
    <section className="space-y-4">
      <div className="rounded-[28px] border border-border bg-secondary/10 p-5 md:p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">오늘의 사전등록 흐름</h2>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>{rangeLabel}</p>
            <p className="mt-1">업데이트 {formatKstDateTime(data.generatedAt)}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <MetricCard icon={CalendarDays} label="어제 등록 수" value={`${formatNumber(data.performance.yesterdayCount)}건`} helper="KST 기준 전일 00:00-24:00" badge={yesterdayBadge} />
          <MetricCard icon={Activity} label="당일 실시간 등록 수" value={`${formatNumber(data.performance.todayCount)}건`} helper="오늘 00:00부터 현재까지" badge={todayBadge} />
          <MetricCard icon={TrendingUp} label="누적 등록 수" value={`${formatNumber(data.performance.cumulativeCount)}건`} helper="프로젝트 전체 누적" />
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm">
          <Clock3 className="w-4 h-4 text-violet-500" />
          <span className="text-muted-foreground">선택 기간 등록</span>
          <span className="font-semibold">{formatNumber(data.performance.rangeCount)}건</span>
          <ChangeBadge rangeChange={data.performance.rangeChange} />
        </div>

        {data.dedup.totalRecordsWithEmail > 0 && (
          <div className="mt-4">
            <DedupCard dedup={data.dedup} />
          </div>
        )}

        <div className="mt-4">
          <CumulativeLineChart points={data.cumulativeTrend} />
        </div>
        <div className="mt-4">
          <DailyBarChart points={data.cumulativeTrend} />
        </div>
        {data.dailyUtmTrend && (
          <div className="mt-4">
            <UtmTrendChart trend={data.dailyUtmTrend} />
          </div>
        )}
        <div className="mt-4">
          <section className="rounded-2xl border border-border bg-background p-4">
            <div className="flex items-center gap-2 mb-4">
              <Clock3 className="w-4 h-4 text-violet-500" />
              <h3 className="text-sm font-semibold">요일/시간별 등록 성과</h3>
            </div>
            <Heatmap heatmap={data.heatmap} />
          </section>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[24px] border border-border bg-background p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-violet-500" />
            <h3 className="text-sm font-semibold">주요 관람객 구성</h3>
          </div>
          {data.composition.length > 0 ? (
            <div className="grid gap-5 md:grid-cols-2">
              {data.composition.map((section) => <CompositionSection key={section.key} section={section} />)}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              관람객 구성으로 읽을 수 있는 항목이 아직 부족해요. 등록폼의 산업, 직책, 관심 분야 항목이 쌓이면 자동으로 표시됩니다.
            </p>
          )}
        </section>

        <UtmBreakdownSection data={data} />
      </div>

      <EmailDomainSection items={data.emailDomainTop} total={data.emailDomainTotal} />
    </section>
  );
}
