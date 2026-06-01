"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

interface Webinar {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  liveStartAt: string;
  liveEndAt: string;
  signupDeadline: string;
  config: Record<string, unknown>;
}

export default function SettingsTab({ webinar, onUpdate }: { webinar: Webinar; onUpdate: () => void }) {
  const router = useRouter();
  const toLocal = (iso: string) => new Date(iso).toISOString().slice(0, 16);

  const [form, setForm] = useState({
    name: webinar.name,
    description: webinar.description ?? "",
    liveStartAt: toLocal(webinar.liveStartAt),
    liveEndAt: toLocal(webinar.liveEndAt),
    signupDeadline: toLocal(webinar.signupDeadline),
    youtubeId: (webinar.config?.youtubeId as string) ?? "",
    calendarUrl: (webinar.config?.calendarUrl as string) ?? "",
    surveyUrl: (webinar.config?.surveyUrl as string) ?? "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/webinars/${webinar.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
          liveStartAt: form.liveStartAt,
          liveEndAt: form.liveEndAt,
          signupDeadline: form.signupDeadline,
          config: {
            ...(webinar.config ?? {}),
            youtubeId: form.youtubeId.trim() || null,
            calendarUrl: form.calendarUrl.trim() || null,
            surveyUrl: form.surveyUrl.trim() || null,
          },
        }),
      });
      if (!res.ok) { toast.error("저장 실패"); return; }
      toast.success("설정이 저장됐어요");
      onUpdate();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleteInput !== webinar.name) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/webinars/${webinar.id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("삭제 실패"); return; }
      toast.success("웨비나가 삭제됐어요");
      router.push("/webinar");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl space-y-8">
      {/* 기본 정보 */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold">기본 정보</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">웨비나 이름</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">설명</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm resize-none focus:outline-none focus:border-violet-400 transition-colors"
            />
          </div>
        </div>
      </section>

      {/* 일정 */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold">일정</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">사전등록 마감</label>
            <input
              type="datetime-local"
              value={form.signupDeadline}
              onChange={(e) => setForm((f) => ({ ...f, signupDeadline: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">라이브 시작</label>
            <input
              type="datetime-local"
              value={form.liveStartAt}
              onChange={(e) => setForm((f) => ({ ...f, liveStartAt: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">라이브 종료</label>
            <input
              type="datetime-local"
              value={form.liveEndAt}
              onChange={(e) => setForm((f) => ({ ...f, liveEndAt: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors"
            />
          </div>
        </div>
      </section>

      {/* 연동 설정 */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold">연동</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">YouTube 영상 ID</label>
            <input
              type="text"
              placeholder="예: dQw4w9WgXcQ"
              value={form.youtubeId}
              onChange={(e) => setForm((f) => ({ ...f, youtubeId: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm font-mono focus:outline-none focus:border-violet-400 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">캘린더 추가 URL</label>
            <input
              type="url"
              placeholder="https://calendar.google.com/..."
              value={form.calendarUrl}
              onChange={(e) => setForm((f) => ({ ...f, calendarUrl: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">만족도 조사 URL</label>
            <input
              type="url"
              placeholder="https://tally.so/..."
              value={form.surveyUrl}
              onChange={(e) => setForm((f) => ({ ...f, surveyUrl: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors"
            />
          </div>
        </div>
      </section>

      <motion.button
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.97 }}
        transition={spring}
        onClick={handleSave}
        disabled={!form.name.trim() || isSaving}
        className="px-5 py-2.5 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors disabled:opacity-40"
      >
        {isSaving ? "저장 중..." : "설정 저장"}
      </motion.button>

      {/* 위험 구역 */}
      <section className="space-y-3 pt-4 border-t border-border">
        <h3 className="text-sm font-semibold text-red-500">위험 구역</h3>
        <AnimatePresence mode="wait" initial={false}>
        {!showDeleteConfirm ? (
          <motion.button
            key="open"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            transition={spring}
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 rounded-xl border border-red-500/30 text-red-500 text-sm hover:bg-red-500/10 transition-colors"
          >
            웨비나 삭제
          </motion.button>
        ) : (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={spring}
            className="p-4 rounded-2xl border border-red-500/30 bg-red-500/5 space-y-3"
          >
            <p className="text-sm text-red-500">모든 등록자, Q&A, 공지 데이터가 삭제돼요. 되돌릴 수 없어요.</p>
            <p className="text-xs text-muted-foreground">확인을 위해 웨비나 이름 <strong>{webinar.name}</strong>을 입력하세요</p>
            <input
              type="text"
              placeholder={webinar.name}
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-red-500/30 bg-background text-sm focus:outline-none focus:border-red-500 transition-colors"
            />
            <div className="flex gap-2">
              <motion.button
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
                transition={spring}
                onClick={handleDelete}
                disabled={deleteInput !== webinar.name || isDeleting}
                className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-40"
              >
                {isDeleting ? "삭제 중..." : "삭제"}
              </motion.button>
              <motion.button
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
                transition={spring}
                onClick={() => { setShowDeleteConfirm(false); setDeleteInput(""); }}
                className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-secondary transition-colors"
              >
                취소
              </motion.button>
            </div>
          </motion.div>
        )}
        </AnimatePresence>
      </section>
    </div>
  );
}
