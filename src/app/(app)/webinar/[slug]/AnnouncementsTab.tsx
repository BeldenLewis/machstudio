"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Megaphone, Plus, Trash2, Radio, Square } from "lucide-react";
import { toast } from "sonner";

interface Announcement {
  id: string;
  type: string;
  message: string;
  isActive: boolean;
  createdAt: string;
}

export default function AnnouncementsTab({ webinarId }: { webinarId: string }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ type: "info", message: "" });
  const [isCreating, setIsCreating] = useState(false);

  const fetchAnnouncements = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/webinars/${webinarId}/announcements`);
      const data = await res.json();
      setAnnouncements(data.announcements ?? []);
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
    setAnnouncements((prev) => prev.map((a) => a.id === ann.id ? { ...a, isActive: !ann.isActive } : a));
    toast.success(ann.isActive ? "공지가 비활성화됐어요" : "공지가 라이브에 표시돼요");
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/webinars/${webinarId}/announcements/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("삭제 실패"); return; }
    toast.success("공지가 삭제됐어요");
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
  };

  const typeColors: Record<string, string> = {
    info: "bg-blue-500/10 text-blue-500",
    warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    success: "bg-green-500/10 text-green-600 dark:text-green-400",
    error: "bg-red-500/10 text-red-500",
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">라이브 중 참여자에게 공지를 표시해요</p>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-500 text-white text-xs font-medium hover:bg-violet-600 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />공지 추가
        </button>
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
                <button
                  key={t}
                  onClick={() => setForm((f) => ({ ...f, type: t }))}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    form.type === t ? typeColors[t] + " ring-1 ring-current" : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <textarea
              autoFocus
              rows={2}
              placeholder="공지 내용을 입력하세요"
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm resize-none focus:outline-none focus:border-violet-400"
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={!form.message.trim() || isCreating}
                className="px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors disabled:opacity-40"
              >
                {isCreating ? "생성 중..." : "생성"}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-secondary transition-colors"
              >
                취소
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : announcements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Megaphone className="w-10 h-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">아직 공지가 없어요</p>
        </div>
      ) : (
        <div className="space-y-2">
          {announcements.map((ann) => (
            <div
              key={ann.id}
              className={`flex items-start gap-3 p-4 rounded-2xl border transition-colors ${
                ann.isActive ? "border-violet-400/30 bg-violet-500/5" : "border-border bg-background"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${typeColors[ann.type] ?? "bg-secondary text-muted-foreground"}`}>
                    {ann.type}
                  </span>
                  {ann.isActive && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-500 font-medium">표시 중</span>
                  )}
                </div>
                <p className="text-sm">{ann.message}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => toggleActive(ann)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    ann.isActive
                      ? "hover:bg-secondary text-violet-500"
                      : "hover:bg-violet-500/10 text-muted-foreground hover:text-violet-500"
                  }`}
                  title={ann.isActive ? "표시 중지" : "라이브에 표시"}
                >
                  {ann.isActive ? <Square className="w-4 h-4" /> : <Radio className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => handleDelete(ann.id)}
                  className="p-1.5 rounded-lg hover:bg-red-500/10 hover:text-red-500 text-muted-foreground transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
