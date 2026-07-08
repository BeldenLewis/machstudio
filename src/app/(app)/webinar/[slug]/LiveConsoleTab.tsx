"use client";

// 운영 콘솔 — 라이브 당일의 단일 화면.
// 상태 수동 전환 / KPI / 공지·Q&A·팝업·Tally 발행 / 접속자.
// 폴링은 상태 적응형: 라이브 15초, 평시 90초 (+ 탭 숨김 가드) — egress 배려.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Bell,
  ChevronDown,
  ClipboardList,
  Eye,
  HelpCircle,
  ListChecks,
  Loader2,
  Megaphone,
  MessageSquarePlus,
  RefreshCw,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import QATab from "./QATab";
import AnnouncementsTab from "./AnnouncementsTab";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

type WebinarStatus = "upcoming" | "registration" | "live" | "ended";

interface DashboardSummary {
  totalRegistered: number;
  attended: number;
  activeViewers: number;
  presenceViewers: number;
  pendingQuestions: number;
  attendRate: number;
  avgStayMinutes: number;
}

interface CurrentViewer {
  id: string;
  name: string;
  company: string | null;
  enteredAt: string | null;
  currentStayMinutes: number;
  isLive: boolean;
}

interface DashboardData {
  status: WebinarStatus;
  isOverridden: boolean;
  summary: DashboardSummary;
  currentViewers: CurrentViewer[];
}

interface AdminPopup {
  id: string;
  type: string;
  title: string;
  message: string | null;
  buttonLabel: string | null;
  buttonUrl: string | null;
  integrationType: string;
  tallyFormId: string | null;
  isActive: boolean;
  createdAt: string;
}

interface AdminTallyPush {
  id: string;
  title: string;
  formId: string;
  memo: string | null;
  isActive: boolean;
  createdAt: string;
}

interface WebinarForConsole {
  config: Record<string, unknown>;
  sessions: { id: string }[];
  _count: { registrations: number };
}

