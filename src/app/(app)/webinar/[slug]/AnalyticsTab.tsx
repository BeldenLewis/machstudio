"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useChartColors } from "@/components/ui/use-chart-colors";
import { motion } from "framer-motion";
import { Download, Loader2, RefreshCw, BarChart3, MessageSquare, HelpCircle, Users, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useUndoableDelete } from "@/components/ui/use-undoable-delete";
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

/* 차트 색상은 공용 훅으로 옮겼다 — use-chart-colors.ts (같은 문제를 겪는 화면이 셋이다) */

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

/* ── 설문 결과 — 자체 설문(WebinarSurvey)의 문항별 집계. 설문이 없으면 섹션 자체를 숨긴다. ── */
interface SurveyQuestionResult {
  id: string;
  type: "rating" | "single" | "multiple" | "text" | "nps";
  title: string;
  count: number;
  avg?: number | null;
  nps?: number | null;
  dist?: Record<number, number>;
  options?: Record<string, number>;
  texts?: string[];
}
interface SurveyResultData {
  survey: { id: string; title: string };
  totalResponses: number;
  linkedResponses: number;
  bySource: Record<string, number>;
  results: SurveyQuestionResult[];
}
const SOURCE_LABELS: Record<string, string> = { ended: "종료 화면", live: "라이브 푸시", link: "링크" };

function ResultBar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="relative overflow-hidden rounded-lg border border-border/60 px-3 py-1.5">
      <span className="absolute inset-y-0 left-0 bg-violet-500/15 transition-all" style={{ width: `${pct}%` }} />
      <span className="relative flex items-center justify-between gap-2 text-xs">
        <span className="truncate">{label}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{count}표 · {pct}%</span>
      </span>
    </div>
  );
}

/* ── 설문 개별 응답 — 열었을 때만 로드(egress). 등록자 연결 응답은 이름·연락처 표시, CSV 내보내기 포함. ── */
interface SurveyResponseRow {
  id: string;
  submittedAt: string;
  source: string | null;
  answers: Record<string, number | string | string[]>;
  registrant: { id: string; name: string; email: string | null; phone: string | null; company: string | null } | null;
}
interface SurveyResponsesData {
  survey: { id: string; title: string };
  questions: { id: string; type: string; title: string; retired?: boolean }[];
  total: number;
  responses: SurveyResponseRow[];
}

// 보관된 문항(편집기에서 지웠지만 답변이 남아 있는 것)은 열 제목에 표시한다.
function questionLabel(q: { title: string; retired?: boolean }): string {
  const base = q.title || "(제목 없음)";
  return q.retired ? `${base} (보관)` : base;
}

function formatAnswer(type: string, v: number | string | string[] | undefined): string {
  if (v === undefined || v === null || v === "") return "";
  if (Array.isArray(v)) return v.join(", ");
  if (type === "rating") return `★${v}`;
  return String(v);
}

const fmtSubmittedAt = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

