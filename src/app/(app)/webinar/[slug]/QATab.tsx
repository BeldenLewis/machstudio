"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, MessageSquare } from "lucide-react";
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
  // 인플라이트 응답 펜스 — mutation 시작 전 출발한 tick fetch 가 뒤늦게 도착해 낙관적 변경을 되돌리지 않게.
  const reqIdRef = useRef(0);

  const fetchQA = useCallback(async (silent = false) => {
    const gen = ++reqIdRef.current;
    if (!silent) setIsLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("status", filter);
      const res = await fetch(`/api/webinars/${webinarId}/qa?${params}`);
      if (!res.ok) { setLoadError(true); return; }
      const data = await res.json();
      if (gen !== reqIdRef.current) return; // 더 새로운 요청/뮤테이션이 발생 — 이 응답 폐기
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
    mutatingRef.current = true; reqIdRef.current++;
    try {
      const res = await fetch(`/api/webinars/${webinarId}/qa/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) { toast.error("상태 변경 실패"); return; }
      // 답변완료·미채택이면 송출도 함께 종료(서버와 일치). 현재 필터에 안 맞으면 목록에서 바로 제거 — 대기 큐에서 사라져 클릭 결과가 즉시 보인다.
      setQuestions((prev) => {
        const next = prev.map((q) => q.id === id ? { ...q, status, ...(status !== "pending" ? { onScreen: false } : {}) } : q);
        return filter === "all" ? next : next.filter((q) => q.status === filter);
      });
      toast.success(status === "answered" ? "답변 완료로 옮겼어요" : status === "dismissed" ? "미채택으로 옮겼어요" : "대기로 되돌렸어요");
    } finally { mutatingRef.current = false; }
  };

  // 화면에 띄우기 — 웨비나당 1개만(단일 활성). 켜면 나머지는 자동으로 꺼진다.
  const setOnScreen = async (id: string, onScreen: boolean) => {
    mutatingRef.current = true; reqIdRef.current++;
    try {
      const res = await fetch(`/api/webinars/${webinarId}/qa/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ onScreen }),
      });
      if (!res.ok) {
        // 409 = 다른 질문이 방금 송출됨(단일 활성). 사유를 알려주고 목록을 맞춘다.
        toast.error(res.status === 409
          ? "다른 질문이 방금 송출됐어요. 목록을 새로고침했어요."
          : onScreen ? "송출하지 못했어요" : "송출을 끄지 못했어요");
        await fetchQA(true);
        return;
      }
      setQuestions((prev) => prev.map((q) => q.id === id ? { ...q, onScreen } : (onScreen ? { ...q, onScreen: false } : q)));
      if (onScreen) toast.success("시청 화면에 띄웠어요");
    } finally { mutatingRef.current = false; }
  };

  // 추천순 정렬(voteCount desc, 동점은 먼저 올라온 순).
  const ordered = [...questions].sort((a, b) => (b.voteCount - a.voteCount) || (a.createdAt < b.createdAt ? -1 : 1));
  const maxVote = ordered.reduce((m, q) => Math.max(m, q.voteCount), 0);

  const filters: { value: QAStatus | "all"; label: string }[] = [
    { value: "pending", label: "대기 중" },
    { value: "answered", label: "답변 완료" },
    { value: "dismissed", label: "미채택" },
    { value: "all", label: "전체" },
  ];

  return (
    <div className={fillHeight ? "flex h-full min-h-0 flex-col gap-3" : embedded ? "space-y-4" : "p-4 sm:p-6 lg:p-8 space-y-4"}>
      <div className="relative flex shrink-0 items-center gap-1">
        {filters.map(({ value, label }) => {
          const active = filter === value;
          return (
            <button
              key={value}
              onClick={() => setFilter(value)}
              aria-pressed={active}
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
          {ordered.map((q) => {
            const hot = q.voteCount > 0 && q.voteCount === maxVote;
            return (
            <motion.div
              key={q.id}
              layout
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={spring}
              className={`flex gap-3 rounded-xl border bg-background p-3 transition-colors ${q.onScreen ? "border-green-500/40 ring-2 ring-green-500/20" : "border-border"}`}
            >
              {/* 추천수 — 좌측 배지(정렬 키). 최다 득표는 강조 */}
              <div className={`flex w-11 shrink-0 flex-col items-center justify-center rounded-lg py-1.5 ${hot ? "bg-violet-500 text-white" : "bg-secondary text-foreground"}`}>
                <span className="text-[15px] font-bold leading-none tabular-nums">{q.voteCount}</span>
                <span className={`mt-0.5 text-[9.5px] ${hot ? "text-white/80" : "text-muted-foreground"}`}>추천</span>
              </div>
              {/* 질문 본문 + 작성자 + 액션 */}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug">{q.question}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                  {q.name && <span>{q.name}</span>}
                  {q.company && <span>· {q.company}</span>}
                  {q.sessionNumber != null && <span>· 세션 {q.sessionNumber}</span>}
                  {q.onScreen && <span className="font-semibold text-green-600 dark:text-green-400">· 지금 답변 중</span>}
                  <span>· {formatKst(q.createdAt, { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {q.status === "pending" ? (
                    <>
                      <motion.button whileTap={{ scale: 0.96 }} transition={spring} onClick={() => updateStatus(q.id, "answered")}
                        className="rounded-lg bg-violet-500 px-2.5 py-1 text-[11.5px] font-medium text-white transition hover:brightness-110">답변 완료</motion.button>
                      <motion.button whileTap={{ scale: 0.96 }} transition={spring} onClick={() => setOnScreen(q.id, !q.onScreen)}
                        className={`rounded-lg px-2.5 py-1 text-[11.5px] font-medium transition ${q.onScreen ? "border border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400" : "border border-border hover:border-violet-500/40 hover:text-violet-500"}`}>
                        {q.onScreen ? "송출 끄기" : "화면에 띄우기"}</motion.button>
                      <motion.button whileTap={{ scale: 0.96 }} transition={spring} onClick={() => updateStatus(q.id, "dismissed")}
                        className="rounded-lg px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground">숨기기</motion.button>
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${q.status === "answered" ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-secondary text-muted-foreground"}`}>
                        {q.status === "answered" ? "답변 완료" : "미채택"}</span>
                      <motion.button whileTap={{ scale: 0.96 }} transition={spring} onClick={() => updateStatus(q.id, "pending")}
                        className="rounded-lg px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground">대기로 되돌리기</motion.button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
            );
          })}
          </AnimatePresence>
        </div>
      )}
      </div>
    </div>
  );
}