const STATUS_META: Record<WebinarStatus, { label: string; tone: string }> = {
  upcoming: { label: "시작 대기", tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  registration: { label: "등록 중", tone: "bg-green-500/10 text-green-600 dark:text-green-400" },
  live: { label: "LIVE", tone: "bg-red-500/10 text-red-500" },
  ended: { label: "종료", tone: "bg-secondary text-muted-foreground" },
};

function Section({
  title,
  icon: Icon,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: typeof Bell;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-2xl border border-border bg-card">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 p-4 text-left sm:px-5">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4 text-violet-500" /> {title} {badge}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border p-4 sm:p-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-background px-3.5 py-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

/* ── 팝업 발행 패널 ── */
function PopupPanel({ webinarId }: { webinarId: string }) {
  const [popups, setPopups] = useState<AdminPopup[]>([]);
  const [form, setForm] = useState({ type: "notice", title: "", message: "", buttonLabel: "", buttonUrl: "", tallyFormId: "", useTally: false });
  const [busy, setBusy] = useState(false);

  const fetchPopups = useCallback(async () => {
    const res = await fetch(`/api/webinars/${webinarId}/popups`);
    if (res.ok) setPopups((await res.json()).popups ?? []);
  }, [webinarId]);
  useEffect(() => { void fetchPopups(); }, [fetchPopups]);

  const create = async () => {
    if (!form.title.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/webinars/${webinarId}/popups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          title: form.title,
          message: form.message,
          buttonLabel: form.buttonLabel,
          buttonUrl: form.useTally ? null : form.buttonUrl,
          integrationType: form.useTally ? "tally" : "link",
          tallyFormId: form.useTally ? form.tallyFormId : null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("팝업이 등록됐어요. 목록에서 ON으로 켜면 시청자에게 표시돼요.");
      setForm({ type: "notice", title: "", message: "", buttonLabel: "", buttonUrl: "", tallyFormId: "", useTally: false });
      void fetchPopups();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "팝업 등록에 실패했어요");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (popup: AdminPopup) => {
    const res = await fetch(`/api/webinars/${webinarId}/popups/${popup.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !popup.isActive }),
    });
    if (res.ok) {
      toast.success(popup.isActive ? "팝업을 껐어요" : "팝업이 시청자에게 표시돼요 (다른 팝업은 자동 OFF)");
      void fetchPopups();
    }
  };

  const remove = async (popup: AdminPopup) => {
    if (!confirm(`"${popup.title}" 팝업을 삭제할까요?`)) return;
    const res = await fetch(`/api/webinars/${webinarId}/popups/${popup.id}`, { method: "DELETE" });
    if (res.ok) { toast.success("삭제했어요"); void fetchPopups(); }
  };

  const inputCls = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-violet-400";

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-xl border border-border bg-background/60 p-3.5">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[130px_1fr]">
          <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className={inputCls}>
            <option value="notice">안내</option>
            <option value="survey">설문 유도</option>
            <option value="cta">바로가기</option>
            <option value="urgent">중요 공지</option>
          </select>
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="팝업 제목 *" className={inputCls} />
        </div>
        <textarea value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} placeholder="내용 (선택)" rows={2} className={`${inputCls} resize-none`} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input value={form.buttonLabel} onChange={(e) => setForm((f) => ({ ...f, buttonLabel: e.target.value }))} placeholder="버튼 라벨 (선택)" className={inputCls} />
          {form.useTally ? (
            <input value={form.tallyFormId} onChange={(e) => setForm((f) => ({ ...f, tallyFormId: e.target.value }))} placeholder="Tally 폼 ID" className={inputCls} />
          ) : (
            <input value={form.buttonUrl} onChange={(e) => setForm((f) => ({ ...f, buttonUrl: e.target.value }))} placeholder="버튼 URL" className={inputCls} />
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={form.useTally} onChange={(e) => setForm((f) => ({ ...f, useTally: e.target.checked }))} className="accent-violet-500" />
            버튼을 Tally 설문으로 연결
          </label>
          <motion.button whileTap={{ scale: 0.97 }} onClick={create} disabled={!form.title.trim() || busy}
            className="rounded-xl bg-violet-500 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-violet-600 disabled:opacity-50">
            {busy ? "등록 중…" : "팝업 등록"}
          </motion.button>
        </div>
      </div>

      {popups.length === 0 ? (
        <p className="text-xs text-muted-foreground">등록된 팝업이 없어요. ON 상태 팝업 1개만 시청자에게 표시돼요.</p>
      ) : (
        <div className="space-y-2">
          {popups.map((popup) => (
            <div key={popup.id} className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${popup.isActive ? "border-violet-500/40 bg-violet-500/[0.04]" : "border-border"}`}>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {popup.isActive && <span className="mr-1.5 rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-500">ON</span>}
                  {popup.title}
                </p>
                {popup.message && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{popup.message}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button onClick={() => toggle(popup)} className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${popup.isActive ? "border-border text-muted-foreground hover:bg-secondary" : "border-violet-500/40 text-violet-500 hover:bg-violet-500/10"}`}>
                  {popup.isActive ? "OFF" : "ON"}
                </button>
                <button onClick={() => remove(popup)} className="rounded-lg border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-500">삭제</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Tally 단독 푸시 패널 ── */
function TallyPanel({ webinarId }: { webinarId: string }) {
  const [pushes, setPushes] = useState<AdminTallyPush[]>([]);
  const [form, setForm] = useState({ title: "", formId: "", memo: "" });
  const [busy, setBusy] = useState(false);

  const fetchPushes = useCallback(async () => {
    const res = await fetch(`/api/webinars/${webinarId}/tally-pushes`);
    if (res.ok) setPushes((await res.json()).tallyPushes ?? []);
  }, [webinarId]);
  useEffect(() => { void fetchPushes(); }, [fetchPushes]);

  const create = async () => {
    if (!form.formId.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/webinars/${webinarId}/tally-pushes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Tally 푸시가 등록됐어요. ON으로 켜면 시청자 화면에 설문이 바로 떠요.");
      setForm({ title: "", formId: "", memo: "" });
      void fetchPushes();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "등록에 실패했어요");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (push: AdminTallyPush) => {
    const res = await fetch(`/api/webinars/${webinarId}/tally-pushes/${push.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !push.isActive }),
    });
    if (res.ok) {
      toast.success(push.isActive ? "푸시를 껐어요" : "시청자 화면에 설문이 표시돼요 (다른 푸시는 자동 OFF)");
      void fetchPushes();
    }
  };

  const remove = async (push: AdminTallyPush) => {
    if (!confirm(`"${push.title}" 푸시를 삭제할까요?`)) return;
    const res = await fetch(`/api/webinars/${webinarId}/tally-pushes/${push.id}`, { method: "DELETE" });
    if (res.ok) { toast.success("삭제했어요"); void fetchPushes(); }
  };

  const inputCls = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-violet-400";

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-xl border border-border bg-background/60 p-3.5">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="푸시 제목 (예: 만족도 조사)" className={inputCls} />
          <input value={form.formId} onChange={(e) => setForm((f) => ({ ...f, formId: e.target.value }))} placeholder="Tally 폼 ID 또는 임베드 코드 *" className={inputCls} />
        </div>
        <div className="flex items-center gap-2">
          <input value={form.memo} onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))} placeholder="메모 (선택)" className={inputCls} />
          <motion.button whileTap={{ scale: 0.97 }} onClick={create} disabled={!form.formId.trim() || busy}
            className="shrink-0 rounded-xl bg-violet-500 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-violet-600 disabled:opacity-50">
            {busy ? "등록 중…" : "푸시 등록"}
          </motion.button>
        </div>
        <p className="text-[11px] text-muted-foreground">응답자의 등록 ID가 hidden field로 함께 전송돼 나중에 등록 데이터와 매칭할 수 있어요.</p>
      </div>

      {pushes.length === 0 ? (
        <p className="text-xs text-muted-foreground">등록된 Tally 푸시가 없어요.</p>
      ) : (
        <div className="space-y-2">
          {pushes.map((push) => (
            <div key={push.id} className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${push.isActive ? "border-violet-500/40 bg-violet-500/[0.04]" : "border-border"}`}>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {push.isActive && <span className="mr-1.5 rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-500">ON</span>}
                  {push.title}
                  <span className="ml-2 font-mono text-[10px] text-muted-foreground">{push.formId}</span>
                </p>
                {push.memo && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{push.memo}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button onClick={() => toggle(push)} className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${push.isActive ? "border-border text-muted-foreground hover:bg-secondary" : "border-violet-500/40 text-violet-500 hover:bg-violet-500/10"}`}>
                  {push.isActive ? "OFF" : "ON"}
                </button>
                <button onClick={() => remove(push)} className="rounded-lg border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-500">삭제</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 운영 콘솔 본체 ── */
export default function LiveConsoleTab({
  webinarId,
  webinar,
  onNavigate,
}: {
  webinarId: string;
  webinar?: WebinarForConsole;
  onNavigate?: (target: string) => void;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const statusRef = useRef<WebinarStatus>("registration");

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch(`/api/webinars/${webinarId}/dashboard`);
      if (!res.ok) return;
      const next: DashboardData = await res.json();
      statusRef.current = next.status;
      setData(next);
    } finally {
      setIsLoading(false);
    }
  }, [webinarId]);

  // 적응형 폴링 — 라이브 15초 / 평시 90초, 탭 숨김 시 건너뜀
  useEffect(() => {
    void fetchDashboard();
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(async () => {
        if (!document.hidden) await fetchDashboard();
        schedule();
      }, statusRef.current === "live" ? 15_000 : 90_000);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [fetchDashboard]);

  const setOverride = async (value: WebinarStatus | null) => {
    if (switching) return;
    if (value === "ended" && !confirm("웨비나를 '종료' 상태로 전환할까요?\n아임웹의 버튼·배너가 즉시 종료 모드로 바뀌어요.")) return;
    setSwitching(true);
    try {
      const res = await fetch(`/api/webinars/${webinarId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusOverride: value }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(value === null ? "일정 기반 자동 판정으로 복귀했어요" : "상태를 수동 전환했어요 — 아임웹 부착물에 2분 내 반영돼요");
      void fetchDashboard();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "상태 전환에 실패했어요");
    } finally {
      setSwitching(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const status = data?.status ?? "registration";
  const isOverridden = data?.isOverridden ?? false;
  const summary = data?.summary;
  const viewers = data?.currentViewers ?? [];
  const meta = STATUS_META[status];

  const hasRegistrationForm = Boolean(webinar?.config?.registrationForm);
  const hasVideo = typeof webinar?.config?.youtubeId === "string" && Boolean(webinar.config.youtubeId);
  const hasSessions = Boolean(webinar?.sessions?.length);
  const showChecklist = (status === "registration" || status === "upcoming") && (summary?.attended ?? 0) === 0;

  const overrideOptions: { value: WebinarStatus | null; label: string }[] = [
    { value: null, label: "자동" },
    { value: "registration", label: "등록 중" },
    { value: "live", label: "라이브" },
    { value: "ended", label: "종료" },
  ];

  return (
    <div className="max-w-4xl space-y-4">
      {/* 상태 바 */}
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${meta.tone}`}>{meta.label}</span>
            {isOverridden && (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                수동 전환됨
              </span>
            )}
            <button onClick={() => void fetchDashboard()} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary" aria-label="새로고침">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-border bg-background p-1">
            {overrideOptions.map((option) => {
              const selected = option.value === null ? !isOverridden : isOverridden && status === option.value;
              return (
                <button
                  key={option.label}
                  onClick={() => setOverride(option.value)}
                  disabled={switching || selected}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-default ${
                    selected ? "bg-violet-500 text-white" : "text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          상태는 아임웹의 버튼·배너·등록 폼에 자동 반영돼요. 수동 전환 후 &ldquo;자동&rdquo;을 누르면 일정 기반 판정으로 돌아가요.
        </p>
      </section>

      {/* KPI */}
      {summary && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="사전 등록" value={summary.totalRegistered.toLocaleString()} />
          <Kpi label="입장" value={summary.attended.toLocaleString()} sub={`입장율 ${summary.attendRate}%`} />
          <Kpi label="현재 시청" value={summary.activeViewers.toLocaleString()} sub="최근 90초" />
          <Kpi label="페이지 유지" value={summary.presenceViewers.toLocaleString()} sub="최근 5분" />
          <Kpi label="대기 질문" value={summary.pendingQuestions.toLocaleString()} />
          <Kpi label="평균 체류" value={`${summary.avgStayMinutes}분`} />
        </div>
      )}

      {/* 준비 체크리스트 — 아직 입장자가 없는 준비 단계에만 */}
      {showChecklist && (
        <section className="rounded-2xl border border-border bg-secondary/20 p-4">
          <h3 className="text-sm font-semibold">라이브 전 준비</h3>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { done: hasRegistrationForm, icon: ClipboardList, label: "등록 폼 정리", target: "create-form" },
              { done: (summary?.totalRegistered ?? 0) > 0, icon: Users, label: "등록자 확보", target: "operate-registrants" },
              { done: hasSessions, icon: ListChecks, label: "세션 구성", target: "create-sessions" },
              { done: hasVideo, icon: Eye, label: "라이브 영상 연결", target: "create-general" },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => onNavigate?.(item.target)}
                className={`flex items-center gap-2 rounded-xl border p-3 text-left text-xs transition-colors hover:border-violet-400/40 ${
                  item.done ? "border-green-500/30 bg-green-500/[0.04]" : "border-border bg-background"
                }`}
              >
                <item.icon className={`h-4 w-4 shrink-0 ${item.done ? "text-green-500" : "text-muted-foreground"}`} />
                <span className={item.done ? "text-muted-foreground line-through" : ""}>{item.label}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 발행 패널들 */}
      <Section title="공지" icon={Megaphone} defaultOpen={status === "live"}>
        <AnnouncementsTab webinarId={webinarId} embedded />
      </Section>

      <Section
        title="Q&A 모더레이션"
        icon={HelpCircle}
        defaultOpen={status === "live"}
        badge={summary && summary.pendingQuestions > 0 ? (
          <span className="rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-500">{summary.pendingQuestions}</span>
        ) : undefined}
      >
        <QATab webinarId={webinarId} embedded />
      </Section>

      <Section title="팝업 푸시" icon={MessageSquarePlus}>
        <PopupPanel webinarId={webinarId} />
      </Section>

      <Section title="Tally 설문 푸시" icon={Bell}>
        <TallyPanel webinarId={webinarId} />
      </Section>

      <Section title="시청자" icon={Activity} badge={viewers.length ? (
        <span className="rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-500">{viewers.length}</span>
      ) : undefined}>
        {viewers.length === 0 ? (
          <p className="text-xs text-muted-foreground">현재 시청 중인 참여자가 없어요.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">이름</th>
                  <th className="py-2 pr-3 font-medium">회사</th>
                  <th className="py-2 pr-3 font-medium text-right">체류</th>
                  <th className="py-2 font-medium text-right">상태</th>
                </tr>
              </thead>
              <tbody>
                {viewers.map((viewer) => (
                  <tr key={viewer.id} className="border-b border-border/40 last:border-0">
                    <td className="py-2 pr-3 font-medium">{viewer.name}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{viewer.company ?? "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{viewer.currentStayMinutes}분</td>
                    <td className="py-2 text-right">
                      {viewer.isLive ? (
                        <span className="rounded-full bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">시청 중</span>
                      ) : (
                        <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">유지</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
