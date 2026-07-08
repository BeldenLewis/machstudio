"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { kstDateTimeLocalInput, kstDateTimeLocalToIso } from "@/lib/datetime";

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
  components?: Record<string, unknown> | null;
}

export default function SettingsTab({ webinar, onUpdate }: { webinar: Webinar; onUpdate: () => void }) {
  const router = useRouter();
  // datetime-local 은 KST 벽시각으로 다룬다 (목록·상세 표시와 동일 기준)
  const toLocal = (iso: string) => kstDateTimeLocalInput(iso);

  const livePage = (webinar.config?.livePage ?? {}) as Record<string, unknown>;
  const cta = (livePage.cta ?? {}) as Record<string, unknown>;
  const components = (webinar.components ?? {}) as Record<string, unknown>;
  const ctaButtons = Array.isArray(cta.buttons) ? (cta.buttons as { label?: string; url?: string; style?: string }[]) : [];

  const [form, setForm] = useState({
    name: webinar.name,
    description: webinar.description ?? "",
    liveStartAt: toLocal(webinar.liveStartAt),
    liveEndAt: toLocal(webinar.liveEndAt),
    signupDeadline: toLocal(webinar.signupDeadline),
    // 라이브 시작 후 사전등록 마감 여부 (components.allowLiveRegistration === false 일 때 체크됨)
    closeRegOnLive: components.allowLiveRegistration === false,
    youtubeId: (webinar.config?.youtubeId as string) ?? "",
    calendarUrl: (webinar.config?.calendarUrl as string) ?? "",
    surveyUrl: (webinar.config?.surveyUrl as string) ?? "",
    // 라이브 페이지 (config.livePage)
    lpContact: (livePage.infoContact as string) ?? "",
    lpNotice: (livePage.notice as string) ?? "",
    ctaEyebrow: (cta.eyebrow as string) ?? "",
    ctaTitle: (cta.title as string) ?? "",
    ctaDescription: (cta.description as string) ?? "",
    ctaBenefits: Array.isArray(cta.benefits) ? (cta.benefits as string[]).join("\n") : "",
    ctaPrimaryLabel: ctaButtons[0]?.label ?? "",
    ctaPrimaryUrl: ctaButtons[0]?.url ?? "",
    ctaSecondaryLabel: ctaButtons[1]?.label ?? "",
    ctaSecondaryUrl: ctaButtons[1]?.url ?? "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");

  // config.livePage 조립 — 빈 값은 넣지 않아 라이브 페이지에서 해당 요소가 자동으로 숨겨진다
  const buildLivePage = () => {
    const buttons: { label: string; url: string; style: "white" | "ghost" }[] = [];
    if (form.ctaPrimaryLabel.trim() && form.ctaPrimaryUrl.trim()) {
      buttons.push({ label: form.ctaPrimaryLabel.trim(), url: form.ctaPrimaryUrl.trim(), style: "white" });
    }
    if (form.ctaSecondaryLabel.trim() && form.ctaSecondaryUrl.trim()) {
      buttons.push({ label: form.ctaSecondaryLabel.trim(), url: form.ctaSecondaryUrl.trim(), style: "ghost" });
    }
    const benefits = form.ctaBenefits.split("\n").map((s) => s.trim()).filter(Boolean);
    const cta: Record<string, unknown> = {};
    if (form.ctaEyebrow.trim()) cta.eyebrow = form.ctaEyebrow.trim();
    if (form.ctaTitle.trim()) cta.title = form.ctaTitle.trim();
    if (form.ctaDescription.trim()) cta.description = form.ctaDescription.trim();
    if (benefits.length) cta.benefits = benefits;
    if (buttons.length) cta.buttons = buttons;

    const livePage: Record<string, unknown> = {};
    if (form.lpContact.trim()) livePage.infoContact = form.lpContact.trim();
    if (form.lpNotice.trim()) livePage.notice = form.lpNotice.trim();
    if (Object.keys(cta).length) livePage.cta = cta;
    return livePage;
  };

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
          config: {
            ...(webinar.config ?? {}),
            youtubeId: form.youtubeId.trim() || null,
            calendarUrl: form.calendarUrl.trim() || null,
            surveyUrl: form.surveyUrl.trim() || null,
            livePage: buildLivePage(),
          },
          // 체크 시 라이브 중 사전등록 마감(false), 해제 시 기본값(null=마감일 규칙)
          components: {
            ...(webinar.components ?? {}),
            allowLiveRegistration: form.closeRegOnLive ? false : null,
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

      {/* 라이브 페이지 (config.livePage) */}
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">라이브 페이지</h3>
          <p className="mt-1 text-xs text-muted-foreground">시청 화면의 정보·안내 문구와 하단 CTA 카드예요. 비워두면 해당 요소는 표시되지 않아요.</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">문의처 (정보 카드)</label>
            <input
              type="text"
              placeholder="예: STK 운영사무국"
              value={form.lpContact}
              onChange={(e) => setForm((f) => ({ ...f, lpContact: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">안내 문구 (하단 노티스)</label>
            <textarea
              rows={2}
              placeholder="비워두면 기본 안내 문구가 표시돼요."
              value={form.lpNotice}
              onChange={(e) => setForm((f) => ({ ...f, lpNotice: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm resize-none focus:outline-none focus:border-violet-400 transition-colors"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-secondary/20 p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground">CTA 카드 (전시 사전등록 등 유도)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input type="text" placeholder="상단 라벨 (예: STK 2026 Pre-Registration)" value={form.ctaEyebrow}
              onChange={(e) => setForm((f) => ({ ...f, ctaEyebrow: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors" />
            <input type="text" placeholder="제목" value={form.ctaTitle}
              onChange={(e) => setForm((f) => ({ ...f, ctaTitle: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors" />
          </div>
          <textarea rows={2} placeholder="설명" value={form.ctaDescription}
            onChange={(e) => setForm((f) => ({ ...f, ctaDescription: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm resize-none focus:outline-none focus:border-violet-400 transition-colors" />
          <textarea rows={3} placeholder="혜택 목록 — 한 줄에 하나씩" value={form.ctaBenefits}
            onChange={(e) => setForm((f) => ({ ...f, ctaBenefits: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm resize-none focus:outline-none focus:border-violet-400 transition-colors" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input type="text" placeholder="메인 버튼 라벨" value={form.ctaPrimaryLabel}
              onChange={(e) => setForm((f) => ({ ...f, ctaPrimaryLabel: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors" />
            <input type="url" placeholder="메인 버튼 URL" value={form.ctaPrimaryUrl}
              onChange={(e) => setForm((f) => ({ ...f, ctaPrimaryUrl: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors" />
            <input type="text" placeholder="보조 버튼 라벨" value={form.ctaSecondaryLabel}
              onChange={(e) => setForm((f) => ({ ...f, ctaSecondaryLabel: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors" />
            <input type="url" placeholder="보조 버튼 URL" value={form.ctaSecondaryUrl}
              onChange={(e) => setForm((f) => ({ ...f, ctaSecondaryUrl: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors" />
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
