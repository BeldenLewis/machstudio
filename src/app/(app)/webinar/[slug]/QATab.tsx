"use client";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, MessageSquare, Check, X, Clock } from "lucide-react";
import { toast } from "sonner";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

type QAStatus = "pending" | "answered" | "dismissed";

interface QAItem {
  id: string;
  question: string;
  sessionNumber: number | null;
  status: QAStatus;
  name: string | null;
  company: string | null;
  createdAt: string;
}

export default function QATab({ webinarId }: { webinarId: string }) {
  const [questions, setQuestions] = useState<QAItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<QAStatus | "all">("pending");

  const fetchQA = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("status", filter);
      const res = await fetch(`/api/webinars/${webinarId}/qa?${params}`);
      const data = await res.json();
      setQuestions(data.questions ?? []);
    } finally {
      setIsLoading(false);
    }
  }, [webinarId, filter]);

  useEffect(() => { fetchQA(); }, [fetchQA]);

  const updateStatus = async (id: string, status: QAStatus) => {
    const res = await fetch(`/api/webinars/${webinarId}/qa/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) { toast.error("상태 변경 실패"); return; }
    setQuestions((prev) => prev.map((q) => q.id === id ? { ...q, status } : q));
  };

  const filters: { value: QAStatus | "all"; label: string }[] = [
    { value: "pending", label: "대기 중" },
    { value: "answered", label: "답변 완료" },
    { value: "dismissed", label: "미채택" },
    { value: "all", label: "전체" },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4">
      <div className="relative flex items-center gap-1">
        {filters.map(({ value, label }) => {
          const active = filter === value;
          return (
            <button
              key={value}
              onClick={() => setFilter(value)}
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

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : questions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <MessageSquare className="w-10 h-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">질문이 없어요</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
          {questions.map((q) => (
            <motion.div
              key={q.id}
              layout
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -8 }}
              whileHover={{ borderColor: "rgba(139, 92, 246, 0.18)" }}
              transition={spring}
              className="p-4 rounded-2xl border border-border bg-background space-y-2"
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
                    <span className="text-xs text-muted-foreground">
                      {new Date(q.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
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
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400">답변 완료</span>
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
  );
}