function SurveyResponsesPanel({ webinarId, surveyId }: { webinarId: string; surveyId: string }) {
  const [data, setData] = useState<SurveyResponsesData | null>(null);
  const [failed, setFailed] = useState(false);
  // 삭제 대기 중인 응답 — 낙관적으로 목록에서 감춘다(실행취소하면 되돌아온다)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const { remove: undoableRemove } = useUndoableDelete();

  /**
   * 응답 삭제. 테스트 응답·중복 제출·본인 삭제 요청(개인정보 파기)을 처리할 방법이 없었다.
   * 되돌릴 수 없는 동작이라 5초 실행취소 창을 둔다(세션·공지 삭제와 같은 방식) — 확인 모달을
   * 한 번 더 띄우는 것보다 낫다: 실수는 즉시 되돌릴 수 있고, 의도한 삭제는 클릭 한 번으로 끝난다.
   */
  const deleteResponse = (r: SurveyResponseRow) => {
    const who = r.registrant ? r.registrant.name : "익명";
    undoableRemove({
      key: r.id,
      message: `${who} 응답을 삭제했어요`,
      onOptimistic: () => setHiddenIds((prev) => new Set(prev).add(r.id)),
      onUndo: () => setHiddenIds((prev) => { const n2 = new Set(prev); n2.delete(r.id); return n2; }),
      commit: async () => {
        const res = await fetch(`/api/webinars/${webinarId}/surveys/${surveyId}/responses/${r.id}`, { method: "DELETE" });
        if (!res.ok) {
          // 실패하면 목록에 되돌려 놓는다 — 지워진 척 남아 있으면 다시 지울 수도 없다
          setHiddenIds((prev) => { const n2 = new Set(prev); n2.delete(r.id); return n2; });
          toast.error("응답 삭제에 실패했어요");
          return;
        }
        // 총 개수도 같이 줄인다(집계 카드는 다음 새로고침에 맞춰진다)
        setData((prev) => (prev ? { ...prev, total: Math.max(0, prev.total - 1), responses: prev.responses.filter((x) => x.id !== r.id) } : prev));
      },
    });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/webinars/${webinarId}/surveys/${surveyId}/responses`);
        if (cancelled) return;
        if (!res.ok) { setFailed(true); return; }
        setData(await res.json());
      } catch { if (!cancelled) setFailed(true); }
    })();
    return () => { cancelled = true; };
  }, [webinarId, surveyId]);

  const downloadCsv = useCallback(() => {
    if (!data) return;
    const esc = (v: unknown) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = ["제출시각", "이름", "이메일", "전화", "회사", "소스", ...data.questions.map(questionLabel)];
    const rows = data.responses.map((r) => [
      new Date(r.submittedAt).toLocaleString("ko-KR"),
      r.registrant?.name ?? "익명",
      r.registrant?.email ?? "",
      r.registrant?.phone ?? "",
      r.registrant?.company ?? "",
      SOURCE_LABELS[r.source ?? ""] ?? r.source ?? "",
      ...data.questions.map((q) => formatAnswer(q.type, r.answers[q.id])),
    ]);
    const csv = "﻿" + [headers, ...rows].map((row) => row.map(esc).join(",")).join("\r\n"); // BOM — 엑셀 한글
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `설문응답_${data.survey.title}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  if (failed) return <p className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">개별 응답을 불러오지 못했어요. 잠시 후 다시 열어주세요.</p>;
  if (!data) return <div className="mt-4 flex justify-center border-t border-border pt-6 pb-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>;

  // 삭제 대기 중인 응답은 목록·개수에서 즉시 빠진다
  const rows = data.responses.filter((r) => !hiddenIds.has(r.id));

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground tabular-nums">
          최근 {rows.length}건{data.total > rows.length && ` 표시 · 전체 ${n(Math.max(data.total - hiddenIds.size, rows.length))}건 (전체는 CSV 기준 최근 ${rows.length}건)`}
        </p>
        {rows.length > 0 && (
          <button type="button" onClick={downloadCsv} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
            <Download className="h-3.5 w-3.5" />CSV
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">아직 응답이 없어요.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="whitespace-nowrap py-2 pr-4 font-medium">응답자</th>
                <th className="whitespace-nowrap py-2 pr-4 font-medium">소스</th>
                <th className="whitespace-nowrap py-2 pr-4 font-medium">제출</th>
                {data.questions.map((q) => (
                  <th key={q.id} className="max-w-[200px] truncate py-2 pr-4 font-medium" title={questionLabel(q)}>{questionLabel(q)}</th>
                ))}
                <th className="w-8 py-2 font-medium"><span className="sr-only">삭제</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/50 align-top last:border-0">
                  <td className="whitespace-nowrap py-2 pr-4">
                    {r.registrant ? (
                      <>
                        <span className="font-medium">{r.registrant.name}</span>
                        {r.registrant.email && <span className="block text-[11px] text-muted-foreground">{r.registrant.email}</span>}
                      </>
                    ) : (
                      <span className="text-muted-foreground">익명</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-4 text-muted-foreground">{SOURCE_LABELS[r.source ?? ""] ?? r.source ?? "—"}</td>
                  <td className="whitespace-nowrap py-2 pr-4 tabular-nums text-muted-foreground">{fmtSubmittedAt(r.submittedAt)}</td>
                  {data.questions.map((q) => (
                    <td key={q.id} className="max-w-[240px] py-2 pr-4">
                      <span className="line-clamp-3 whitespace-pre-wrap break-words">{formatAnswer(q.type, r.answers[q.id])}</span>
                    </td>
                  ))}
                  <td className="py-2 align-middle">
                    <button
                      type="button"
                      onClick={() => deleteResponse(r)}
                      aria-label={`${r.registrant ? r.registrant.name : "익명"} 응답 삭제`}
                      title="응답 삭제 (5초 안에 실행취소 가능)"
                      className="rounded-lg p-1.5 text-muted-foreground/50 transition-colors hover:bg-red-500/10 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SurveyResultsSection({ webinarId }: { webinarId: string }) {
  const [data, setData] = useState<SurveyResultData[] | null>(null);
  const [openResponses, setOpenResponses] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/webinars/${webinarId}/surveys`);
        if (!res.ok) { if (!cancelled) setData([]); return; }
        const list = ((await res.json()).surveys ?? []) as { id: string }[];
        const all = await Promise.all(
          list.map(async (s) => {
            const r = await fetch(`/api/webinars/${webinarId}/surveys/${s.id}/results`);
            return r.ok ? ((await r.json()) as SurveyResultData) : null;
          }),
        );
        if (!cancelled) setData(all.filter((d): d is SurveyResultData => d !== null));
      } catch { if (!cancelled) setData([]); }
    })();
    return () => { cancelled = true; };
  }, [webinarId]);

  if (!data || data.length === 0) return null;

  return (
    <>
      {data.map((d) => (
        <SectionCard key={d.survey.id}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold"><BarChart3 className="h-4 w-4 text-violet-500" /> 설문 결과 — {d.survey.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                응답 {d.totalResponses}건 · 등록자 연결 {d.linkedResponses}건
                {Object.entries(d.bySource).length > 0 && (
                  <> · {Object.entries(d.bySource).map(([k, v]) => `${SOURCE_LABELS[k] ?? k} ${v}`).join(" / ")}</>
                )}
              </p>
            </div>
            {d.totalResponses > 0 && (
              <button
                type="button"
                onClick={() => setOpenResponses((prev) => ({ ...prev, [d.survey.id]: !prev[d.survey.id] }))}
                aria-expanded={!!openResponses[d.survey.id]}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${openResponses[d.survey.id] ? "border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400" : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
              >
                <Users className="h-3.5 w-3.5" />개별 응답 {openResponses[d.survey.id] ? "접기" : "보기"}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {d.results.map((q) => (
              <div key={q.id} className="min-w-0">
                <p className="mb-2 text-[13px] font-medium leading-snug">{q.title} <span className="text-[11px] text-muted-foreground tabular-nums">({q.count}명)</span></p>

                {q.type === "rating" && (
                  <div className="flex items-center gap-3">
                    <p className="text-2xl font-semibold tabular-nums">{q.avg != null ? q.avg.toFixed(1) : "-"}<span className="ml-0.5 text-sm text-amber-500">★</span></p>
                    <div className="flex-1 space-y-1">
                      {[5, 4, 3, 2, 1].map((n) => (
                        <ResultBar key={n} label={`${n}점`} count={q.dist?.[n] ?? 0} total={q.count} />
                      ))}
                    </div>
                  </div>
                )}

                {q.type === "nps" && (
                  <div className="flex items-center gap-3">
                    <div className="shrink-0 text-center">
                      <p className="text-2xl font-semibold tabular-nums">{q.nps ?? "-"}</p>
                      <p className="text-[10px] text-muted-foreground">NPS</p>
                    </div>
                    <div className="flex flex-1 items-end gap-0.5" aria-label="0~10 분포">
                      {Array.from({ length: 11 }, (_, n) => {
                        const c = q.dist?.[n] ?? 0;
                        const max = Math.max(1, ...Object.values(q.dist ?? {}));
                        return (
                          <div key={n} className="flex flex-1 flex-col items-center gap-0.5" title={`${n}점 · ${c}명`}>
                            <div className={`w-full rounded-sm ${n >= 9 ? "bg-green-500/70" : n <= 6 ? "bg-red-400/60" : "bg-secondary"}`} style={{ height: `${6 + (c / max) * 40}px` }} />
                            <span className="text-[9px] text-muted-foreground tabular-nums">{n}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {(q.type === "single" || q.type === "multiple") && (
                  <div className="space-y-1">
                    {Object.entries(q.options ?? {}).map(([opt, c]) => (
                      <ResultBar key={opt} label={opt} count={c} total={q.count} />
                    ))}
                  </div>
                )}

                {q.type === "text" && (
                  <div className="space-y-1.5">
                    {(q.texts ?? []).slice(0, 5).map((t, i) => (
                      <p key={i} className="rounded-lg bg-secondary/50 px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap">{t}</p>
                    ))}
                    {(q.texts?.length ?? 0) > 5 && <p className="text-[11px] text-muted-foreground">외 {(q.texts?.length ?? 0) - 5}건</p>}
                    {(q.texts?.length ?? 0) === 0 && <p className="text-xs text-muted-foreground">아직 답변이 없어요.</p>}
                  </div>
                )}
              </div>
            ))}
          </div>

          {openResponses[d.survey.id] && <SurveyResponsesPanel webinarId={webinarId} surveyId={d.survey.id} />}
        </SectionCard>
      ))}
    </>
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
  // 방문은 임베드 비콘으로만 집계돼 직접 링크 유입이 많으면 등록 > 방문이 될 수 있다.
  // 막대는 100% 로 잘라 넘치지 않게 하고, 비율은 초과 사실을 숨기지 않고 그대로 표기한다.
  const width = base ? Math.min(100, Math.max(3, Math.round((value / base) * 100))) : 0;
  const rate = pct(value, base);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {n(value)}명 · {rate}%
          {rate > 100 && <span className="ml-1 text-amber-600" title="방문은 임베드 위젯이 붙은 페이지에서만 집계돼요">*</span>}
        </span>
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
  // 전체 범위 곡선 — KPI 카드(피크·평균)는 타임라인 범위 토글과 무관하게 이 값을 쓴다.
  const [fullCurve, setFullCurve] = useState<CurveData | null>(null);
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
      if (!res.ok) return;
      const next: CurveData = await res.json();
      setCurve(next);
      // KPI(피크·평균)는 방송 전체 기준이어야 한다 — 타임라인 범위(30분/60분)를 좁히면
      // 그 구간의 피크가 카드에 찍혀 실제보다 작은 숫자가 보인다.
      if (r === "all") setFullCurve(next);
    } finally {
      setCurveLoading(false);
    }
  }, [webinarId]);

  useEffect(() => { void fetchCore(); }, [fetchCore]);
  useEffect(() => { void fetchCurve(range); }, [range, fetchCurve]);

  // 좁은 범위를 보고 있어도 KPI 는 전체 기준이라 'all' 곡선도 함께 갱신한다.
  const refreshAll = () => { void fetchCore(true); void fetchCurve(range); if (range !== "all") void fetchCurve("all"); };
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
  const peak = fullCurve?.peak ?? curve?.peak ?? 0;
  const avgConc = fullCurve?.avg ?? curve?.avg ?? 0;
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
            <div
              className="h-64"
              style={{ opacity: curveLoading ? 0.5 : 1, transition: "opacity .2s" }}
              role="img"
              aria-label={`시청 곡선 — 피크 ${n(peak)}명, 평균 ${n(avgConc)}명. 아래 표와 지표 카드에 같은 수치가 있어요.`}
            >
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

      {/* 설문 결과 — 자체 설문이 있을 때만 표시 */}
      <SurveyResultsSection webinarId={webinarId} />

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
