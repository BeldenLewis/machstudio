"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Download, Loader2, RefreshCw, BarChart3, MessageSquare, HelpCircle, Users } from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Area,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { InlineError } from "@/components/ui/inline-error";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

interface Funnel {
  visits: number;
  registered: number;
  attended: number;
  stay30: number;
  stay60: number;
  avgStayMinutes: number;
  maxStayMinutes: number;
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

interface CampaignRow {
  campaign: string;
  registered: number;
  entered: number;
  attendRate: number;
  cost: number | null;
  cpr: number | null;
  cpa: number | null;
}

interface PollArchive {
  id: string;
  question: string;
  isActive: boolean;
  totalVotes: number;
  options: { label: string; voteCount: number }[];
}

interface Interactions {
  polls: PollArchive[];
  qa: {
    total: number;
    answered: number;
    pending: number;
    dismissed: number;
    answerRate: number;
    top: { question: string; voteCount: number; status: string; name: string | null }[];
  };
  chat: { messages: number; participants: number };
  cta: { clicks: number; clickers: number };
  reminders: number;
}

interface TopEngaged {
  name: string;
  company: string | null;
  score: number;
  segment: "hot" | "warm" | "cold";
  watchMinutes: number;
  chat: number;
  pollVotes: number;
  qaAsks: number;
  qaUpvotes: number;
  ctaClicks: number;
  agreeMarketing: boolean;
}

interface Scoring {
  total: number;
  liveMinutes: number;
  distribution: { hot: number; warm: number; cold: number; noShow: number };
  top: TopEngaged[];
}

interface AnalyticsData {
  funnel: Funnel;
  utmBreakdown: UtmRow[];
  campaignBreakdown: CampaignRow[];
  registrationTrend: { date: string; count: number }[];
  interactions: Interactions;
  scoring: Scoring;
  hasVisitData: boolean;
}

interface CurvePoint { label: string; viewers: number; entered: number; chat: number }
interface CurveData {
  points: CurvePoint[];
  peak: number;
  avg: number;
  bucketMinutes?: number;
  fromMs?: number;
  bucketMs?: number;
  hasData: boolean;
}

interface ActivityItem { id: string; action: string; label: string; at: string; actor: string | null }

type Range = "all" | "60m" | "30m";

const n = (v: number) => v.toLocaleString();
const won = (v: number) => "₩" + v.toLocaleString();
const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);

const SOURCE_LABEL: Record<string, string> = { "(direct)": "직접 유입", "(none)": "—" };
const RANGES: { k: Range; label: string }[] = [
  { k: "all", label: "전체" },
  { k: "60m", label: "60분" },
  { k: "30m", label: "30분" },
];

/* 운영 이벤트 마커로 삼을 활동 — 발행/송출 계열만 */
const EVENT_RE = /(poll|announcement|popup|tally_push)_(created|updated)/;

/* ── 차트 색상: 테마 토큰(--chart-*)을 런타임 해석해 recharts SVG에 전달 (라이트/다크 대응) ── */
function useChartColors() {
  const [c, setC] = useState({
    viewers: "#5b6b9a",
    entered: "#4f9d6b",
    chat: "#9aa4c0",
    grid: "rgba(120,120,140,0.15)",
    axis: "#8b8b96",
  });
  useEffect(() => {
    const read = () => {
      const s = getComputedStyle(document.body);
      const g = (name: string, fb: string) => s.getPropertyValue(name).trim() || fb;
      setC({
        viewers: g("--chart-viewers", "#5b6b9a"),
        entered: g("--chart-entered", "#4f9d6b"),
        chat: g("--chart-chat", "#9aa4c0"),
        grid: g("--border", "rgba(120,120,140,0.15)"),
        axis: g("--muted-foreground", "#8b8b96"),
      });
    };
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return c;
}

/* ── 테마 대응 커스텀 툴팁 ── */
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name?: string; value?: number; color?: string; dataKey?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-card">
      <p className="mb-1 font-semibold text-popover-foreground tabular-nums">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-1.5 text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name} <b className="ml-auto pl-3 tabular-nums text-foreground">{n(Number(p.value ?? 0))}</b>
        </p>
      ))}
    </div>
  );
}

