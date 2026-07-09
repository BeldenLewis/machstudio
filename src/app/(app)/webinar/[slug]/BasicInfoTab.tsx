"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { kstDateTimeLocalInput, kstDateTimeLocalToIso } from "@/lib/datetime";
import WebinarSchedulePicker from "@/components/webinar/WebinarSchedulePicker";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

interface Webinar {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  liveStartAt: string;
  liveEndAt: string;
  signupDeadline: string;
  components?: Record<string, unknown> | null;
}

// 만들기 › 기본 정보 — 정체성(이름·설명) + 일정 + 위험 구역만.
// 라이브 페이지 콘텐츠·디자인·참여 설정은 '라이브 페이지' 섹션(LivePageTab)으로 분리됨.
export default function BasicInfoTab({ webinar, onUpdate, onDirtyChange }: { webinar: Webinar; onUpdate: () => void; onDirtyChange?: (dirty: boolean) => void }) {
  const router = useRouter();
  const toLocal = (iso: string) => kstDateTimeLocalInput(iso);
  const components = (webinar.components ?? {}) as Record<string, unknown>;

  const [form, setForm] = useState({
    name: webinar.name,
    description: webinar.description ?? "",
    liveStartAt: toLocal(webinar.liveStartAt),
    liveEndAt: toLocal(webinar.liveEndAt),
    signupDeadline: toLocal(webinar.signupDeadline),
    // 라이브 시작 후 사전등록 마감 여부 (components.allowLiveRegistration === false 일 때 체크됨)
    closeRegOnLive: components.allowLiveRegistration === false,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");

  // 미저장 편집 통지 — 저장 기준 스냅샷과 비교
  const baselineRef = useRef(JSON.stringify(form));
  const dirty = JSON.stringify(form) !== baselineRef.current;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/webinars/${webinar.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
          liveStartAt: kstDateTimeLocalToIso(form.liveStartAt),
          liveEndAt: kstDateTimeLocalToIso(form.liveEndAt),
          signupDeadline: kstDateTimeLocalToIso(form.signupDeadline),
          // 다른 components 키(chatEnabled 등)는 보존
          components: {
            ...(webinar.components ?? {}),
            allowLiveRegistration: form.closeRegOnLive ? false : null,
          },
        }),
      });
      if (!res.ok) { toast.error("저장 실패"); return; }
      toast.success("기본 정보가 저장됐어요");
      baselineRef.current = JSON.stringify(form); // 저장 기준 갱신 → dirty 해제
      onDirtyChange?.(false);
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
        <WebinarSchedulePicker
          value={{ liveStartAt: form.liveStartAt, liveEndAt: form.liveEndAt, signupDeadline: form.signupDeadline }}
          onChange={(v) => setForm((f) => ({ ...f, liveStartAt: v.liveStartAt, liveEndAt: v.liveEndAt, signupDeadline: v.signupDeadline }))}
        />
        <label className="flex items-start gap-2.5 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={form.closeRegOnLive}
            onChange={(e) => setForm((f) => ({ ...f, closeRegOnLive: e.target.checked }))}
            className="mt-0.5"
            style={{ accentColor: "#8b5cf6" }}
          />
          <span className="text-xs text-muted-foreground leading-relaxed">
            라이브 시작 후에는 사전등록 받지 않기
            <span className="block text-[11px] text-muted-foreground/70 mt-0.5">
              체크하면 라이브 중 하단 배너·히어로의 사전등록 버튼이 비활성화돼요. (해제 시 마감일까지 계속 접수)
            </span>
          </span>
        </label>
      </section>

      <motion.button
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.97 }}
        transition={spring}
        onClick={handleSave}
        disabled={!form.name.trim() || isSaving}
        className="px-5 py-2.5 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors disabled:opacity-40"
      >
        {isSaving ? "저장 중..." : "기본 정보 저장"}
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
