"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Download, Loader2, RefreshCw } from "lucide-react";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

interface Funnel {
  visits: number;
  registered: number;
  attended: number;
  stay30: number;
  stay60: number;
  attendRate: number;
  stay30Rate: number;
  stay60Rate: number;
  regRate: number;
}

interface UtmRow {
  source: string;
  medium: string;
  visits: number;
  registered: number;
  entered: number;
  regRate: number;
  entryRate: number;
}

interface AnalyticsData {
  funnel: Funnel;
  utmBreakdown: UtmRow[];
  registrationTrend: { date: string; count: number }[];
  hasVisitData: boolean;
}

interface CurvePoint { label: string; viewers: number }
interface CurveData { points: CurvePoint[]; peak: number; avg: number; bucketMinutes?: number; hasData: boolean }

function pct(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : 0;
}

/* ── 퍼널 단계 막대 ── */
function FunnelStep({ label, value, base, color }: { label: string; value: number; base: number; color: string }) {
  const width = base ? Math.max(3, Math.round((value / base) * 100)) : 0;
  const rate = pct(value, base);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{value.toLocaleString()}명 · {rate}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${width}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  );
}

/* ── 시청 곡선 인라인 SVG (경량 area chart) ── */
function AttendanceCurve({ data }: { data: CurveData }) {
  const W = 640;
  const H = 160;
  const padL = 28;
  const padB = 22;
  const padT = 10;
  const points = data.points;

  const path = useMemo(() => {
    if (points.length === 0) return { line: "", area: "" };
    const maxV = Math.max(data.peak, 1);
    const innerW = W - padL - 8;
    const innerH = H - padT - padB;
    const step = points.length > 1 ? innerW / (points.length - 1) : 0;
    const coords = points.map((p, i) => {
      const x = padL + i * step;
      const y = padT + innerH - (p.viewers / maxV) * innerH;
      return [x, y] as const;
    });
    const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},${(padT + innerH).toFixed(1)} L${padL},${(padT + innerH).toFixed(1)} Z`;
    return { line, area };
  }, [points, data.peak]);

  if (!data.hasData) {
    return <p className="py-8 text-center text-xs text-muted-foreground">아직 시청 기록이 없어요. 라이브가 진행되면 시간대별 동시 시청자 곡선이 그려져요.</p>;
  }

  const maxV = Math.max(data.peak, 1);
  const tickCount = Math.min(points.length, 6);
  const tickEvery = Math.max(1, Math.ceil(points.length / tickCount));

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs">
        <span className="text-muted-foreground">피크 동시 시청 <b className="text-foreground tabular-nums">{data.peak.toLocaleString()}명</b></span>
        <span className="text-muted-foreground">평균 <b className="text-foreground tabular-nums">{data.avg.toLocaleString()}명</b></span>
        {data.bucketMinutes && <span className="text-muted-foreground">{data.bucketMinutes}분 간격</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="시간대별 동시 시청자 곡선">
        {[0, 0.5, 1].map((f) => {
          const y = padT + (H - padT - padB) * (1 - f);
          return (
            <g key={f}>
              <line x1={padL} y1={y} x2={W - 8} y2={y} stroke="currentColor" strokeOpacity={0.08} />
              <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="9" fill="currentColor" fillOpacity={0.4}>
                {Math.round(maxV * f)}
              </text>
            </g>
          );
        })}
        <path d={path.area} fill="#8b5cf6" fillOpacity={0.12} />
        <path d={path.line} fill="none" stroke="#8b5cf6" strokeWidth={2} strokeLinejoin="round" />
        {points.map((p, i) =>
          i % tickEvery === 0 ? (
            <text
              key={i}
              x={padL + (points.length > 1 ? ((W - padL - 8) / (points.length - 1)) * i : 0)}
              y={H - 6}
              textAnchor="middle"
              fontSize="9"
              fill="currentColor"
              fillOpacity={0.4}
            >
              {p.label}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

const SOURCE_LABEL: Record<string, string> = { "(direct)": "직접 유입", "(none)": "—" };

export default function AnalyticsTab({ webinarId }: { webinarId: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [curve, setCurve] = useState<CurveData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchAll = useCallback(async (quiet = false) => {
    if (quiet) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const [analyticsRes, curveRes] = await Promise.all([
        fetch(`/api/webinars/${webinarId}/analytics`),
        fetch(`/api/webinars/${webinarId}/analytics/attendance-curve`),
      ]);
      if (analyticsRes.ok) setData(await analyticsRes.json());
      if (curveRes.ok) setCurve(await curveRes.json());
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [webinarId]);

  useEffect(() => { void Promise.resolve().then(() => fetchAll()); }, [fetchAll]);

  const exportCsv = () => {
    window.open(`/api/webinars/${webinarId}/registrations/export`, "_blank");
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const funnel = data?.funnel;
  const utm = data?.utmBreakdown ?? [];
  const trend = data?.registrationTrend ?? [];
  const hasVisits = data?.hasVisitData ?? false;
  const funnelBase = hasVisits ? (funnel?.visits ?? 0) : (funnel?.registered ?? 0);
  const maxTrend = Math.max(...trend.map((t) => t.count), 1);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">분석</h2>
          <p className="mt-1 text-sm text-muted-foreground">방문부터 등록·입장·체류까지, 유입 채널별로 나눠서 봅니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }} transition={spring} onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs transition-colors hover:bg-secondary">
            <Download className="h-3.5 w-3.5" /> CSV 내보내기
          </motion.button>
          <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }} transition={spring} onClick={() => fetchAll(true)} disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs transition-colors hover:bg-secondary disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} /> 새로고침
          </motion.button>
        </div>
      </div>

      {/* 퍼널 */}
      {funnel && (
        <section className="rounded-2xl border border-border bg-background p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">참가 퍼널</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {hasVisits ? "방문 → 등록 → 입장 → 체류 단계별 전환" : "등록 → 입장 → 체류 (방문 데이터는 아임웹 부착 후 집계돼요)"}
              </p>
            </div>
          </div>
          <div className="space-y-3.5">
            {hasVisits && <FunnelStep label="페이지 방문" value={funnel.visits} base={funnelBase} color="#8b5cf6" />}
            <FunnelStep label="사전 등록" value={funnel.registered} base={funnelBase} color="#7c3aed" />
            <FunnelStep label="실제 입장" value={funnel.attended} base={funnelBase} color="#2563eb" />
            <FunnelStep label="30분 이상 체류" value={funnel.stay30} base={funnelBase} color="#16a34a" />
            <FunnelStep label="60분 이상 체류" value={funnel.stay60} base={funnelBase} color="#f97316" />
          </div>
        </section>
      )}

      {/* UTM 분해 */}
      <section className="rounded-2xl border border-border bg-background p-5">
        <h3 className="text-sm font-semibold">유입 채널별 성과</h3>
        <p className="mt-1 text-xs text-muted-foreground">등록 광고·캠페인이 어디서 성과를 냈는지 소스·매체로 나눠 봅니다.</p>
        {utm.length === 0 ? (
          <p className="mt-4 text-xs text-muted-foreground">아직 유입 데이터가 없어요.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">소스</th>
                  <th className="py-2 pr-3 font-medium">매체</th>
                  {hasVisits && <th className="py-2 pr-3 text-right font-medium">방문</th>}
                  <th className="py-2 pr-3 text-right font-medium">등록</th>
                  {hasVisits && <th className="py-2 pr-3 text-right font-medium">등록률</th>}
                  <th className="py-2 pr-3 text-right font-medium">입장</th>
                  <th className="py-2 text-right font-medium">입장률</th>
                </tr>
              </thead>
              <tbody>
                {utm.map((row, i) => (
                  <tr key={`${row.source}:${row.medium}:${i}`} className="border-b border-border/40 last:border-0">
                    <td className="py-2 pr-3 font-medium">{SOURCE_LABEL[row.source] ?? row.source}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{SOURCE_LABEL[row.medium] ?? row.medium}</td>
                    {hasVisits && <td className="py-2 pr-3 text-right tabular-nums">{row.visits.toLocaleString()}</td>}
                    <td className="py-2 pr-3 text-right tabular-nums">{row.registered.toLocaleString()}</td>
                    {hasVisits && <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{row.regRate}%</td>}
                    <td className="py-2 pr-3 text-right tabular-nums">{row.entered.toLocaleString()}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">{row.entryRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 시청 곡선 */}
      <section className="rounded-2xl border border-border bg-background p-5">
        <h3 className="text-sm font-semibold">시간대별 동시 시청자</h3>
        <p className="mt-1 mb-3 text-xs text-muted-foreground">라이브 중 몇 분 지점에 몇 명이 함께 보고 있었는지 (중복 제거).</p>
        {curve && <AttendanceCurve data={curve} />}
      </section>

      {/* 등록 추이 */}
      {trend.length > 0 && (
        <section className="rounded-2xl border border-border bg-background p-5">
          <h3 className="text-sm font-semibold">일자별 등록 추이</h3>
          <div className="mt-4 flex items-end gap-1 h-28">
            {trend.map((t) => (
              <div key={t.date} className="group flex flex-1 flex-col items-center gap-1" title={`${t.date}: ${t.count}명`}>
                <div className="w-full rounded-t bg-violet-500/60 transition-colors group-hover:bg-violet-500" style={{ height: `${Math.max(2, (t.count / maxTrend) * 100)}%` }} />
                <span className="text-[9px] text-muted-foreground">{t.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
