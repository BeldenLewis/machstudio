"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Megaphone, Plus, Trash2, Radio, Square } from "lucide-react";
import { toast } from "sonner";
import { InlineError } from "@/components/ui/inline-error";
import { useUndoableDelete } from "@/components/ui/use-undoable-delete";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

interface Announcement {
  id: string;
  type: string;
  message: string;
  isActive: boolean;
  createdAt: string;
}

export default function AnnouncementsTab({ webinarId, embedded = false }: { webinarId: string; embedded?: boolean }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ type: "info", message: "" });
  const [isCreating, setIsCreating] = useState(false);
  const { remove: undoableRemove } = useUndoableDelete();

  const fetchAnnouncements = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(`/api/webinars/${webinarId}/announcements`);
      if (!res.ok) { setLoadError(true); return; }
      const data = await res.json();
      setAnnouncements(data.announcements ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [webinarId]);

  useEffect(() => { fetchAnnouncements(); }, [fetchAnnouncements]);

  const handleCreate = async () => {
    if (!form.message.trim()) return;
    setIsCreating(true);
    try {
      const res = await fetch(`/api/webinars/${webinarId}/announcements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: form.type, message: form.message.trim() }),
      });
      if (!res.ok) { toast.error("생성 실패"); return; }
      toast.success("공지가 생성됐어요");
      setForm({ type: "info", message: "" });
      setShowCreate(false);
      fetchAnnouncements();
    } finally {
      setIsCreating(false);
    }
  };

  const toggleActive = async (ann: Announcement) => {
    const res = await fetch(`/api/webinars/${webinarId}/announcements/${ann.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !ann.isActive }),
    });
    if (!res.ok) { toast.error("상태 변경 실패"); return; }
    const nextActive = !ann.isActive;
    // 서버가 단일 활성(라디오)로 강제 — 하나를 켜면 나머지는 꺼진 것으로 로컬 상태도 맞춘다
    setAnnouncements((prev) =>
      prev.map((a) =>
        a.id === ann.id ? { ...a, isActive: nextActive } : nextActive ? { ...a, isActive: false } : a,
      ),
    );
    toast.success(ann.isActive ? "공지가 비활성화됐어요" : "공지가 라이브에 표시돼요");
  };

  // 낙관적 삭제 + 실행취소 — 즉시 목록에서 사라지고 5초 안에 되돌릴 수 있다(그 뒤 실제 삭제).
  const handleDelete = (ann: Announcement) => {
    undoableRemove({
      key: ann.id,
      message: "공지를 삭제했어요",
      onOptimistic: () => setAnnouncements((prev) => prev.filter((a) => a.id !== ann.id)),
      onUndo: () => setAnnouncements((prev) => (prev.some((a) => a.id === ann.id) ? prev
        : [...prev, ann].sort((x, y) => y.createdAt.localeCompare(x.createdAt)))),
      commit: async () => {
        const res = await fetch(`/api/webinars/${webinarId}/announcements/${ann.id}`, { method: "DELETE" });
        if (!res.ok) { toast.error("삭제 실패 — 목록을 새로고침합니다"); fetchAnnouncements(); }
      },
    });
  };
  const typeColors: Record<string, string> = {
    info: "bg-blue-500/10 text-blue-500",
    warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    success: "bg-green-500/10 text-green-600 dark:text-green-400",
    error: "bg-red-500/10 text-red-500",
  };
  // 비개발자 대상 — 영문 enum 대신 한글 라벨로 노출
  const typeLabels: Record<string, string> = {
    info: "안내",
    warning: "주의",
    success: "완료",
    error: "긴급",
  };

  return (
    <div className={embedded ? "space-y-4" : "p-4 sm:p-6 lg:p-8 space-y-4"}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">라이브 중 참여자에게 공지를 표시해요 · 한 번에 하나만 노출돼요</p>
        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.96 }}
          transition={spring}
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-500 text-white text-xs font-medium hover:bg-violet-600 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />공지 추가
        </motion.button>
      </div>

      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="p-4 rounded-2xl border border-violet-400/30 bg-violet-500/5 space-y-3"
          >
            <div className="flex items-center gap-2">
              {["info", "warning", "success", "error"].map((t) => (
                <motion.button
                  key={t}
                  whileTap={{ scale: 0.9 }}
                  animate={{ scale: form.type === t ? 1.05 : 1 }}
                  transition={spring}
                  onClick={() => setForm((f) => ({ ...f, type: t }))}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    form.type === t ? typeColors[t] + " ring-1 ring-current" : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {typeLabels[t] ?? t}
                </motion.button>
              ))}
            </div>
            <textarea
              autoFocus
              rows={2}
              placeholder="공지 내용을 입력하세요"
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none focus:outline-none focus:border-violet-400"
            />
            <div className="flex gap-2">
              <motion.button
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
                transition={spring}
                onClick={handleCreate}
                disabled={!form.message.trim() || isCreating}
                className="px-4 py-2 rounded-lg bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors disabled:opacity-40"
              >
                {isCreating ? "생성 중..." : "생성"}
              </motion.button>
              <motion.button
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
                transition={spring}
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-secondary transition-colors"
              >
                취소
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : loadError ? (
        <InlineError message="공지를 불러오지 못했어요" onRetry={() => void fetchAnnouncements()} />
      ) : announcements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Megaphone className="w-10 h-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">아직 공지가 없어요</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
          {announcements.map((ann) => (
            <motion.div
              key={ann.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={spring}
              className={`flex items-start gap-3 p-4 rounded-xl border transition-colors ${
                ann.isActive ? "border-green-500/40 bg-green-500/[0.06]" : "border-border bg-background"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${typeColors[ann.type] ?? "bg-secondary text-muted-foreground"}`}>
                    {typeLabels[ann.type] ?? ann.type}
                  </span>
                  {ann.isActive && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 font-medium">표시 중</span>
                  )}
                </div>
                <p className="text-sm">{ann.message}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  transition={spring}
                  onClick={() => toggleActive(ann)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    ann.isActive
                      ? "hover:bg-secondary text-green-600 dark:text-green-400"
                      : "hover:bg-green-500/10 text-muted-foreground hover:text-green-600 dark:hover:text-green-400"
                  }`}
                  title={ann.isActive ? "표시 중지" : "라이브에 표시"}
                >
                  {ann.isActive ? <Square className="w-4 h-4" /> : <Radio className="w-4 h-4" />}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  transition={spring}
                  onClick={() => handleDelete(ann)}
                  className="p-1.5 rounded-lg hover:bg-red-500/10 hover:text-red-500 text-muted-foreground transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </motion.button>
              </div>
            </motion.div>
          ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