/* ── 카드 셸 (콘솔과 동일 마감) ── */
function SectionCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={`rounded-2xl border border-border bg-card shadow-card p-5 ${className}`}
    >
      {children}
    </motion.section>
  );
}

/* ── 요약 KPI 카드 ── */
function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "green" }) {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-card p-4">
      <p className="text-[11.5px] font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums tracking-[-0.02em] ${tone === "green" ? "text-green-600 dark:text-green-400" : ""}`}>{value}</p>
      {sub && <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">{sub}</p>}
    </div>
  );
}

/* ── 퍼널 단계 막대 ── */
function FunnelStep({ label, value, base, color, delay = 0 }: { label: string; value: number; base: number; color: string; delay?: number }) {
  const width = base ? Math.max(3, Math.round((value / base) * 100)) : 0;
  const rate = pct(value, base);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{n(value)}명 · {rate}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${width}%` }}
          transition={{ duration: 0.5, ease: "easeOut", delay }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  );
}

const QA_STATUS: Record<string, { label: string; cls: string }> = {
  answered: { label: "답변", cls: "bg-green-500/10 text-green-600 dark:text-green-400" },
  pending: { label: "대기", cls: "bg-secondary text-muted-foreground" },
  dismissed: { label: "숨김", cls: "bg-secondary text-muted-foreground" },
};

const SEG_BAR: { key: "hot" | "warm" | "cold" | "noShow"; label: string; color: string }[] = [
  { key: "hot", label: "핫", color: "var(--chart-entered)" },
  { key: "warm", label: "웜", color: "#f59e0b" },
  { key: "cold", label: "콜드", color: "var(--chart-chat)" },
  { key: "noShow", label: "노쇼", color: "color-mix(in srgb, var(--muted-foreground) 35%, transparent)" },
];
const SEG_BADGE: Record<"hot" | "warm" | "cold", string> = {
  hot: "bg-green-500/10 text-green-600 dark:text-green-400",
  warm: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  cold: "bg-secondary text-muted-foreground",
};

export default function AnalyticsTab({ webinarId }: { webinarId: string }) {
  const colors = useChartColors();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [curve, setCurve] = useState<CurveData | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [range, setRange] = useState<Range>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [curveLoading, setCurveLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const fetchCore = useCallback(async (quiet = false) => {
    if (quiet) setIsRefreshing(true);
    else setIsLoading(true);
    setLoadError(false);
    try {
      const [aRes, actRes] = await Promise.all([
        fetch(`/api/webinars/${webinarId}/analytics`),
        fetch(`/api/webinars/${webinarId}/activity`),
      ]);
      if (!aRes.ok) throw new Error("analytics load failed");
      setData(await aRes.json());
      setActivity(actRes.ok ? (await actRes.json()).items ?? [] : []);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [webinarId]);

  const fetchCurve = useCallback(async (r: Range) => {
    setCurveLoading(true);
    try {
      const res = await fetch(`/api/webinars/${webinarId}/analytics/attendance-curve?range=${r}`);
      if (res.ok) setCurve(await res.json());
    } finally {
      setCurveLoading(false);
    }
  }, [webinarId]);

  useEffect(() => { void fetchCore(); }, [fetchCore]);
  useEffect(() => { void fetchCurve(range); }, [range, fetchCurve]);

  const refreshAll = () => { void fetchCore(true); void fetchCurve(range); };
  const exportCsv = () => { window.open(`/api/webinars/${webinarId}/registrations/export`, "_blank"); };

  // 운영 이벤트를 시청 곡선의 버킷에 스냅 (fromMs + i*bucketMs)
  const events = useMemo(() => {
    const pts = curve?.points ?? [];
    if (!pts.length || !curve?.fromMs || !curve?.bucketMs) return [] as { label: string; text: string }[];
    const seen = new Set<string>();
    const out: { label: string; text: string }[] = [];
    for (const a of activity) {
      if (!EVENT_RE.test(a.action)) continue;
      const idx = Math.round((new Date(a.at).getTime() - curve.fromMs) / curve.bucketMs);
      if (idx < 0 || idx >= pts.length) continue;
      const label = pts[idx].label;
      const key = `${label}|${a.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ label, text: a.label });
      if (out.length >= 12) break;
    }
    return out;
  }, [activity, curve]);
  const eventLabels = useMemo(() => Array.from(new Set(events.map((e) => e.label))), [events]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <InlineError message="분석을 불러오지 못했어요" onRetry={() => void fetchCore()} />
      </div>
    );
  }

  const { funnel, interactions, scoring } = data;
  const utm = data.utmBreakdown ?? [];
  const campaigns = data.campaignBreakdown ?? [];
  const trend = data.registrationTrend ?? [];
  const hasVisits = data.hasVisitData;
  const funnelBase = hasVisits ? funnel.visits : funnel.registered;
  const peak = curve?.peak ?? 0;
  const avgConc = curve?.avg ?? 0;
  const chatParticipation = pct(interactions.chat.participants, funnel.attended);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* 헤더 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">분석</h2>
          <p className="mt-1 text-sm text-muted-foreground">방송이 만든 참여와 성과를 한눈에 — 유입부터 시청·인터랙션까지.</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }} transition={spring} onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs transition-colors hover:bg-secondary">
            <Download className="h-3.5 w-3.5" /> 등록자 명단 내보내기
          </motion.button>
          <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }} transition={spring} onClick={refreshAll} disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs transition-colors hover:bg-secondary disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} /> 새로고침
          </motion.button>
        </div>
      </div>

      {/* 요약 KPI — 방송 성적 한 줄 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="총 등록" value={n(funnel.registered)} sub={hasVisits ? `방문 ${n(funnel.visits)} · 등록률 ${funnel.regRate}%` : "사전 등록"} />
        <Stat label="실제 입장" value={n(funnel.attended)} sub={`입장률 ${funnel.attendRate}%`} />
        <Stat label="피크 동시 시청" value={n(peak)} sub={`평균 ${n(avgConc)}명`} />
        <Stat label="평균 시청" value={`${n(funnel.avgStayMinutes)}분`} sub={`최대 ${n(funnel.maxStayMinutes)}분`} />
        <Stat label="30분+ 체류" value={n(funnel.stay30)} sub={`입장 대비 ${funnel.stay30Rate}%`} tone="green" />
        <Stat label="Q&A" value={n(interactions.qa.total)} sub={`답변율 ${interactions.qa.answerRate}%`} />
        <Stat label="채팅" value={n(interactions.chat.messages)} sub={`참여자 ${n(interactions.chat.participants)}명`} />
        <Stat label="리마인더 옵트인" value={n(interactions.reminders)} sub="알림 받고 이어보기" />
      </div>

      {/* 통합 타임라인 — 시청·입장·채팅 + 운영 이벤트 */}
      <SectionCard>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold"><BarChart3 className="h-4 w-4 text-violet-500" /> 시청·참여 타임라인</h3>
            <p className="mt-1 text-xs text-muted-foreground">분당 동시 시청자와 누적 입장·채팅량을, 운영 이벤트(세로 점선)와 함께 봅니다.</p>
          </div>
          <div className="inline-flex rounded-lg border border-border bg-secondary p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.k}
                onClick={() => setRange(r.k)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${range === r.k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* 범례 */}
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: "var(--chart-viewers)" }} /> 동시 시청</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-full" style={{ background: "var(--chart-entered)" }} /> 누적 입장</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2 rounded-sm" style={{ background: "var(--chart-chat)" }} /> 채팅(우축)</span>
        </div>

        {!curve || !curve.hasData ? (
          <p className="py-10 text-center text-xs text-muted-foreground">
            {curveLoading ? "불러오는 중…" : "아직 시청 기록이 없어요. 라이브가 진행되면 시간대별 곡선이 그려져요."}
          </p>
        ) : (
          <>
            <div className="h-64" style={{ opacity: curveLoading ? 0.5 : 1, transition: "opacity .2s" }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={curve.points} margin={{ top: 6, right: 4, bottom: 0, left: -16 }}>
                  <defs>
                    <linearGradient id="viewersFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={colors.viewers} stopOpacity={0.24} />
                      <stop offset="95%" stopColor={colors.viewers} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: colors.axis }} tickLine={false} axisLine={{ stroke: colors.grid }} minTickGap={26} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10, fill: colors.axis }} tickLine={false} axisLine={false} width={34} allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: colors.axis }} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: colors.axis, strokeOpacity: 0.25 }} />
                  {eventLabels.map((l) => (
                    <ReferenceLine key={l} yAxisId="left" x={l} stroke={colors.axis} strokeOpacity={0.45} strokeDasharray="2 3" />
                  ))}
                  <Bar yAxisId="right" dataKey="chat" name="채팅" fill={colors.chat} fillOpacity={0.45} barSize={9} radius={[2, 2, 0, 0]} />
                  <Area yAxisId="left" type="monotone" dataKey="viewers" name="동시 시청" stroke={colors.viewers} strokeWidth={2} fill="url(#viewersFill)" />
                  <Line yAxisId="left" type="monotone" dataKey="entered" name="누적 입장" stroke={colors.entered} strokeWidth={2} strokeDasharray="5 3" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            {events.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
                {events.map((e, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-[10.5px] text-muted-foreground">
                    <span className="font-medium tabular-nums text-foreground/70">{e.label}</span> {e.text}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </SectionCard>

      {/* 참여 성적표 — 투표 / Q&A 아카이브 */}
      <SectionCard>
        <div className="mb-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><MessageSquare className="h-4 w-4 text-violet-500" /> 참여 성적표</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            라이브 중 띄운 투표 결과와 Q&A 반응 · 채팅 참여율 {chatParticipation}% (입장 {n(funnel.attended)}명 중 {n(interactions.chat.participants)}명 발언) · CTA 클릭 {n(interactions.cta.clicks)}건 (클릭자 {n(interactions.cta.clickers)}명)
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {/* 투표 결과 */}
          <div>
            <p className="mb-2.5 text-xs font-semibold text-muted-foreground">투표 결과 <span className="tabular-nums">({interactions.polls.length})</span></p>
            {interactions.polls.length === 0 ? (
              <p className="text-xs text-muted-foreground">진행한 투표가 없어요.</p>
            ) : (
              <div className="space-y-3">
                {interactions.polls.map((poll) => {
                  const max = Math.max(...poll.options.map((o) => o.voteCount), 0);
                  return (
                    <div key={poll.id} className="rounded-xl border border-border p-3">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <p className="text-xs font-medium leading-snug">
                          {poll.isActive && <span className="mr-1.5 rounded-full bg-green-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-green-600 dark:text-green-400">ON</span>}
                          {poll.question}
                        </p>
                        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{n(poll.totalVotes)}표</span>
                      </div>
                      <div className="space-y-1.5">
                        {poll.options.map((o, oi) => {
                          const p = pct(o.voteCount, poll.totalVotes);
                          const win = o.voteCount === max && max > 0;
                          return (
                            <div key={oi} className="relative overflow-hidden rounded-lg border border-border/60 px-2.5 py-1.5 text-[11px]">
                              <div className="absolute inset-y-0 left-0" style={{ width: `${p}%`, background: win ? "var(--chart-viewers)" : "var(--chart-chat)", opacity: win ? 0.18 : 0.12 }} />
                              <div className="relative flex items-center justify-between gap-2">
                                <span className="truncate">{o.label}</span>
                                <span className="shrink-0 tabular-nums text-muted-foreground">{n(o.voteCount)} · {p}%</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Q&A */}
          <div>
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-muted-foreground">Q&A</p>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                <HelpCircle className="mr-1 inline h-3 w-3" />{n(interactions.qa.total)}건 · 답변율 {interactions.qa.answerRate}%
              </p>
            </div>
            {interactions.qa.top.length === 0 ? (
              <p className="text-xs text-muted-foreground">등록된 질문이 없어요.</p>
            ) : (
              <div className="space-y-2">
                {interactions.qa.top.map((q, i) => {
                  const st = QA_STATUS[q.status] ?? QA_STATUS.pending;
                  return (
                    <div key={i} className="flex items-start gap-2.5 rounded-xl border border-border p-2.5">
                      <span className="mt-0.5 flex h-6 min-w-8 items-center justify-center rounded-md bg-secondary px-1.5 text-[11px] font-semibold tabular-nums">▲{q.voteCount}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs leading-snug">{q.question}</p>
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${st.cls}`}>{st.label}</span>
                          {q.name && <span className="truncate text-[10px] text-muted-foreground">{q.name}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {/* 리드 스코어링 */}
      <SectionCard>
        <div className="mb-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Users className="h-4 w-4 text-violet-500" /> 리드 스코어링</h3>
          <p className="mt-1 text-xs text-muted-foreground">참석·체류·인터랙션·마케팅 동의를 합성한 0~100 참여 점수 · 내보내기 CSV에 점수·세그먼트가 포함돼요.</p>
        </div>
        <div className="mb-5">
          <div className="mb-2 flex h-2.5 overflow-hidden rounded-full bg-secondary">
            {SEG_BAR.map((s) => {
              const c = scoring.distribution[s.key];
              return c > 0 ? <div key={s.key} style={{ width: `${pct(c, scoring.total)}%`, background: s.color }} /> : null;
            })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            {SEG_BAR.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.label} <b className="tabular-nums text-foreground">{n(scoring.distribution[s.key])}</b> · {pct(scoring.distribution[s.key], scoring.total)}%
              </span>
            ))}
          </div>
        </div>
        {scoring.top.length === 0 ? (
          <p className="text-xs text-muted-foreground">입장한 참여자가 없어 점수를 매길 대상이 없어요.</p>
        ) : (
          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">상위 참여자</p>
            <div className="space-y-1.5">
              {scoring.top.map((t, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-border p-2.5">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold tabular-nums ${SEG_BADGE[t.segment]}`}>{t.score}</span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-xs font-medium">
                      <span className="truncate">{t.name}</span>
                      {t.company && <span className="truncate text-muted-foreground">· {t.company}</span>}
                      {t.agreeMarketing && <span className="shrink-0 rounded-full bg-green-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-green-600 dark:text-green-400">동의</span>}
                    </p>
                    <p className="mt-0.5 text-[10.5px] text-muted-foreground tabular-nums">
                      체류 {n(t.watchMinutes)}분 · 채팅 {n(t.chat)} · 투표 {n(t.pollVotes)} · Q&A {n(t.qaAsks)}{t.qaUpvotes ? ` · 추천 ${n(t.qaUpvotes)}` : ""}{t.ctaClicks ? ` · CTA ${n(t.ctaClicks)}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      {/* 참가 퍼널 */}
      <SectionCard>
        <div className="mb-4">
          <h3 className="text-sm font-semibold">참가 퍼널</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {hasVisits ? "방문 → 등록 → 입장 → 체류 단계별 전환" : "등록 → 입장 → 체류 (방문 데이터는 아임웹 부착 후 집계돼요)"}
          </p>
        </div>
        <div className="space-y-3.5">
          {hasVisits && <FunnelStep label="페이지 방문" value={funnel.visits} base={funnelBase} color="var(--chart-chat)" delay={0} />}
          <FunnelStep label="사전 등록" value={funnel.registered} base={funnelBase} color="var(--chart-viewers)" delay={0.06} />
          <FunnelStep label="실제 입장" value={funnel.attended} base={funnelBase} color="var(--chart-viewers)" delay={0.12} />
          <FunnelStep label="30분 이상 체류" value={funnel.stay30} base={funnelBase} color="var(--chart-entered)" delay={0.18} />
          <FunnelStep label="60분 이상 체류" value={funnel.stay60} base={funnelBase} color="var(--chart-entered)" delay={0.24} />
        </div>
      </SectionCard>

      {/* 일자별 등록 추이 */}
      {trend.length > 0 && (
        <SectionCard>
          <h3 className="text-sm font-semibold">일자별 등록 추이</h3>
          <div className="mt-4 h-28">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: colors.axis }} tickLine={false} axisLine={{ stroke: colors.grid }} tickFormatter={(d: string) => d.slice(5)} minTickGap={16} />
                <YAxis tick={{ fontSize: 10, fill: colors.axis }} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: colors.grid, fillOpacity: 0.4 }} />
                <Bar dataKey="count" name="등록" fill={colors.viewers} radius={[3, 3, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      )}

      {/* 유입 채널별 성과 */}
      <SectionCard>
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
                  <motion.tr key={`${row.source}:${row.medium}:${i}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15, delay: Math.min(i * 0.03, 0.3) }} className="border-b border-border/40 last:border-0">
                    <td className="py-2 pr-3 font-medium">{SOURCE_LABEL[row.source] ?? row.source}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{SOURCE_LABEL[row.medium] ?? row.medium}</td>
                    {hasVisits && <td className="py-2 pr-3 text-right tabular-nums">{n(row.visits)}</td>}
                    <td className="py-2 pr-3 text-right tabular-nums">{n(row.registered)}</td>
                    {hasVisits && <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{row.regRate}%</td>}
                    <td className="py-2 pr-3 text-right tabular-nums">{n(row.entered)}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">{row.entryRate}%</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* 캠페인별 성과 · 광고비 */}
      <SectionCard>
        <h3 className="text-sm font-semibold">캠페인별 성과 · 광고비</h3>
        <p className="mt-1 text-xs text-muted-foreground">등록을 캠페인으로 나누고, 광고 성과에 같은 캠페인명이 있으면 광고비를 붙여 등록당·참석당 비용을 냅니다. (캠페인명 정확 일치 · 광고비는 해당 캠페인 전체 누적)</p>
        {campaigns.length === 0 ? (
          <p className="mt-4 text-xs text-muted-foreground">캠페인(utm_campaign) 태그가 붙은 등록이 아직 없어요.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">캠페인</th>
                  <th className="py-2 pr-3 text-right font-medium">등록</th>
                  <th className="py-2 pr-3 text-right font-medium">입장</th>
                  <th className="py-2 pr-3 text-right font-medium">입장률</th>
                  <th className="py-2 pr-3 text-right font-medium">광고비</th>
                  <th className="py-2 pr-3 text-right font-medium">등록당</th>
                  <th className="py-2 text-right font-medium">참석당</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c, i) => (
                  <motion.tr key={`${c.campaign}:${i}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15, delay: Math.min(i * 0.03, 0.3) }} className="border-b border-border/40 last:border-0">
                    <td className="py-2 pr-3 font-medium">{c.campaign}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{n(c.registered)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{n(c.entered)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{c.attendRate}%</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{c.cost != null ? won(c.cost) : <span className="text-muted-foreground/40">—</span>}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{c.cpr != null ? won(c.cpr) : <span className="text-muted-foreground/40">—</span>}</td>
                    <td className="py-2 text-right tabular-nums">{c.cpa != null ? won(c.cpa) : <span className="text-muted-foreground/40">—</span>}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
