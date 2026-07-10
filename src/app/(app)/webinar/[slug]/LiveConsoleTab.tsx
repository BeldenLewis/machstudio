"use client";

// 운영 콘솔 — 라이브 당일의 단일 화면.
// 상태 수동 전환 / KPI / 공지·Q&A·팝업·Tally 발행 / 접속자.
// 폴링은 상태 적응형: 라이브 15초, 평시 90초 (+ 탭 숨김 가드) — egress 배려.

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import {
  Activity,
  Ban,
  BarChart3,
  Bell,
  ChevronDown,
  ClipboardList,
  Clock,
  Eye,
  HelpCircle,
  ListChecks,
  Loader2,
  Mail,
  Megaphone,
  MessageSquare,
  MessageSquarePlus,
  Pin,
  RefreshCw,
  Settings,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import QATab from "./QATab";
import AnnouncementsTab from "./AnnouncementsTab";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { WEBINAR_STATUS_META } from "@/lib/webinar-status";
import { formatKst } from "@/lib/datetime";

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

interface AdminPollOption {
  id: string;
  label: string;
  order: number;
  voteCount: number;
}

interface AdminPoll {
  id: string;
  question: string;
  isActive: boolean;
  createdAt: string;
  options: AdminPollOption[];
}

interface WebinarForConsole {
  config: Record<string, unknown>;
  components?: Record<string, unknown> | null;
  liveStartAt?: string;
  liveEndAt?: string;
  sessions: { id: string; number: number; type: string; title: string; startTime: string; endTime: string }[];
  _count: { registrations: number };
}

// 상태 라벨·톤은 lib/webinar-status 의 WEBINAR_STATUS_META 단일 정의 사용
const STATUS_META = WEBINAR_STATUS_META;

// 차트에 마커로 표시할 운영 이벤트(송출·발행·발송) 종류
const CHART_EVENT_ACTIONS = new Set([
  "webinar.poll_created", "webinar.poll_updated",
  "webinar.announcement_created", "webinar.announcement_updated",
  "webinar.popup_updated", "webinar.tally_push_updated", "webinar.reminder_sent",
]);

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
  const panelId = useId();
  return (
    <section className="rounded-2xl border border-border bg-card shadow-card">
      <motion.button
        whileTap={{ scale: 0.99 }}
        transition={spring}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-3 p-4 text-left sm:px-5"
      >
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold tracking-[-0.01em]">
          <Icon className="h-4 w-4 shrink-0 text-violet-500" />
          <span className="truncate">{title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {badge}
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </motion.button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
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

function GroupLabel({ children }: { children: ReactNode }) {
  return <p className="px-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">{children}</p>;
}

/* ── 팝업 발행 패널 ── */
function PopupPanel({ webinarId }: { webinarId: string }) {
  const confirm = useConfirm();
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
    if (!(await confirm({ title: "팝업을 삭제할까요?", description: `"${popup.title}"`, confirmLabel: "삭제", tone: "danger" }))) return;
    const res = await fetch(`/api/webinars/${webinarId}/popups/${popup.id}`, { method: "DELETE" });
    if (res.ok) { toast.success("삭제했어요"); void fetchPopups(); }
  };

  const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-violet-400";

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
          <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} onClick={create} disabled={!form.title.trim() || busy}
            className="rounded-lg bg-violet-500 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-violet-600 disabled:opacity-50">
            {busy ? "등록 중…" : "팝업 등록"}
          </motion.button>
        </div>
      </div>

      {popups.length === 0 ? (
        <p className="text-xs text-muted-foreground">등록된 팝업이 없어요. ON 상태 팝업 1개만 시청자에게 표시돼요.</p>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {popups.map((popup) => (
              <motion.div
                key={popup.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${popup.isActive ? "border-green-500/40 bg-green-500/[0.06]" : "border-border"}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {popup.isActive && <span className="mr-1.5 rounded-full bg-green-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-green-600 dark:text-green-400">ON</span>}
                    {popup.title}
                  </p>
                  {popup.message && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{popup.message}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <motion.button whileTap={{ scale: 0.9 }} transition={spring} onClick={() => toggle(popup)} className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${popup.isActive ? "border-border text-muted-foreground hover:bg-secondary" : "border-green-500/40 text-green-600 dark:text-green-400 hover:bg-green-500/10"}`}>
                    {popup.isActive ? "OFF" : "ON"}
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.9 }} transition={spring} onClick={() => remove(popup)} className="rounded-lg border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500">삭제</motion.button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/* ── Tally 단독 푸시 패널 ── */
function TallyPanel({ webinarId }: { webinarId: string }) {
  const confirm = useConfirm();
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
    if (!(await confirm({ title: "푸시를 삭제할까요?", description: `"${push.title}"`, confirmLabel: "삭제", tone: "danger" }))) return;
    const res = await fetch(`/api/webinars/${webinarId}/tally-pushes/${push.id}`, { method: "DELETE" });
    if (res.ok) { toast.success("삭제했어요"); void fetchPushes(); }
  };

  const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-violet-400";

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-xl border border-border bg-background/60 p-3.5">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="푸시 제목 (예: 만족도 조사)" className={inputCls} />
          <input value={form.formId} onChange={(e) => setForm((f) => ({ ...f, formId: e.target.value }))} placeholder="Tally 폼 ID 또는 임베드 코드 *" className={inputCls} />
        </div>
        <div className="flex items-center gap-2">
          <input value={form.memo} onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))} placeholder="메모 (선택)" className={inputCls} />
          <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} onClick={create} disabled={!form.formId.trim() || busy}
            className="shrink-0 rounded-lg bg-violet-500 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-violet-600 disabled:opacity-50">
            {busy ? "등록 중…" : "푸시 등록"}
          </motion.button>
        </div>
        <p className="text-[11px] text-muted-foreground">응답자의 등록 ID가 hidden field로 함께 전송돼 나중에 등록 데이터와 매칭할 수 있어요.</p>
      </div>

      {pushes.length === 0 ? (
        <p className="text-xs text-muted-foreground">등록된 Tally 푸시가 없어요.</p>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {pushes.map((push) => (
              <motion.div
                key={push.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${push.isActive ? "border-green-500/40 bg-green-500/[0.06]" : "border-border"}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {push.isActive && <span className="mr-1.5 rounded-full bg-green-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-green-600 dark:text-green-400">ON</span>}
                    {push.title}
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">{push.formId}</span>
                  </p>
                  {push.memo && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{push.memo}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <motion.button whileTap={{ scale: 0.9 }} transition={spring} onClick={() => toggle(push)} className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${push.isActive ? "border-border text-muted-foreground hover:bg-secondary" : "border-green-500/40 text-green-600 dark:text-green-400 hover:bg-green-500/10"}`}>
                    {push.isActive ? "OFF" : "ON"}
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.9 }} transition={spring} onClick={() => remove(push)} className="rounded-lg border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500">삭제</motion.button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/* ── 운영 콘솔 본체 ── */
/* ── 실시간 투표 패널 ── */
function PollPanel({ webinarId, tick = 0 }: { webinarId: string; tick?: number }) {
  const confirm = useConfirm();
  const [polls, setPolls] = useState<AdminPoll[]>([]);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editQuestion, setEditQuestion] = useState("");
  const [editOptions, setEditOptions] = useState<{ id: string; label: string }[]>([]);

  const fetchPolls = useCallback(async () => {
    const res = await fetch(`/api/webinars/${webinarId}/polls`);
    if (res.ok) setPolls((await res.json()).polls ?? []);
  }, [webinarId]);
  useEffect(() => { void fetchPolls(); }, [fetchPolls]);
  // 라이브 주기(tick)마다 집계 갱신 — 단, 편집 중엔 스킵해 입력 중 폼이 서버값으로 덮이지 않게
  const editIdRef = useRef(editId);
  editIdRef.current = editId;
  // 마운트 시 tick 효과 중복 발화 방지 — 초기 1회는 위 마운트 효과가 담당하고, tick 실제 변화에만 갱신.
  const tickMountedRef = useRef(false);
  useEffect(() => {
    if (!tickMountedRef.current) { tickMountedRef.current = true; return; }
    if (tick > 0 && !editIdRef.current) void fetchPolls();
  }, [tick, fetchPolls]);

  const create = async () => {
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || opts.length < 2 || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/webinars/${webinarId}/polls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, options: opts }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("투표가 등록됐어요. ON으로 켜면 시청자 화면 우하단에 표시돼요.");
      setQuestion("");
      setOptions(["", ""]);
      void fetchPolls();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "투표 등록에 실패했어요");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (poll: AdminPoll) => {
    const res = await fetch(`/api/webinars/${webinarId}/polls/${poll.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !poll.isActive }),
    });
    if (res.ok) {
      toast.success(poll.isActive ? "투표를 껐어요" : "투표가 시청자에게 표시돼요 (다른 투표는 자동 OFF)");
      void fetchPolls();
    }
  };

  const remove = async (poll: AdminPoll) => {
    if (!(await confirm({ title: "투표를 삭제할까요?", description: `"${poll.question}" — 응답 기록도 함께 삭제돼요.`, confirmLabel: "삭제", tone: "danger" }))) return;
    const res = await fetch(`/api/webinars/${webinarId}/polls/${poll.id}`, { method: "DELETE" });
    if (res.ok) { toast.success("삭제했어요"); void fetchPolls(); }
  };

  const startEdit = (poll: AdminPoll) => {
    setEditId(poll.id);
    setEditQuestion(poll.question);
    setEditOptions(poll.options.map((o) => ({ id: o.id, label: o.label })));
  };

  const saveEdit = async () => {
    if (!editId || !editQuestion.trim()) return;
    const res = await fetch(`/api/webinars/${webinarId}/polls/${editId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: editQuestion, options: editOptions }),
    });
    if (res.ok) { toast.success("수정했어요"); setEditId(null); void fetchPolls(); }
    else toast.error("수정에 실패했어요");
  };

  const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-violet-400";

  return (
    <div className="space-y-4">
      {/* 생성 폼 */}
      <div className="space-y-2 rounded-xl border border-border bg-background/60 p-3.5">
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="투표 질문 *" className={inputCls} />
        <div className="space-y-2">
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={opt} onChange={(e) => setOptions((prev) => prev.map((o, j) => (j === i ? e.target.value : o)))} placeholder={`선택지 ${i + 1}`} className={inputCls} />
              {options.length > 2 && (
                <button type="button" onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))} aria-label="선택지 삭제" className="shrink-0 rounded-lg border border-border px-2 py-2 text-xs text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500">×</button>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          {options.length < 8 ? (
            <button type="button" onClick={() => setOptions((prev) => [...prev, ""])} className="text-xs font-medium text-violet-500 hover:underline">+ 선택지 추가</button>
          ) : <span />}
          <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} onClick={create} disabled={!question.trim() || options.filter((o) => o.trim()).length < 2 || busy}
            className="rounded-lg bg-violet-500 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-violet-600 disabled:opacity-50">
            {busy ? "등록 중…" : "투표 등록"}
          </motion.button>
        </div>
      </div>

      {polls.length === 0 ? (
        <p className="text-xs text-muted-foreground">등록된 투표가 없어요. ON 상태 투표 1개만 시청자 우하단에 표시돼요.</p>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {polls.map((poll) => {
              const total = poll.options.reduce((s, o) => s + o.voteCount, 0);
              const editing = editId === poll.id;
              return (
                <motion.div
                  key={poll.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className={`rounded-xl border p-3 ${poll.isActive ? "border-green-500/40 bg-green-500/[0.06]" : "border-border"}`}
                >
                  {editing ? (
                    <div className="space-y-2">
                      <input value={editQuestion} onChange={(e) => setEditQuestion(e.target.value)} className={inputCls} />
                      {editOptions.map((o, i) => (
                        <input key={o.id} value={o.label} onChange={(e) => setEditOptions((prev) => prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className={inputCls} />
                      ))}
                      <p className="text-[10px] text-muted-foreground">선택지 개수 변경은 새 투표로 만들어주세요 (응답 보존을 위해 문구만 수정돼요).</p>
                      <div className="flex justify-end gap-1.5">
                        <motion.button whileTap={{ scale: 0.9 }} onClick={() => setEditId(null)} className="rounded-lg border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-secondary">취소</motion.button>
                        <motion.button whileTap={{ scale: 0.9 }} onClick={saveEdit} className="rounded-lg bg-violet-500 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-violet-600">저장</motion.button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {poll.isActive && <span className="mr-1.5 rounded-full bg-green-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-green-600 dark:text-green-400">ON</span>}
                            {poll.question}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{poll.options.length}개 선택지 · 총 {total}표</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <motion.button whileTap={{ scale: 0.9 }} transition={spring} onClick={() => toggle(poll)} className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${poll.isActive ? "border-border text-muted-foreground hover:bg-secondary" : "border-green-500/40 text-green-600 dark:text-green-400 hover:bg-green-500/10"}`}>
                            {poll.isActive ? "OFF" : "ON"}
                          </motion.button>
                          <motion.button whileTap={{ scale: 0.9 }} transition={spring} onClick={() => startEdit(poll)} className="rounded-lg border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary">수정</motion.button>
                          <motion.button whileTap={{ scale: 0.9 }} transition={spring} onClick={() => remove(poll)} className="rounded-lg border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500">삭제</motion.button>
                        </div>
                      </div>
                      <div className="mt-2 space-y-1">
                        {poll.options.map((o) => {
                          const pct = total > 0 ? Math.round((o.voteCount / total) * 100) : 0;
                          return (
                            <div key={o.id} className="relative overflow-hidden rounded-lg border border-border/60 px-2.5 py-1.5 text-[11px]">
                              <div className="absolute inset-y-0 left-0 bg-violet-500/10" style={{ width: `${pct}%` }} />
                              <div className="relative flex items-center justify-between">
                                <span className="truncate">{o.label}</span>
                                <span className="tabular-nums text-muted-foreground">{o.voteCount}표 · {pct}%</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/* ── 실시간 채팅 모더레이션 패널 ── */
interface AdminChatMessage {
  id: string;
  name: string;
  message: string;
  isHost: boolean;
  isPinned: boolean;
  registrationId: string | null;
  createdAt: string;
}

// 토글 스위치 — 채팅 on/off·모더레이션 설정 등에서 공용.
function Switch({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-violet-500" : "border border-border bg-secondary"}`}>
      <span className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-[3px]"}`} />
    </button>
  );
}

function ChatPanel({ webinarId, tick = 0, fillHeight = false }: { webinarId: string; tick?: number; fillHeight?: boolean }) {
  const confirm = useConfirm();
  const [messages, setMessages] = useState<AdminChatMessage[]>([]);
  const [hostMsg, setHostMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<{ chatEnabled: boolean; hideLinks: boolean; slowSec: number; bannedWords: string[]; bannedCount: number }>({ chatEnabled: false, hideLinks: true, slowSec: 0, bannedWords: [], bannedCount: 0 });
  const [showBanned, setShowBanned] = useState(false);
  const [slowInput, setSlowInput] = useState("0");
  const [bannedInput, setBannedInput] = useState("");
  const [savingMod, setSavingMod] = useState(false);
  const seededRef = useRef(false);
  // 진행 중 mutation(고정·차단·설정) 동안 사일런트 폴링이 상태를 덮지 않게 가드 + 인플라이트 응답 펜스.
  const mutatingRef = useRef(false);
  const reqIdRef = useRef(0);

  const fetchMessages = useCallback(async () => {
    const gen = ++reqIdRef.current;
    const res = await fetch(`/api/webinars/${webinarId}/chat`);
    if (res.ok) {
      const d = await res.json();
      // 요청 출발 후 mutation 이 reqId 를 올렸으면(=그 사이 고정/차단/저장 발생) 이 응답은 버린다.
      if (gen !== reqIdRef.current) { setLoading(false); return; }
      setMessages(d.messages ?? []);
      if (d.settings) {
        setSettings({ chatEnabled: !!d.settings.chatEnabled, hideLinks: d.settings.hideLinks !== false, slowSec: d.settings.slowSec ?? 0, bannedWords: d.settings.bannedWords ?? [], bannedCount: d.settings.bannedCount ?? 0 });
        // 입력 버퍼는 최초 1회만 시드 — 폴링이 편집 중 값을 덮지 않게.
        if (!seededRef.current) { seededRef.current = true; setSlowInput(String(d.settings.slowSec ?? 0)); setBannedInput((d.settings.bannedWords ?? []).join(", ")); }
      }
    }
    setLoading(false);
  }, [webinarId]);
  useEffect(() => { void fetchMessages(); }, [fetchMessages]);
  // 라이브 주기(tick)마다 모더레이션 피드 갱신(mutation 중엔 스킵 — 낙관적 갱신 보호)
  useEffect(() => { if (tick > 0 && !mutatingRef.current) void fetchMessages(); }, [tick, fetchMessages]);

  const sendHost = async () => {
    if (!hostMsg.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/webinars/${webinarId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: hostMsg }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("운영자 메시지를 보냈어요");
      setHostMsg("");
      void fetchMessages();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "전송에 실패했어요");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m: AdminChatMessage) => {
    if (!(await confirm({ title: "메시지를 삭제할까요?", description: `"${m.message.slice(0, 40)}"`, confirmLabel: "삭제", tone: "danger" }))) return;
    const res = await fetch(`/api/webinars/${webinarId}/chat/${m.id}`, { method: "DELETE" });
    if (res.ok) { toast.success("삭제했어요"); setMessages((prev) => prev.filter((x) => x.id !== m.id)); }
  };

  // 고정 — 웨비나당 1개(켜면 나머지 고정 해제).
  const togglePin = async (m: AdminChatMessage) => {
    mutatingRef.current = true;
    reqIdRef.current++;
    try {
      const next = !m.isPinned;
      const res = await fetch(`/api/webinars/${webinarId}/chat/${m.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isPinned: next }),
      });
      if (!res.ok) { toast.error("고정하지 못했어요"); return; }
      setMessages((prev) => prev.map((x) => x.id === m.id ? { ...x, isPinned: next } : (next ? { ...x, isPinned: false } : x)));
      toast.success(next ? "메시지를 고정했어요" : "고정을 해제했어요");
    } finally { mutatingRef.current = false; }
  };

  // 차단 — 작성 시청자를 채팅에서 차단하고 기존 메시지 정리.
  const ban = async (m: AdminChatMessage) => {
    if (!m.registrationId) { toast.error("이 메시지는 차단할 수 없어요(익명)"); return; }
    if (!(await confirm({ title: `${m.name}님을 차단할까요?`, description: "이 시청자는 더 이상 채팅할 수 없고, 남긴 메시지는 삭제돼요.", confirmLabel: "차단", tone: "danger" }))) return;
    mutatingRef.current = true;
    reqIdRef.current++;
    try {
      const res = await fetch(`/api/webinars/${webinarId}/chat/${m.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ban: true }),
      });
      if (!res.ok) { toast.error("차단하지 못했어요"); return; }
      toast.success("차단했어요");
      setMessages((prev) => prev.filter((x) => x.registrationId !== m.registrationId));
      setSettings((s) => ({ ...s, bannedCount: s.bannedCount + 1 }));
    } finally { mutatingRef.current = false; }
  };

  const saveMod = async () => {
    setSavingMod(true);
    mutatingRef.current = true;
    reqIdRef.current++;
    try {
      const bannedWords = bannedInput.split(",").map((w) => w.trim()).filter(Boolean);
      const res = await fetch(`/api/webinars/${webinarId}/chat`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slowSec: Number(slowInput) || 0, bannedWords }),
      });
      if (!res.ok) { toast.error("설정 저장 실패"); return; }
      setSettings((s) => ({ ...s, slowSec: Number(slowInput) || 0, bannedWords }));
      toast.success("모더레이션 설정을 저장했어요");
    } finally { setSavingMod(false); mutatingRef.current = false; }
  };

  // 채팅 on/off · 천천히 모드 · 링크 자동 숨김 토글 — 설정 PATCH 재사용, 낙관적 반영.
  const patchChat = async (body: Record<string, unknown>, apply: () => void) => {
    mutatingRef.current = true; reqIdRef.current++;
    try {
      const res = await fetch(`/api/webinars/${webinarId}/chat`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { toast.error("변경에 실패했어요"); return; }
      apply();
    } finally { mutatingRef.current = false; }
  };
  const toggleHideLinks = () => { const next = !settings.hideLinks; void patchChat({ hideLinks: next }, () => setSettings((s) => ({ ...s, hideLinks: next }))); };
  const toggleSlow = () => { const next = settings.slowSec > 0 ? 0 : 10; void patchChat({ slowSec: next }, () => { setSettings((s) => ({ ...s, slowSec: next })); setSlowInput(String(next)); }); };

  const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-violet-400";

  // 고정 메시지를 맨 위로(단일 활성). 나머지는 서버 순서(최근순) 유지.
  const orderedMsgs = [...messages].sort((a, b) => Number(b.isPinned) - Number(a.isPinned));

  return (
    <div className={fillHeight ? "flex h-full min-h-0 flex-col" : "space-y-4"}>
      {!fillHeight && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          시청자 채팅은 <b className="font-semibold text-foreground">만들기 → 라이브 페이지 → 참여 구성 → 채팅 탭 사용</b>을 켜야 시청 화면에 보여요. 여기선 운영자 발언과 메시지 삭제(모더레이션)를 할 수 있어요.
        </p>
      )}

      {loading ? (
        <div className={fillHeight ? "flex min-h-0 flex-1 items-center justify-center" : "py-6 text-center"}>
          <p className="text-xs text-muted-foreground">불러오는 중…</p>
        </div>
      ) : messages.length === 0 ? (
        <div className={fillHeight ? "flex min-h-0 flex-1 items-center justify-center" : "py-6 text-center"}>
          <p className="text-xs text-muted-foreground">아직 채팅 메시지가 없어요.</p>
        </div>
      ) : (
        <div className={`${fillHeight ? "min-h-0 flex-1" : "max-h-80"} space-y-0.5 overflow-y-auto overscroll-contain`}>
          <AnimatePresence initial={false}>
            {orderedMsgs.map((m) => (
              <motion.div
                key={m.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className={`group flex items-start gap-2.5 rounded-xl p-2 transition-colors ${m.isPinned ? "bg-violet-500/10" : "hover:bg-secondary/60"}`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${m.isHost ? "bg-red-500/10 text-red-500" : "bg-violet-500/10 text-violet-600 dark:text-violet-400"}`} aria-hidden>
                  {m.name?.[0] ?? "?"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span className={`font-semibold ${m.isHost ? "text-red-500" : "text-foreground"}`}>{m.name}</span>
                    {m.isHost && <span className="rounded bg-red-500/10 px-1 py-0.5 text-[9px] font-bold text-red-500">HOST</span>}
                    {m.isPinned && <span className="font-medium text-violet-500">📌 고정됨</span>}
                    <span>{formatKst(m.createdAt, { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <p className="mt-0.5 break-words text-[12.5px] text-foreground">{m.message}</p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <motion.button whileTap={{ scale: 0.9 }} transition={spring} onClick={() => togglePin(m)}
                    className={`rounded-lg p-1.5 transition-colors ${m.isPinned ? "text-violet-500" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
                    title={m.isPinned ? "고정 해제" : "고정"} aria-label={m.isPinned ? "고정 해제" : "메시지 고정"}>
                    <Pin className="h-3.5 w-3.5" />
                  </motion.button>
                  {!m.isHost && m.registrationId && (
                    <motion.button whileTap={{ scale: 0.9 }} transition={spring} onClick={() => ban(m)}
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500" title="차단" aria-label={`${m.name}님 차단`}>
                      <Ban className="h-3.5 w-3.5" />
                    </motion.button>
                  )}
                  <motion.button whileTap={{ scale: 0.9 }} transition={spring} onClick={() => remove(m)}
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500" title="삭제" aria-label="메시지 삭제">
                    <Trash2 className="h-3.5 w-3.5" />
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* 하단 클러스터 — 모더레이션 설정(천천히·링크·금지어) + 진행자 컴포저 */}
      <div className="shrink-0 space-y-3 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
          <label className="flex items-center gap-1.5">
            <Switch on={settings.slowSec > 0} onClick={toggleSlow} label="천천히 모드" />
            천천히 모드{settings.slowSec > 0 ? ` ${settings.slowSec}초` : ""}
          </label>
          <label className="flex items-center gap-1.5">
            <Switch on={settings.hideLinks} onClick={toggleHideLinks} label="링크 자동 숨김" />
            링크 자동 숨김
          </label>
          <button type="button" onClick={() => setShowBanned((v) => !v)}
            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 font-medium text-foreground transition-colors hover:bg-secondary">
            금지어 설정{settings.bannedWords.length > 0 ? ` (${settings.bannedWords.length})` : ""}
            <ChevronDown className={`h-3 w-3 transition-transform ${showBanned ? "rotate-180" : ""}`} />
          </button>
          {settings.bannedCount > 0 && <span>차단 {settings.bannedCount}명</span>}
        </div>
        {showBanned && (
          <div className="flex items-center gap-2">
            <input value={bannedInput} onChange={(e) => setBannedInput(e.target.value)} placeholder="금지어(쉼표로 구분, 2자 이상)"
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1 text-xs outline-none transition-colors focus:border-violet-400" />
            <motion.button whileTap={{ scale: 0.97 }} transition={spring} onClick={saveMod} disabled={savingMod}
              className="shrink-0 rounded-lg bg-violet-500 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-violet-600 disabled:opacity-50">저장</motion.button>
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={hostMsg}
            onChange={(e) => setHostMsg(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) void sendHost(); }}
            placeholder="진행자(HOST)로 메시지 보내기…"
            className={inputCls}
          />
          <motion.button whileTap={{ scale: 0.97 }} onClick={sendHost} disabled={!hostMsg.trim() || busy}
            className="shrink-0 rounded-lg bg-violet-500 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-violet-600 disabled:opacity-50">
            보내기
          </motion.button>
        </div>
      </div>
    </div>
  );
}

/* ── 알림 발송 패널 ("알림 받고 이어보기" 구독자에게) ── */
function ReminderPanel({ webinarId }: { webinarId: string }) {
  const [count, setCount] = useState(0);
  const [emailReady, setEmailReady] = useState(false);
  const [form, setForm] = useState({ subject: "", message: "", url: "", buttonLabel: "" });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchReminders = useCallback(async () => {
    const res = await fetch(`/api/webinars/${webinarId}/reminders`);
    if (res.ok) {
      const d = await res.json();
      setCount(d.count ?? 0);
      setEmailReady(!!d.emailConfigured);
    }
    setLoading(false);
  }, [webinarId]);
  useEffect(() => { void fetchReminders(); }, [fetchReminders]);

  const send = async () => {
    if (!form.subject.trim() || !form.message.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/webinars/${webinarId}/reminders/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      if (d.emailConfigured) toast.success(`발송 완료 — ${d.sent}명 전송${d.failed ? `, ${d.failed}명 실패` : ""}`);
      else toast.message(`이메일 발송 미설정 — 건너뜀 (구독자 ${d.total}명). RESEND_API_KEY 설정 후 사용하세요.`);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "발송에 실패했어요");
    } finally {
      setBusy(false);
    }
  };

  const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-violet-400";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm">
          구독자 <b className="font-semibold text-violet-500">{loading ? "…" : count}</b>명
          <span className="ml-1 text-[11px] text-muted-foreground">(&ldquo;알림 받고 이어보기&rdquo; 켠 시청자)</span>
        </p>
        <button onClick={() => void fetchReminders()} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground">
          <RefreshCw className="h-3 w-3" /> 새로고침
        </button>
      </div>

      {!loading && !emailReady && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-2.5 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
          이메일 발송이 아직 연결되지 않았어요. <code className="rounded bg-black/10 px-1 dark:bg-white/10">RESEND_API_KEY</code>(+발송 도메인)를 설정하면 실제로 발송돼요. 지금은 구독자만 수집돼요.
        </p>
      )}

      <div className="space-y-2 rounded-xl border border-border bg-background/60 p-3.5">
        <input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="제목 (예: 곧 다음 세션이 시작돼요)" className={inputCls} />
        <textarea value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} placeholder="내용" rows={3} className={`${inputCls} resize-none`} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="버튼 링크 (선택)" className={inputCls} />
          <input value={form.buttonLabel} onChange={(e) => setForm((f) => ({ ...f, buttonLabel: e.target.value }))} placeholder="버튼 라벨 (선택)" className={inputCls} />
        </div>
        <div className="flex justify-end">
          <motion.button whileTap={{ scale: 0.97 }} onClick={send} disabled={!form.subject.trim() || !form.message.trim() || busy || count === 0}
            className="rounded-lg bg-violet-500 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-violet-600 disabled:opacity-50">
            {busy ? "발송 중…" : `구독자 ${count}명에게 발송`}
          </motion.button>
        </div>
      </div>
    </div>
  );
}

interface CurveData { points: { label: string; viewers: number; entered: number; chat: number }[]; peak: number; avg: number; hasData: boolean; bucketMinutes?: number; range?: string }
interface ActivityItem { id: string; action: string; label: string; at: string; actor: string | null }

// tailwind 토큰(oklch)을 canvas 용 concrete 색으로 — 프로브 span 의 computed color 를 읽는다(테마 반영).
function readColor(className: string, alpha?: number) {
  if (typeof document === "undefined") return "#888";
  const el = document.createElement("span");
  el.className = className; el.style.display = "none"; document.body.appendChild(el);
  const rgb = getComputedStyle(el).color; el.remove();
  if (alpha == null) return rgb;
  const m = rgb.match(/[\d.]+/g);
  return m ? `rgba(${m[0]},${m[1]},${m[2]},${alpha})` : rgb;
}

// 실시간 신선도 — 마지막 동기화 후 경과를 1초마다 갱신 표시
function FreshBadge({ syncAt }: { syncAt: number }) {
  const [, force] = useState(0);
  useEffect(() => { const t = setInterval(() => force((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  const ago = Math.max(0, Math.round((Date.now() - syncAt) / 1000));
  const txt = ago < 5 ? "방금" : ago < 60 ? `${ago}초 전` : `${Math.floor(ago / 60)}분 전`;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> 실시간 · {txt} 갱신
    </span>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv || !cv.getContext) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const r = cv.getBoundingClientRect();
    const W = Math.max(40, r.width || 80), H = Math.max(20, r.height || 34);
    cv.width = W * ratio; cv.height = H * ratio; ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const vals = values.length ? values : [0, 0];
    const max = Math.max(1, ...vals), min = Math.min(...vals);
    const rng = Math.max(1, max - min);
    const x = (i: number) => (i / Math.max(1, vals.length - 1)) * W;
    const y = (v: number) => H - 2 - ((v - min) / rng) * (H - 4);
    const ac = readColor("text-violet-500");
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, readColor("text-violet-500", 0.28) as string); g.addColorStop(1, readColor("text-violet-500", 0) as string);
    ctx.beginPath(); vals.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); vals.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    ctx.strokeStyle = ac as string; ctx.lineWidth = 1.6; ctx.lineJoin = "round"; ctx.stroke();
  }, [values]);
  return <canvas ref={ref} className="h-full w-full" />;
}

// 동시 접속 추이 — attendance-curve 실데이터. 동시·입장 라인 + 채팅 하단 막대 + 이벤트 마커 + 호버.
const CHART_RANGES: { key: string; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "60m", label: "최근 60분" },
  { key: "30m", label: "최근 30분" },
];
function ChartLegend() {
  return (
    <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground">
      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-violet-500" />동시</span>
      <span className="flex items-center gap-1"><span className="h-0.5 w-2.5 rounded bg-green-500" />입장</span>
      <span className="flex items-center gap-1"><span className="h-2 w-1.5 rounded-sm bg-muted-foreground/40" />채팅</span>
    </div>
  );
}
function ChartRangeToggle({ range, onRangeChange }: { range: string; onRangeChange?: (r: string) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5">
      {CHART_RANGES.map((rg) => (
        <button key={rg.key} onClick={() => onRangeChange?.(rg.key)} disabled={!onRangeChange}
          className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${range === rg.key ? "bg-violet-500 text-white" : "text-muted-foreground hover:bg-secondary"}`}>
          {rg.label}
        </button>
      ))}
    </div>
  );
}
function ViewerChart({ curve, events = [], range = "all", onRangeChange }: { curve: CurveData | null; events?: { min: number; label: string }[]; range?: string; onRangeChange?: (r: string) => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [tip, setTip] = useState<{ x: number; label: string; v: number; entered: number; chat: number } | null>(null);
  const pts = curve?.points ?? [];
  // 운영 이벤트(투표 발행·공지 등)를 가장 가까운(≤10분) 버킷에 매핑 — 추이와 액션 상관 표시
  const evByIdx = new Map<number, string[]>();
  if (pts.length) {
    const ptMin = pts.map((p) => { const [h, m] = p.label.split(":").map(Number); return (h || 0) * 60 + (m || 0); });
    events.forEach((e) => {
      let best = 0, bd = Infinity;
      ptMin.forEach((pm, i) => { const d = Math.abs(pm - e.min); if (d < bd) { bd = d; best = i; } });
      if (bd <= 10) { const arr = evByIdx.get(best) ?? []; arr.push(e.label); evByIdx.set(best, arr); }
    });
  }
  useEffect(() => {
    const cv = ref.current; if (!cv || !cv.getContext) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const draw = () => {
      const r = cv.getBoundingClientRect();
      const W = Math.max(280, r.width || 600), H = Math.max(160, r.height || 220);
      cv.width = W * ratio; cv.height = H * ratio; ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const padL = 8, padR = 8, padT = 14, padB = 22, barBand = 16;
      const vals = pts.map((p) => p.viewers);
      const entered = pts.map((p) => p.entered ?? 0);
      const chat = pts.map((p) => p.chat ?? 0);
      const yMax = Math.max(10, curve?.peak ?? 0, ...entered) * 1.15;
      const maxChat = Math.max(1, ...chat);
      const N = pts.length;
      const plotB = H - padB - barBand; // 라인 영역 바닥(하단 채팅 막대 위)
      const ac = readColor("text-violet-500"), good = readColor("text-green-500"), muted = readColor("text-muted-foreground"), gl = readColor("text-muted-foreground", 0.14);
      const x = (i: number) => padL + (N <= 1 ? 0.5 : i / (N - 1)) * (W - padL - padR);
      const y = (v: number) => padT + (1 - v / yMax) * (plotB - padT);
      ctx.font = "10px sans-serif"; ctx.textBaseline = "middle";
      [0, 0.5, 1].forEach((f) => { const gv = Math.round(yMax * f), yy = y(gv); ctx.strokeStyle = gl as string; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke(); ctx.fillStyle = muted as string; ctx.textAlign = "left"; ctx.fillText(gv >= 1000 ? (gv / 1000).toFixed(1) + "k" : String(gv), padL + 2, yy - 7); });
      // 채팅 하단 막대(자체 스케일 — 동시/입장과 100배 차 나므로 별도 표현)
      if (N) { const bw = Math.max(1.5, ((W - padL - padR) / N) * 0.5); ctx.fillStyle = readColor("text-muted-foreground", 0.35) as string; chat.forEach((c, i) => { if (c <= 0) return; const bh = (c / maxChat) * (barBand - 3); ctx.fillRect(x(i) - bw / 2, H - padB - bh, bw, bh); }); }
      const linePath = (arr: number[]) => { ctx.beginPath(); arr.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)))); };
      if (N >= 2) {
        const grad = ctx.createLinearGradient(0, padT, 0, plotB); grad.addColorStop(0, readColor("text-violet-500", 0.26) as string); grad.addColorStop(1, readColor("text-violet-500", 0) as string);
        linePath(vals); ctx.lineTo(x(N - 1), plotB); ctx.lineTo(x(0), plotB); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
        ctx.setLineDash([4, 3]); linePath(entered); ctx.strokeStyle = good as string; ctx.lineWidth = 1.6; ctx.lineJoin = "round"; ctx.stroke(); ctx.setLineDash([]);
        linePath(vals); ctx.strokeStyle = ac as string; ctx.lineWidth = 2.2; ctx.lineJoin = "round"; ctx.stroke();
        const ex = x(N - 1), ey = y(vals[N - 1]); ctx.beginPath(); ctx.arc(ex, ey, 3.6, 0, 7); ctx.fillStyle = ac as string; ctx.fill();
      }
      // 운영 이벤트 마커 — 라인 영역 바닥의 작은 점(해당 버킷에 액션 발생)
      evByIdx.forEach((_l, i) => { ctx.beginPath(); ctx.arc(x(i), plotB, 2.6, 0, 7); ctx.fillStyle = ac as string; ctx.fill(); });
      ctx.fillStyle = muted as string; ctx.textBaseline = "alphabetic";
      if (N) { ctx.textAlign = "left"; ctx.fillText(pts[0].label, padL, H - 6); ctx.textAlign = "right"; ctx.fillText(pts[N - 1].label, W - padR, H - 6); }
      if (hover != null && pts[hover]) { const hx = x(hover); ctx.strokeStyle = readColor("text-muted-foreground", 0.4) as string; ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx, padT); ctx.lineTo(hx, plotB); ctx.stroke(); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(hx, y(vals[hover]), 3.4, 0, 7); ctx.fillStyle = ac as string; ctx.fill(); }
    };
    draw();
    const ro = new ResizeObserver(draw); ro.observe(cv);
    const mq = window.matchMedia("(prefers-color-scheme: dark)"); mq.addEventListener("change", draw);
    return () => { ro.disconnect(); mq.removeEventListener("change", draw); };
  }, [pts, hover, curve, events]);
  const onMove = (clientX: number) => {
    const cv = ref.current; if (!cv || !pts.length) return;
    const r = cv.getBoundingClientRect(); const padL = 8, padR = 8, W = Math.max(280, r.width);
    let i = Math.round(((clientX - r.left - padL) / (W - padL - padR)) * (pts.length - 1));
    i = Math.max(0, Math.min(pts.length - 1, i)); const p = pts[i];
    setHover(i); setTip({ x: padL + (pts.length <= 1 ? 0.5 : i / (pts.length - 1)) * (W - padL - padR), label: p.label, v: p.viewers, entered: p.entered ?? 0, chat: p.chat ?? 0 });
  };
  if (!curve || !curve.hasData) {
    return (
      <section className="rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3.5 sm:px-5"><BarChart3 className="h-4 w-4 text-violet-500" /><h2 className="text-sm font-semibold">동시 접속 추이</h2><div className="ml-auto"><ChartRangeToggle range={range} onRangeChange={onRangeChange} /></div></div>
        <div className="flex flex-col items-center gap-1.5 px-4 py-12 text-center">
          <p className="text-sm font-medium">아직 시청 데이터가 없어요</p>
          <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">라이브가 시작되고 시청자가 입장하면 분 단위 추이가 여기 표시돼요.</p>
        </div>
      </section>
    );
  }
  return (
    <section className="rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3.5 sm:px-5">
        <BarChart3 className="h-4 w-4 text-violet-500" /><h2 className="text-sm font-semibold">동시 접속 추이</h2>
        <ChartLegend />
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-[11px] text-muted-foreground sm:inline">피크 <b className="font-semibold text-foreground tabular-nums">{curve.peak.toLocaleString()}</b> · 평균 <b className="font-semibold text-foreground tabular-nums">{curve.avg.toLocaleString()}</b></span>
          <ChartRangeToggle range={range} onRangeChange={onRangeChange} />
        </div>
      </div>
      <div className="relative px-3 py-3" style={{ height: 240 }}>
        <canvas ref={ref} className="block h-full w-full cursor-crosshair" style={{ touchAction: "none" }}
          onMouseMove={(e) => onMove(e.clientX)} onMouseLeave={() => { setHover(null); setTip(null); }}
          onTouchStart={(e) => onMove(e.touches[0].clientX)} onTouchMove={(e) => onMove(e.touches[0].clientX)} />
        {tip && (
          <div className="pointer-events-none absolute top-2 -translate-x-1/2 rounded-lg bg-foreground px-2.5 py-1.5 text-[11px] leading-tight text-background shadow-lg" style={{ left: tip.x }}>
            <div className="font-bold">{tip.label}</div>
            <div className="tabular-nums">동시 {tip.v.toLocaleString()} · 입장 {tip.entered.toLocaleString()} · 채팅 {tip.chat.toLocaleString()}</div>
            {hover != null && evByIdx.get(hover)?.map((lb, k) => <div key={k} className="mt-0.5 opacity-80">● {lb}</div>)}
          </div>
        )}
      </div>
    </section>
  );
}

function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (!items.length) return <p className="rounded-2xl border border-border bg-card px-4 py-6 text-center text-xs text-muted-foreground">아직 운영 활동이 없어요.</p>;
  return (
    <section className="max-h-64 overflow-y-auto rounded-2xl border border-border bg-card">
      {items.map((it) => (
        <div key={it.id} className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-[13px] last:border-0">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
          <span className="min-w-[52px] shrink-0 text-[11px] tabular-nums text-muted-foreground">{formatKst(it.at, { hour: "2-digit", minute: "2-digit" })}</span>
          <span className="min-w-0 flex-1 truncate">{it.label}{it.actor ? <span className="text-muted-foreground"> · {it.actor}</span> : null}</span>
        </div>
      ))}
    </section>
  );
}

// 현재 KST 분(자정 기준). 러닝오더 상태 판정용.
function kstMinutes() { const d = new Date(); return ((d.getUTCHours() + 9) % 24) * 60 + d.getUTCMinutes(); }

// 경과·종료까지 시계 — 라이브 중 초 단위 갱신
function LiveClock({ startAt, endAt }: { startAt?: string; endAt?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const fmt = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); const mm = String(m).padStart(2, "0"), ss = String(s % 60).padStart(2, "0"); return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`; };
  const start = startAt ? Date.parse(startAt) : NaN, end = endAt ? Date.parse(endAt) : NaN;
  const elapsed = Number.isFinite(start) && now >= start ? fmt(now - start) : null;
  const remain = Number.isFinite(end) && end > now ? fmt(end - now) : null;
  if (!elapsed && !remain) return null;
  return (
    <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
      {elapsed && <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> 경과 <b className="font-semibold text-foreground tabular-nums">{elapsed}</b></span>}
      {remain && <span>종료까지 <b className="font-semibold text-foreground tabular-nums">{remain}</b></span>}
    </span>
  );
}

// 러닝오더 — 세션 타임라인(현재 KST 시각으로 done/live/next 판정). 세션 시각은 "HH:MM" 문자열.
function RunningOrder({ sessions }: { sessions: WebinarForConsole["sessions"] }) {
  const [nowMin, setNowMin] = useState(() => kstMinutes());
  useEffect(() => { const t = setInterval(() => setNowMin(kstMinutes()), 30000); return () => clearInterval(t); }, []);
  if (!sessions.length) return null;
  const toMin = (hhmm: string) => { const [h, m] = (hhmm || "").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  const ordered = [...sessions].sort((a, b) => a.number - b.number);
  const firstUpcoming = ordered.find((s) => toMin(s.startTime) > nowMin);
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border p-4 sm:px-5">
        <ListChecks className="h-4 w-4 text-violet-500" />
        <h2 className="text-sm font-semibold">러닝오더</h2>
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">현재 {String(Math.floor(nowMin / 60)).padStart(2, "0")}:{String(nowMin % 60).padStart(2, "0")}</span>
      </div>
      <div className="divide-y divide-border/60">
        {ordered.map((s) => {
          const st = toMin(s.startTime), en = toMin(s.endTime);
          const state = en <= nowMin ? "done" : st <= nowMin && nowMin < en ? "live" : s === firstUpcoming ? "next" : "upcoming";
          return (
            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
              <span className={`h-2 w-2 shrink-0 rounded-full ${state === "live" ? "animate-pulse bg-green-500" : state === "next" ? "bg-violet-500" : state === "done" ? "bg-muted-foreground/30" : "bg-border"}`} />
              <div className="min-w-0 flex-1">
                <div className={`truncate text-[13px] ${state === "done" ? "text-muted-foreground" : "font-medium"}`}>{s.title}</div>
                <div className="text-[11px] tabular-nums text-muted-foreground">{s.startTime} – {s.endTime}</div>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${state === "live" ? "bg-green-500/10 text-green-600 dark:text-green-400" : state === "next" ? "bg-violet-500/10 text-violet-600 dark:text-violet-400" : "bg-secondary text-muted-foreground"}`}>
                {state === "live" ? "진행 중" : state === "next" ? (s.type === "qa" ? "다음 · Q&A" : "다음") : state === "done" ? "완료" : "예정"}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const DRAWER_SPRING = { type: "spring", stiffness: 420, damping: 34 } as const;

// 인터랙션 — 통합 송출 카드. 타입별 현재/활성 항목을 토글 행으로, 활성 투표는 실시간 결과 프리뷰.
// 생성/편집·알림 발송은 헤더 ⚙(또는 하단 버튼)으로 여는 우측 설정 드로어(세그먼트 탭)에서.
function BroadcastCard({ webinarId, tick = 0, sections }: { webinarId: string; tick?: number; sections: { key: string; label: string; icon: typeof Bell; render: (open: boolean) => ReactNode }[] }) {
  const [polls, setPolls] = useState<AdminPoll[]>([]);
  const [anns, setAnns] = useState<{ id: string; message: string; isActive: boolean }[]>([]);
  const [popups, setPopups] = useState<{ id: string; title: string; isActive: boolean }[]>([]);
  const [tallies, setTallies] = useState<{ id: string; title: string; isActive: boolean }[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const openDrawer = () => { setHasOpened(true); setDrawerOpen(true); };
  const [activeSection, setActiveSection] = useState(sections[0]?.key ?? "");
  // 최초 열람 후 유지(mount-on-first-view) — 드로어 열 때 안 본 탭까지 즉시 fetch 하지 않게 방문한 섹션만 마운트.
  const [visited, setVisited] = useState<string[]>(() => (sections[0]?.key ? [sections[0].key] : []));
  const selectSection = (key: string) => { setActiveSection(key); setVisited((v) => (v.includes(key) ? v : [...v, key])); };
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const mut = useRef(false);

  const fetchAll = useCallback(async () => {
    const safe = async (url: string, key: string) => { try { const r = await fetch(url); if (!r.ok) return []; return (await r.json())[key] ?? []; } catch { return []; } };
    const [p, a, pu, t] = await Promise.all([
      safe(`/api/webinars/${webinarId}/polls`, "polls"),
      safe(`/api/webinars/${webinarId}/announcements`, "announcements"),
      safe(`/api/webinars/${webinarId}/popups`, "popups"),
      safe(`/api/webinars/${webinarId}/tally-pushes`, "tallyPushes"),
    ]);
    setPolls(p); setAnns(a); setPopups(pu); setTallies(t);
  }, [webinarId]);
  useEffect(() => { void fetchAll(); }, [fetchAll]);
  useEffect(() => { if (tick > 0 && !mut.current) void fetchAll(); }, [tick, fetchAll]);

  const patch = async (seg: string, id: string, isActive: boolean, name: string) => {
    mut.current = true;
    try {
      const res = await fetch(`/api/webinars/${webinarId}/${seg}/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive }),
      });
      if (!res.ok) { toast.error(res.status === 409 ? "다른 항목이 방금 켜졌어요. 새로고침 후 다시 시도해주세요." : "변경에 실패했어요"); return; }
      toast.success(isActive ? `${name} 송출 시작` : `${name} 송출 종료`);
      await fetchAll();
    } finally { mut.current = false; }
  };

  // 드로어 접근성 — 열 때 패널로 포커스 진입 + Tab 트랩 + Esc 닫기 + 스크롤 잠금, 닫힐 때 여닫은 요소로 포커스 복원.
  const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  useEffect(() => {
    if (!drawerOpen) return;
    previousFocusRef.current = (document.activeElement as HTMLElement) ?? null;
    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      (panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel).focus();
    }, 0);
    // 패널에 바운드(버블) — 포커스가 드로어 안일 때만 Esc/Tab 처리. 편집 패널이 여는 중첩 확인창(별도 포털,
    // 패널 DOM 밖)에서 Esc 를 누르면 이 리스너가 아니라 확인창 자신의 핸들러가 처리 → 드로어 오폭발 방지.
    const panel = panelRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); setDrawerOpen(false); return; }
      if (e.key === "Tab" && panelRef.current) {
        const f = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (f.length === 0) { e.preventDefault(); panelRef.current.focus(); return; }
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    panel?.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(focusTimer);
      panel?.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previousFocusRef.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerOpen]);

  const activePoll = polls.find((p) => p.isActive) ?? null;
  const rows = [
    { seg: "polls", icon: BarChart3, tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400", name: "실시간 투표", cur: activePoll ?? polls[0] ?? null, summary: (activePoll ?? polls[0])?.question ?? "등록된 투표 없음" },
    { seg: "announcements", icon: Megaphone, tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400", name: "공지", cur: anns.find((a) => a.isActive) ?? anns[0] ?? null, summary: (anns.find((a) => a.isActive) ?? anns[0])?.message ?? "등록된 공지 없음" },
    { seg: "popups", icon: MessageSquarePlus, tone: "bg-secondary text-muted-foreground", name: "팝업", cur: popups.find((p) => p.isActive) ?? popups[0] ?? null, summary: (popups.find((p) => p.isActive) ?? popups[0])?.title ?? "등록된 팝업 없음" },
    { seg: "tally-pushes", icon: Bell, tone: "bg-secondary text-muted-foreground", name: "Tally 설문", cur: tallies.find((t) => t.isActive) ?? tallies[0] ?? null, summary: (tallies.find((t) => t.isActive) ?? tallies[0])?.title ?? "등록된 설문 없음" },
  ] as const;
  const activeCount = rows.filter((r) => r.cur && (r.cur as { isActive: boolean }).isActive).length;

  return (
    <>
    <section className="flex h-[76vh] flex-col overflow-hidden rounded-2xl border border-border bg-card lg:h-[620px]">
      <div className="flex shrink-0 items-center gap-2 border-b border-border p-4 sm:px-5">
        <MessageSquarePlus className="h-4 w-4 text-violet-500" />
        <h2 className="text-sm font-semibold">인터랙션</h2>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${activeCount ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-secondary text-muted-foreground"}`}>{activeCount ? `${activeCount}개 송출 중` : "대기"}</span>
        <button type="button" onClick={openDrawer} aria-label="인터랙션 설정" className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
          <Settings className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        {rows.map((r) => {
          const cur = r.cur as { id: string; isActive: boolean } | null;
          return (
            <div key={r.seg} className="flex items-center gap-3 border-b border-border/60 py-3 last:border-0">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${r.tone}`}><r.icon className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium">{r.name}</div>
                <div className="truncate text-[11px] text-muted-foreground">{r.summary}</div>
              </div>
              {cur ? (
                <button onClick={() => patch(r.seg, cur.id, !cur.isActive, r.name)} role="switch" aria-checked={cur.isActive} aria-label={`${r.name} 송출`}
                  className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors ${cur.isActive ? "bg-violet-500" : "bg-secondary border border-border"}`}>
                  <span className={`absolute top-[2px] h-[16px] w-[16px] rounded-full bg-white shadow transition-all ${cur.isActive ? "left-[18px]" : "left-[3px]"}`} />
                </button>
              ) : (
                <span className="shrink-0 text-[10px] text-muted-foreground">설정에서 추가</span>
              )}
            </div>
          );
        })}

        {activePoll && (
          <div className="mt-3 rounded-xl border border-border bg-secondary/30 p-3">
            <div className="text-xs font-semibold">{activePoll.question}</div>
            <div className="mb-2 mt-0.5 text-[11px] text-muted-foreground">실시간 집계 · 응답 {activePoll.options.reduce((s, o) => s + o.voteCount, 0).toLocaleString()}표</div>
            {(() => {
              const total = activePoll.options.reduce((s, o) => s + o.voteCount, 0) || 1;
              return activePoll.options.map((o) => {
                const pct = Math.round((o.voteCount / total) * 100);
                return (
                  <div key={o.id} className="mb-1.5 last:mb-0">
                    <div className="flex justify-between gap-2 text-[11px]"><span className="truncate">{o.label}</span><span className="shrink-0 tabular-nums text-muted-foreground">{o.voteCount}표 · {pct}%</span></div>
                    <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-card"><div className="h-full rounded-full bg-violet-500" style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>
      <button onClick={openDrawer} className="flex shrink-0 w-full items-center justify-between border-t border-border px-4 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:px-5">
        <span>콘텐츠 관리 · 만들기 / 편집</span>
        <Settings className="h-4 w-4" />
      </button>
    </section>

    {typeof document !== "undefined" && hasOpened && createPortal(
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: drawerOpen ? 1 : 0 }} transition={{ duration: 0.15 }}
        className={`fixed inset-0 z-50 flex bg-black/50 backdrop-blur-sm ${drawerOpen ? "" : "pointer-events-none"}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden={!drawerOpen}
        inert={!drawerOpen}
      >
        <motion.div
          ref={panelRef} tabIndex={-1}
          initial={{ x: "100%" }} animate={{ x: drawerOpen ? 0 : "100%" }} transition={DRAWER_SPRING}
          className="ml-auto flex h-full w-full max-w-lg flex-col bg-background shadow-2xl outline-none"
          onClick={(e) => e.stopPropagation()}
          role="dialog" aria-modal="true" aria-label="인터랙션 설정"
        >
            <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-violet-500" />
                <h2 className="text-sm font-semibold">인터랙션 설정</h2>
              </div>
              <motion.button
                whileHover={{ rotate: 90 }} whileTap={{ scale: 0.9 }} transition={DRAWER_SPRING}
                onClick={() => setDrawerOpen(false)} aria-label="닫기"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary"
              >
                <X className="h-4 w-4" />
              </motion.button>
            </div>
            <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-5 py-2">
              {sections.map((s) => (
                <button
                  key={s.key} type="button" aria-pressed={activeSection === s.key} onClick={() => selectSection(s.key)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${activeSection === s.key ? "bg-violet-500 text-white" : "text-muted-foreground hover:bg-secondary"}`}
                >
                  <s.icon className="h-3.5 w-3.5" />{s.label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
              {sections.map((s) => (visited.includes(s.key) ? (
                <div key={s.key} className={activeSection === s.key ? "" : "hidden"}>{s.render(drawerOpen)}</div>
              ) : null))}
            </div>
          </motion.div>
        </motion.div>,
      document.body,
    )}
    </>
  );
}

export default function LiveConsoleTab({
  webinarId,
  webinar,
  onNavigate,
}: {
  webinarId: string;
  webinar?: WebinarForConsole;
  onNavigate?: (target: string) => void;
}) {
  const confirm = useConfirm();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  // 라이브 폴링 tick — 대시보드 적응형 주기(라이브 15초/평시 90초, 탭 숨김 스킵)에 맞춰 증가시켜,
  // 투표 집계·채팅 모더레이션 피드가 별도 타이머 없이 같은 주기로 갱신되게 한다.
  const [liveTick, setLiveTick] = useState(0);
  const [curve, setCurve] = useState<CurveData | null>(null);
  const [curveRange, setCurveRange] = useState("all");
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [syncAt, setSyncAt] = useState<number>(() => Date.now());
  // 시청자 채팅 on/off — 콘솔 프로퍼티(components.chatEnabled)로 초기화, 헤더 스위치로 낙관적 토글.
  const [chatOn, setChatOn] = useState<boolean>(
    () => (webinar?.components as { chatEnabled?: boolean } | null | undefined)?.chatEnabled === true,
  );
  const toggleChatOn = () => {
    const next = !chatOn;
    setChatOn(next);
    fetch(`/api/webinars/${webinarId}/chat`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatEnabled: next }),
    })
      .then((r) => { if (!r.ok) throw new Error(); toast.success(next ? "시청자 채팅을 켰어요" : "시청자 채팅을 껐어요"); })
      .catch(() => { setChatOn(!next); toast.error("변경에 실패했어요"); });
  };
  const statusRef = useRef<WebinarStatus>("registration");

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch(`/api/webinars/${webinarId}/dashboard`);
      if (!res.ok) return;
      const next: DashboardData = await res.json();
      statusRef.current = next.status;
      setData(next);
      setSyncAt(Date.now());
    } catch {
      /* 일시적 네트워크 오류 — 폴링 루프가 죽지 않도록 삼킴(다음 주기 재시도) */
    } finally {
      setIsLoading(false);
    }
  }, [webinarId]);

  // 동시 접속 추이(차트·미니 스파크라인) + 운영 로그 — 대시보드와 같은 폴링 주기로 갱신
  const fetchCurve = useCallback(async () => {
    try { const res = await fetch(`/api/webinars/${webinarId}/analytics/attendance-curve?range=${curveRange}`); if (res.ok) setCurve(await res.json()); } catch { /* 다음 주기 재시도 */ }
  }, [webinarId, curveRange]);
  const fetchActivity = useCallback(async () => {
    try { const res = await fetch(`/api/webinars/${webinarId}/activity`); if (res.ok) setActivity((await res.json()).items ?? []); } catch { /* 다음 주기 재시도 */ }
  }, [webinarId]);

  // 적응형 폴링 — 라이브 15초 / 평시 90초, 탭 숨김 시 건너뜀
  useEffect(() => {
    void fetchDashboard(); void fetchCurve(); void fetchActivity();
    let timer: ReturnType<typeof setTimeout>;
    let ticks = 0;
    const schedule = () => {
      timer = setTimeout(async () => {
        if (!document.hidden) {
          await fetchDashboard();
          void fetchActivity();
          // 동시접속 곡선은 5분 버킷이라 매 틱(라이브 15초) 재조회는 낭비 — 4틱(≈60초)마다만
          if (ticks % 4 === 0) void fetchCurve();
          ticks += 1;
          setLiveTick((t) => t + 1);
        }
        schedule();
      }, statusRef.current === "live" ? 15_000 : 90_000);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [fetchDashboard, fetchCurve, fetchActivity]);

  const setOverride = async (value: WebinarStatus | null) => {
    if (switching) return;
    // 공개 아임웹 사이트를 즉시 바꾸는 고영향 전환(라이브 시작·종료)은 오조작 방지를 위해 확인
    const confirmCfg =
      value === "live"
        ? { title: "'라이브'로 전환할까요?", description: "아임웹의 버튼·배너가 즉시 라이브 모드로 바뀌고, 등록자에게 시청 화면이 열려요.", confirmLabel: "라이브 시작", tone: "danger" as const }
        : value === "ended"
          ? { title: "'종료'로 전환할까요?", description: "아임웹의 버튼·배너가 즉시 종료 모드로 바뀌어요.", confirmLabel: "종료", tone: "danger" as const }
          : null;
    if (confirmCfg && !(await confirm(confirmCfg))) return;
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
  // 활동 로그 → 차트 이벤트 마커(KST 분 단위). 최근 8건.
  const chartEvents = activity
    .filter((a) => CHART_EVENT_ACTIONS.has(a.action))
    .slice(0, 8)
    .map((a) => { const d = new Date(a.at); return { min: ((d.getUTCHours() + 9) % 24) * 60 + d.getUTCMinutes(), label: a.label }; });

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

  // ── 레이아웃 사이 재사용 블록 (라이브=2×2 그리드 / 그 외=단일 컬럼) ──
  const pushGroup = (
    <>
      <Section title="공지" icon={Megaphone} defaultOpen={status === "live"}>
        <AnnouncementsTab webinarId={webinarId} embedded />
      </Section>
      <Section title="팝업 푸시" icon={MessageSquarePlus}>
        <PopupPanel webinarId={webinarId} />
      </Section>
      <Section title="실시간 투표" icon={BarChart3} defaultOpen={status === "live"}>
        <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
          우하단에 떠 있는 실시간 투표예요. ON 상태 1개만 표시되고 집계는 자동으로 갱신돼요.
        </p>
        <PollPanel webinarId={webinarId} tick={liveTick} />
      </Section>
    </>
  );

  const participationGroup = (
    <>
      <Section
        title="Q&A 모더레이션"
        icon={HelpCircle}
        defaultOpen={false}
        badge={summary && summary.pendingQuestions > 0 ? (
          <span className="rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-500">{summary.pendingQuestions}</span>
        ) : undefined}
      >
        <QATab webinarId={webinarId} embedded tick={liveTick} />
      </Section>
      <Section title="실시간 채팅" icon={MessageSquare} defaultOpen={false}>
        <ChatPanel webinarId={webinarId} tick={liveTick} />
      </Section>
    </>
  );

  const sendGroup = (
    <>
      <Section title="Tally 설문 푸시" icon={Bell}>
        <TallyPanel webinarId={webinarId} />
      </Section>
      <Section title="알림 발송" icon={Mail}>
        <ReminderPanel webinarId={webinarId} />
      </Section>
    </>
  );

  const viewerSection = (
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
              <AnimatePresence initial={false}>
                {viewers.map((viewer) => (
                  <motion.tr
                    key={viewer.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="border-b border-border/40 last:border-0"
                  >
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
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );

  const activityLog = (
    <>
      <GroupLabel>운영 로그</GroupLabel>
      <ActivityFeed items={activity} />
    </>
  );

  // 인터랙션 설정 드로어 섹션 — 화면에 뜨는 것(공지·팝업·투표·Tally)과 알림 발송을 한 곳에서 만들기/편집.
  // render(open) — 드로어를 닫아도 패널을 마운트 유지(재조회 방지)하되, PollPanel 폴링은 open=false 면 tick=0 으로 멈춤.
  const interactionSections = [
    { key: "announcements", label: "공지", icon: Megaphone, render: () => <AnnouncementsTab webinarId={webinarId} embedded /> },
    { key: "popups", label: "팝업", icon: MessageSquarePlus, render: () => <PopupPanel webinarId={webinarId} /> },
    {
      key: "polls", label: "투표", icon: BarChart3, render: (open: boolean) => (
        <>
          <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">우하단에 떠 있는 실시간 투표예요. ON 상태 1개만 표시되고 집계는 자동으로 갱신돼요.</p>
          <PollPanel webinarId={webinarId} tick={open ? liveTick : 0} />
        </>
      ),
    },
    { key: "tally", label: "Tally", icon: Bell, render: () => <TallyPanel webinarId={webinarId} /> },
    { key: "reminders", label: "알림", icon: Mail, render: () => <ReminderPanel webinarId={webinarId} /> },
  ];

  const runningOrder = <RunningOrder sessions={webinar?.sessions ?? []} />;

  // 라이브 2행 좌우 — 480px 고정 높이, 헤더 고정 + 내부만 스크롤(fillHeight)
  const qaCard = (
    <section className="flex h-[76vh] flex-col overflow-hidden rounded-2xl border border-border bg-card lg:h-[620px]">
      <div className="flex shrink-0 items-center gap-2 border-b border-border p-4 sm:px-5">
        <HelpCircle className="h-4 w-4 text-violet-500" />
        <h2 className="text-sm font-semibold">Q&amp;A 대기열</h2>
        {summary && summary.pendingQuestions > 0 && (
          <span className="rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-500">{summary.pendingQuestions}</span>
        )}
        <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">추천순</span>
      </div>
      <div className="min-h-0 flex-1 p-4 sm:p-5">
        <QATab webinarId={webinarId} embedded fillHeight tick={liveTick} />
      </div>
    </section>
  );

  const chatCard = (
    <section className="flex h-[76vh] flex-col overflow-hidden rounded-2xl border border-border bg-card lg:h-[620px]">
      <div className="flex shrink-0 items-center gap-2 border-b border-border p-4 sm:px-5">
        <MessageSquare className="h-4 w-4 text-violet-500" />
        <h2 className="text-sm font-semibold">채팅 모더레이션</h2>
        <div className="ml-auto flex items-center gap-2">
          <span className={`text-[11px] font-medium ${chatOn ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>{chatOn ? "켜짐" : "꺼짐"}</span>
          <Switch on={chatOn} onClick={toggleChatOn} label="시청자 채팅 켜기/끄기" />
        </div>
      </div>
      <div className="min-h-0 flex-1 p-4 sm:p-5">
        <ChatPanel webinarId={webinarId} tick={liveTick} fillHeight />
      </div>
    </section>
  );

  // 종료 요약 — 사용 가능한 실데이터(누적 입장·평균 체류·피크·입장률)로 목업 recapgrid 재현
  const recapCard = status === "ended" && summary && (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border p-4 sm:px-5">
        <h2 className="text-sm font-semibold">방송 요약</h2>
        <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">종료됨</span>
      </div>
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        {([
          { l: "누적 입장", v: summary.attended.toLocaleString() },
          { l: "평균 체류", v: `${summary.avgStayMinutes}분` },
          { l: "피크 동시", v: (curve?.peak ?? 0).toLocaleString() },
          { l: "입장률", v: `${summary.attendRate}%` },
        ]).map((r) => (
          <div key={r.l} className="bg-card p-4">
            <div className="text-[11px] text-muted-foreground">{r.l}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{r.v}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border p-4 sm:px-5">
        <button onClick={() => onNavigate?.("operate-registrants")} className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium transition-colors hover:bg-secondary">등록자 내보내기 (CSV) →</button>
        <span className="text-[11px] text-muted-foreground">다시보기·설문 발송은 아래 &lsquo;발송&rsquo;에서 이어서 진행하세요.</span>
      </div>
    </section>
  );

  const checklist = showChecklist && (
    <section className="rounded-2xl border border-border bg-secondary/20 p-4">
      <h3 className="text-sm font-semibold">라이브 전 준비</h3>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { done: hasRegistrationForm, icon: ClipboardList, label: "등록 폼 정리", target: "create-registration" },
          { done: (summary?.totalRegistered ?? 0) > 0, icon: Users, label: "등록자 확보", target: "operate-registrants" },
          { done: hasSessions, icon: ListChecks, label: "세션 구성", target: "create-sessions" },
          { done: hasVideo, icon: Eye, label: "라이브 영상 연결", target: "create-livepage" },
        ].map((item) => (
          <motion.button
            key={item.label}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.96 }}
            transition={spring}
            onClick={() => onNavigate?.(item.target)}
            className={`flex items-center gap-2 rounded-xl border p-3 text-left text-xs transition-colors hover:border-violet-400/40 ${
              item.done ? "border-green-500/30 bg-green-500/[0.04]" : "border-border bg-background"
            }`}
          >
            <item.icon className={`h-4 w-4 shrink-0 ${item.done ? "text-green-500" : "text-muted-foreground"}`} />
            <span className={item.done ? "text-muted-foreground line-through" : ""}>{item.label}</span>
          </motion.button>
        ))}
      </div>
    </section>
  );

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4">
      {/* 상태(커맨드) 바 */}
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${meta.tone}`}>{meta.label}</span>
            {isOverridden && (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                수동 전환됨
              </span>
            )}
            <motion.button whileHover={{ rotate: 90 }} whileTap={{ scale: 0.9 }} transition={spring} onClick={() => { void fetchDashboard(); void fetchCurve(); void fetchActivity(); }} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary" aria-label="새로고침">
              <RefreshCw className="h-3.5 w-3.5" />
            </motion.button>
            <FreshBadge syncAt={syncAt} />
            {status === "live" && <LiveClock startAt={webinar?.liveStartAt} endAt={webinar?.liveEndAt} />}
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-border bg-background p-1">
            {overrideOptions.map((option) => {
              const selected = option.value === null ? !isOverridden : isOverridden && status === option.value;
              return (
                <motion.button
                  key={option.label}
                  whileTap={{ scale: 0.96 }}
                  transition={spring}
                  onClick={() => setOverride(option.value)}
                  disabled={switching || selected}
                  className={`relative rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-default ${
                    selected ? "text-white" : "text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {selected && (
                    <motion.span
                      layoutId="live-status-seg"
                      transition={spring}
                      className="absolute inset-0 rounded-lg bg-violet-500"
                      style={{ zIndex: 0 }}
                    />
                  )}
                  <span className="relative z-10">{option.label}</span>
                </motion.button>
              );
            })}
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          상태는 아임웹의 버튼·배너·등록 폼에 자동 반영돼요. 수동 전환 후 &ldquo;자동&rdquo;을 누르면 일정 기반 판정으로 돌아가요.
        </p>
      </section>

      {/* 실시간 지표 — 통합 스트립(현재 시청 강조 + 미니 스파크). 종료 상태에선 recap 카드가 대신함 */}
      {summary && status !== "ended" && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="text-[11px] text-muted-foreground">현재 시청</div>
            <div className="mt-1 flex items-end gap-2">
              <span className="text-3xl font-semibold leading-none tabular-nums">{summary.activeViewers.toLocaleString()}</span>
              <div className="h-7 min-w-[48px] flex-1"><Sparkline values={(curve?.points ?? []).map((p) => p.viewers)} /></div>
            </div>
            <div className="mt-1.5 text-[11px] text-muted-foreground">최근 90초{curve?.peak ? ` · 피크 ${curve.peak.toLocaleString()}` : ""}</div>
          </div>
          {([
            { l: "입장률", v: `${summary.attendRate}`, u: "%", bar: summary.attendRate },
            { l: "입장", v: summary.attended.toLocaleString(), sub: `사전등록 ${summary.totalRegistered.toLocaleString()}` },
            { l: "페이지 유지", v: summary.presenceViewers.toLocaleString(), sub: "최근 5분" },
            { l: "평균 체류", v: `${summary.avgStayMinutes}`, u: "분" },
            { l: "대기 질문", v: summary.pendingQuestions.toLocaleString(), attn: summary.pendingQuestions > 0 },
          ] as { l: string; v: string; u?: string; sub?: string; bar?: number; attn?: boolean }[]).map((s) => (
            <div key={s.l} className="flex flex-col gap-1.5 rounded-2xl border border-border bg-card p-4">
              <span className="text-[11px] text-muted-foreground">{s.l}</span>
              <span className={`text-2xl font-semibold leading-none tabular-nums ${s.attn ? "text-amber-500" : ""}`}>{s.v}{s.u && <span className="ml-0.5 text-sm font-medium text-muted-foreground">{s.u}</span>}</span>
              {s.bar != null ? (
                <div className="h-1 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-green-500" style={{ width: `${s.bar}%` }} /></div>
              ) : (
                <span className="text-[11px] text-muted-foreground">{s.sub ?? " "}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {status === "live" ? (
        <>
          {/* 라이브 1행: 동시 접속 추이 + 러닝오더 (같은 줄 높이 일치) */}
          <div className="grid items-stretch gap-4 lg:grid-cols-[1.6fr_1fr]">
            <ViewerChart curve={curve} events={chartEvents} range={curveRange} onRangeChange={setCurveRange} />
            {runningOrder}
          </div>

          {/* 라이브 2행: 화면에 띄우기(통합 송출 카드) · Q&A 대기열 · 채팅 모더레이션 (높이 일치) */}
          <div className="grid gap-4 lg:grid-cols-3">
            <BroadcastCard webinarId={webinarId} tick={liveTick} sections={interactionSections} />
            {qaCard}
            {chatCard}
          </div>

          {/* 시청자·운영 로그 — 라이브 작업 영역 아래로 (발송·편집은 인터랙션 카드의 설정 드로어로 이동) */}
          {viewerSection}
          {activityLog}
        </>
      ) : (
        <>
          {recapCard}
          {status === "ended" && <ViewerChart curve={curve} events={chartEvents} range={curveRange} onRangeChange={setCurveRange} />}
          {checklist}
          {runningOrder}

          {/* ── 화면에 띄우기 — 시청 화면 위에 뜨는 것. 한 번에 하나만(팝업 우선). ── */}
          <GroupLabel>인터랙션 · 한 번에 하나만</GroupLabel>
          {pushGroup}

          {/* ── 참여 관리 — 시청자가 남긴 것 관리 ── */}
          <GroupLabel>참여 관리</GroupLabel>
          {participationGroup}

          {/* ── 발송 — 외부 설문·이메일 내보내기 ── */}
          <GroupLabel>발송</GroupLabel>
          {sendGroup}
          {viewerSection}
          {activityLog}
        </>
      )}
    </div>
  );
}
