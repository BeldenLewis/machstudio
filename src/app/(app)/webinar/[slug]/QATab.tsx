"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, MessageSquare, Check, X, Clock, MonitorUp, MonitorOff } from "lucide-react";
import { toast } from "sonner";
import { formatKst } from "@/lib/datetime";
import { InlineError } from "@/components/ui/inline-error";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

type QAStatus = "pending" | "answered" | "dismissed";

interface QAItem {
  id: string;
  question: string;
  sessionNumber: number | null;
  status: QAStatus;
  name: string | null;
  company: string | null;
  voteCount: number;
  onScreen: boolean;
  createdAt: string;
}

export default function QATab({ webinarId, embedded = false, fillHeight = false, tick = 0 }: { webinarId: string; embedded?: boolean; fillHeight?: boolean; tick?: number }) {
  const [questions, setQuestions] = useState<QAItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<QAStatus | "all">("pending");
  // 진행 중 mutation 동안 사일런트 tick 폴링이 낙관적 갱신을 덮어쓰지 않게 가드(PollPanel editIdRef 패턴).
  const mutatingRef = useRef(false);

  const fetchQA = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("status", filter);
      const res = await fetch(`/api/webinars/${webinarId}/qa?${params}`);
      if (!res.ok) { setLoadError(true); return; }
      const data = await res.json();
      setQuestions(data.questions ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [webinarId, filter]);

  useEffect(() => { fetchQA(); }, [fetchQA]);
  // 라이브 주기(tick)마다 조용히 갱신 — 새 질문·상태변경이 목록에 자동 반영(채팅·투표 패널과 대칭). 스피너 없이 in-place.
  useEffect(() => { if (tick > 0 && !mutatingRef.current) void fetchQA(true); }, [tick, fetchQA]);

  const updateStatus = async (id: string, status: QAStatus) => {
    mutatingRef.current = true;
    try {
      const res = await fetch(`/api/webinars/${webinarId}/qa/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) { toast.error("상태 변경 실패"); return; }
      // 답변완료·미채택이면 송출도 함께 종료(서버와 일치)
      setQuestions((prev) => prev.map((q) => q.id === id ? { ...q, status, ...(status !== "pending" ? { onScreen: false } : {}) } : q));
    } finally { mutatingRef.current = false; }
  };

  // 화면에 띄우기 — 웨비나당 1개만(단일 활성). 켜면 나머지는 자동으로 꺼진다.
  const setOnScreen = async (id: string, onScreen: boolean) => {
    mutatingRef.current = true;
    try {
      const res = await fetch(`/api/webinars/${webinarId}/qa/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ onScreen }),
      });
      if (!res.ok) { toast.error(onScreen ? "송출하지 못했어요" : "송출을 끄지 못했어요"); return; }
      setQuestions((prev) => prev.map((q) => q.id === id ? { ...q, onScreen } : (onScreen ? { ...q, onScreen: false } : q)));
      if (onScreen) toast.success("시청 화면에 띄웠어요");
    } finally { mutatingRef.current = false; }
  };

  // 키보드 트리아지 — 목록에 마우스를 올린 동안만 활성(전역 방향키 가로채기 방지).
  // ↑↓ 이동 · Enter 답변완료 · ⌫ 미채택
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [kbActive, setKbActive] = useState(false);
  // 추천순 정렬(voteCount desc, 동점은 먼저 올라온 순) — 렌더와 키보드 트리아지가 같은 배열을 본다.
  const ordered = [...questions].sort((a, b) => (b.voteCount - a.voteCount) || (a.createdAt < b.createdAt ? -1 : 1));
  const maxVote = ordered.reduce((m, q) => Math.max(m, q.voteCount), 0);
  // 포커스는 순번이 아니라 질문 id 로 추적 — 라이브 득표로 재정렬돼도 대상이 바뀌지 않는다(-1=미포커스).
  const focusIdx = ordered.findIndex((q) => q.id === focusedId);
  useEffect(() => {
    if (!kbActive || !ordered.length) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const tag = el?.tagName;
      // 텍스트 입력에는 절대 개입하지 않음. 버튼/링크는 Enter(네이티브 활성 키)만 양보하고 화살표 이동은 허용.
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      const cur = ordered.findIndex((q) => q.id === focusedId);
      if (e.key === "ArrowDown") { e.preventDefault(); const n = cur < 0 ? 0 : Math.min(ordered.length - 1, cur + 1); setFocusedId(ordered[n]?.id ?? null); }
      else if (e.key === "ArrowUp") { e.preventDefault(); const n = cur < 0 ? 0 : Math.max(0, cur - 1); setFocusedId(ordered[n]?.id ?? null); }
      else if (e.key === "Enter") { if (tag === "BUTTON" || tag === "A") return; const q = ordered.find((x) => x.id === focusedId); if (q?.status === "pending") { e.preventDefault(); void updateStatus(q.id, "answered"); } }
      else if (e.key === "Backspace") { const q = ordered.find((x) => x.id === focusedId); if (q?.status === "pending") { e.preventDefault(); void updateStatus(q.id, "dismissed"); } }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [kbActive, questions, focusedId]);

  const filters: { value: QAStatus | "all"; label: string }[] = [
    { value: "pending", label: "대기 중" },
    { value: "answered", label: "답변 완료" },
    { value: "dismissed", label: "미채택" },
    { value: "all", label: "전체" },
  ];

  return (
    <div className={fillHeight ? "flex h-full min-h-0 flex-col gap-3" : embedded ? "space-y-4" : "p-4 sm:p-6 lg:p-8 space-y-4"} onMouseEnter={() => setKbActive(true)} onMouseLeave={() => setKbActive(false)}>
      <div className="relative flex shrink-0 items-center gap-1">
        {filters.map(({ value, label }) => {
          const active = filter === value;
          return (
            <button
              key={value}
              onClick={(e) => { setFilter(value); e.currentTarget.blur(); }}
              className={`relative z-10 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                active ? "text-violet-500" : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="qa-filter-pill"
                  transition={spring}
                  className="absolute inset-0 -z-10 rounded-xl bg-violet-500/10"
                />
              )}
              {label}
            </button>
          );
        })}
        {questions.length > 0 && (
          <span className="ml-auto hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:inline-flex">
            <kbd className="rounded border border-border bg-secondary px-1 py-0.5 text-[10px]">↑↓</kbd> 이동
            <kbd className="rounded border border-border bg-secondary px-1 py-0.5 text-[10px]">↵</kbd> 답변
            <kbd className="rounded border border-border bg-secondary px-1 py-0.5 text-[10px]">⌫</kbd> 미채택
          </span>
        )}
      </div>

      <div className={fillHeight ? "min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5" : ""}>
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : loadError ? (
        <InlineError message="Q&A를 불러오지 못했어요" onRetry={() => fetchQA()} />
      ) : questions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <MessageSquare className="w-10 h-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">질문이 없어요</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
          {ordered.map((q, idx) => (
            <motion.div
              key={q.id}
              layout
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={spring}
              className={`p-4 rounded-2xl border bg-background space-y-2 ${idx === focusIdx && kbActive ? "border-violet-500 ring-2 ring-violet-500/30" : "border-border"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-sm">{q.question}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    {q.name && <span className="text-xs text-muted-foreground">{q.name}</span>}
                    {q.company && <span className="text-xs text-muted-foreground">· {q.company}</span>}
                    {q.sessionNumber && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">세션 {q.sessionNumber}</span>
                    )}
                    {q.voteCount > 0 && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium tabular-nums ${q.voteCount === maxVote ? "bg-violet-500 text-white" : "bg-violet-500/10 text-violet-500"}`}>▲ {q.voteCount}</span>
                    )}
                    {q.onScreen && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 font-medium">● 지금 답변 중</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatKst(q.createdAt, { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {q.onScreen ? (
                    <motion.button
                      whileTap={{ scale: 0.92 }}
                      transition={spring}
                      onClick={() => setOnScreen(q.id, false)}
                      className="p-1.5 rounded-lg bg-green-500/10 text-green-600 dark:text-green-400 transition-colors hover:bg-green-500/20"
                      title="송출 끄기"
                    >
                      <MonitorOff className="w-4 h-4" />
                    </motion.button>
                  ) : (
                    <motion.button
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.92 }}
                      transition={spring}
                      onClick={() => setOnScreen(q.id, true)}
                      className="p-1.5 rounded-lg text-muted-foreground transition-colors hover:bg-violet-500/10 hover:text-violet-500"
                      title="화면에 띄우기"
                    >
                      <MonitorUp className="w-4 h-4" />
                    </motion.button>
                  )}
                  {q.status === "pending" && (
                    <>
                      <motion.button
                        whileHover={{ y: -1 }}
                        whileTap={{ scale: 0.92 }}
                        transition={spring}
                        onClick={() => updateStatus(q.id, "answered")}
                        className="p-1.5 rounded-lg hover:bg-green-500/10 hover:text-green-500 text-muted-foreground transition-colors"
                        title="답변 완료"
                      >
                        <Check className="w-4 h-4" />
                      </motion.button>
                      <motion.button
                        whileHover={{ y: -1 }}
                        whileTap={{ scale: 0.92 }}
                        transition={spring}
                        onClick={() => updateStatus(q.id, "dismissed")}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 hover:text-red-500 text-muted-foreground transition-colors"
                        title="미채택"
                      >
                        <X className="w-4 h-4" />
                      </motion.button>
                    </>
                  )}
                  {q.status === "answered" && (
                    <motion.button
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.95 }}
                      transition={spring}
                      onClick={() => updateStatus(q.id, "pending")}
                      className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20 transition-colors flex items-center gap-1"
                      title="대기로 되돌리기"
                    >
                      <Clock className="w-2.5 h-2.5" />답변 완료
                    </motion.button>
                  )}
                  {q.status === "dismissed" && (
                    <motion.button
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.95 }}
                      transition={spring}
                      onClick={() => updateStatus(q.id, "pending")}
                      className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground hover:bg-secondary/80 transition-colors flex items-center gap-1"
                    >
                      <Clock className="w-2.5 h-2.5" />미채택
                    </motion.button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
          </AnimatePresence>
        </div>
      )}
      </div>
    </div>
  );
}
