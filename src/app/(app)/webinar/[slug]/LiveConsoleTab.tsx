"use client";

// 운영 콘솔 — 라이브 당일의 단일 화면.
// 상태 수동 전환 / KPI / 공지·Q&A·팝업·Tally 발행 / 접속자.
// 폴링은 상태 적응형: 라이브 15초, 평시 90초 (+ 탭 숨김 가드) — egress 배려.

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  Bell,
  ChevronDown,
  ClipboardList,
  Eye,
  HelpCircle,
  ListChecks,
  Loader2,
  Mail,
  Megaphone,
  MessageSquare,
  MessageSquarePlus,
  RefreshCw,
  Users,
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
  sessions: { id: string }[];
  _count: { registrations: number };
}

// 상태 라벨·톤은 lib/webinar-status 의 WEBINAR_STATUS_META 단일 정의 사용
const STATUS_META = WEBINAR_STATUS_META;

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
    <section className="rounded-2xl border border-border bg-card">
      <motion.button
        whileTap={{ scale: 0.99 }}
        transition={spring}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-3 p-4 text-left sm:px-5"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4 text-violet-500" /> {title} {badge}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
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

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="rounded-xl border border-border bg-background px-3.5 py-3"
    >
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-muted-foreground">{sub}</p>}
    </motion.div>
  );
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
          <AnimatePresence initial={false}>
            {popups.map((popup) => (
              <motion.div
                key={popup.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${popup.isActive ? "border-violet-500/40 bg-violet-500/[0.04]" : "border-border"}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {popup.isActive && <span className="mr-1.5 rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-500">ON</span>}
                    {popup.title}
                  </p>
                  {popup.message && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{popup.message}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <motion.button whileTap={{ scale: 0.9 }} transition={spring} onClick={() => toggle(popup)} className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${popup.isActive ? "border-border text-muted-foreground hover:bg-secondary" : "border-violet-500/40 text-violet-500 hover:bg-violet-500/10"}`}>
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
          <AnimatePresence initial={false}>
            {pushes.map((push) => (
              <motion.div
                key={push.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${push.isActive ? "border-violet-500/40 bg-violet-500/[0.04]" : "border-border"}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {push.isActive && <span className="mr-1.5 rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-500">ON</span>}
                    {push.title}
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">{push.formId}</span>
                  </p>
                  {push.memo && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{push.memo}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <motion.button whileTap={{ scale: 0.9 }} transition={spring} onClick={() => toggle(push)} className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${push.isActive ? "border-border text-muted-foreground hover:bg-secondary" : "border-violet-500/40 text-violet-500 hover:bg-violet-500/10"}`}>
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
function PollPanel({ webinarId }: { webinarId: string }) {
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

  const inputCls = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-violet-400";

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
          <motion.button whileTap={{ scale: 0.97 }} onClick={create} disabled={!question.trim() || options.filter((o) => o.trim()).length < 2 || busy}
            className="rounded-xl bg-violet-500 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-violet-600 disabled:opacity-50">
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
                  className={`rounded-xl border p-3 ${poll.isActive ? "border-violet-500/40 bg-violet-500/[0.04]" : "border-border"}`}
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
                            {poll.isActive && <span className="mr-1.5 rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-500">ON</span>}
                            {poll.question}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{poll.options.length}개 선택지 · 총 {total}표</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <motion.button whileTap={{ scale: 0.9 }} transition={spring} onClick={() => toggle(poll)} className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${poll.isActive ? "border-border text-muted-foreground hover:bg-secondary" : "border-violet-500/40 text-violet-500 hover:bg-violet-500/10"}`}>
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
  createdAt: string;
}

function ChatPanel({ webinarId }: { webinarId: string }) {
  const confirm = useConfirm();
  const [messages, setMessages] = useState<AdminChatMessage[]>([]);
  const [hostMsg, setHostMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchMessages = useCallback(async () => {
    const res = await fetch(`/api/webinars/${webinarId}/chat`);
    if (res.ok) setMessages((await res.json()).messages ?? []);
    setLoading(false);
  }, [webinarId]);
  useEffect(() => { void fetchMessages(); }, [fetchMessages]);

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

  const inputCls = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-violet-400";

  return (
    <div className="space-y-4">
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        시청자 채팅은 <b className="font-semibold text-foreground">설정 → 실시간 참여 → 채팅 탭 사용</b>을 켜야 시청 화면에 보여요. 여기선 운영자 발언과 메시지 삭제(모더레이션)를 할 수 있어요.
      </p>
      <div className="flex gap-2">
        <input
          value={hostMsg}
          onChange={(e) => setHostMsg(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) void sendHost(); }}
          placeholder="운영자(HOST)로 메시지 보내기"
          className={inputCls}
        />
        <motion.button whileTap={{ scale: 0.97 }} onClick={sendHost} disabled={!hostMsg.trim() || busy}
          className="shrink-0 rounded-xl bg-violet-500 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-violet-600 disabled:opacity-50">
          보내기
        </motion.button>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">최근 100개</p>
        <button onClick={() => void fetchMessages()} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground">
          <RefreshCw className="h-3 w-3" /> 새로고침
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">불러오는 중…</p>
      ) : messages.length === 0 ? (
        <p className="text-xs text-muted-foreground">아직 채팅 메시지가 없어요.</p>
      ) : (
        <div className="max-h-80 space-y-1.5 overflow-y-auto">
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="flex items-start justify-between gap-3 rounded-xl border border-border p-2.5"
              >
                <div className="min-w-0 text-xs">
                  <span className={`mr-1.5 font-semibold ${m.isHost ? "text-red-500" : "text-foreground"}`}>
                    {m.isHost && <span className="mr-1 rounded bg-red-500/10 px-1 py-0.5 text-[9px]">HOST</span>}
                    {m.name}
                  </span>
                  <span className="text-muted-foreground">{formatKst(m.createdAt, { hour: "2-digit", minute: "2-digit" })}</span>
                  <p className="mt-0.5 break-words text-foreground">{m.message}</p>
                </div>
                <motion.button whileTap={{ scale: 0.9 }} transition={spring} onClick={() => remove(m)}
                  className="shrink-0 rounded-lg border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500">
                  삭제
                </motion.button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
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

  const inputCls = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-violet-400";

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
            className="rounded-xl bg-violet-500 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-violet-600 disabled:opacity-50">
            {busy ? "발송 중…" : `구독자 ${count}명에게 발송`}
          </motion.button>
        </div>
      </div>
    </div>
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
            <motion.button whileHover={{ rotate: 90 }} whileTap={{ scale: 0.9 }} transition={spring} onClick={() => void fetchDashboard()} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary" aria-label="새로고침">
              <RefreshCw className="h-3.5 w-3.5" />
            </motion.button>
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

      {/* KPI — 폴링으로 갱신되므로 스크린리더에 변경을 알림 */}
      {summary && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-live="polite">
          <Kpi label="사전 등록" value={summary.totalRegistered.toLocaleString()} />
          <Kpi label="입장" value={summary.attended.toLocaleString()} sub={`입장률 ${summary.attendRate}%`} />
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

      {/* 푸시 두 종류의 관계·우선순위를 한 줄로 안내 (개념 중첩 해소) */}
      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        시청 화면에 띄우는 푸시는 <b className="font-semibold text-foreground">팝업</b>(안내·바로가기·설문 유도 카드)과 <b className="font-semibold text-foreground">Tally 설문</b>(설문 창 즉시 열기) 두 가지예요. 겹치지 않게 <b className="font-semibold text-foreground">한 번에 하나만</b> 표시되고, 팝업이 우선합니다.
      </p>

      <Section title="팝업 푸시" icon={MessageSquarePlus}>
        <PopupPanel webinarId={webinarId} />
      </Section>

      <Section title="Tally 설문 푸시" icon={Bell}>
        <TallyPanel webinarId={webinarId} />
      </Section>

      <Section title="실시간 투표" icon={BarChart3} defaultOpen={status === "live"}>
        <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
          팝업·설문과 별개로, 시청 화면 <b className="font-semibold text-foreground">우하단에 떠 있는</b> 실시간 투표예요. ON 상태 1개만 표시되고 집계는 자동으로 갱신돼요.
        </p>
        <PollPanel webinarId={webinarId} />
      </Section>

      <Section title="실시간 채팅" icon={MessageSquare} defaultOpen={status === "live"}>
        <ChatPanel webinarId={webinarId} />
      </Section>

      <Section title="알림 발송" icon={Mail}>
        <ReminderPanel webinarId={webinarId} />
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
    </div>
  );
}
