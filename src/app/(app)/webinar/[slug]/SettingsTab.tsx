"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { kstDateTimeLocalInput, kstDateTimeLocalToIso } from "@/lib/datetime";
import WebinarSchedulePicker from "@/components/webinar/WebinarSchedulePicker";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

function Toggle({ checked, onChange, label, desc }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {desc && <p className="text-[11px] text-muted-foreground/70 mt-0.5 leading-relaxed">{desc}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${checked ? "bg-violet-500" : "bg-secondary border border-border"}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
      </button>
    </div>
  );
}

// CTA 카드 편집 폼 (여러 장 지원)
interface CtaFormCard {
  eyebrow: string;
  title: string;
  description: string;
  benefits: string; // 한 줄에 하나
  primaryLabel: string;
  primaryUrl: string;
  secondaryLabel: string;
  secondaryUrl: string;
}

const EMPTY_CTA: CtaFormCard = {
  eyebrow: "", title: "", description: "", benefits: "",
  primaryLabel: "", primaryUrl: "", secondaryLabel: "", secondaryUrl: "",
};

function ctaToForm(raw: Record<string, unknown>): CtaFormCard {
  const buttons = Array.isArray(raw.buttons) ? (raw.buttons as { label?: string; url?: string; style?: string }[]) : [];
  // style 로 슬롯 판별 — 보조(ghost)만 있어도 메인으로 뒤바뀌지 않게
  const primary = buttons.find((b) => b.style !== "ghost");
  const secondary = buttons.find((b) => b.style === "ghost");
  return {
    eyebrow: (raw.eyebrow as string) ?? "",
    title: (raw.title as string) ?? "",
    description: (raw.description as string) ?? "",
    benefits: Array.isArray(raw.benefits) ? (raw.benefits as string[]).join("\n") : "",
    primaryLabel: primary?.label ?? "",
    primaryUrl: primary?.url ?? "",
    secondaryLabel: secondary?.label ?? "",
    secondaryUrl: secondary?.url ?? "",
  };
}

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
  const notify = (livePage.notify ?? {}) as Record<string, unknown>;
  const components = (webinar.components ?? {}) as Record<string, unknown>;
  // CTA 카드 여러 장 — 신규 ctas[] 우선, 없으면 레거시 단일 cta 를 배열로 승격
  const initialCtas: CtaFormCard[] = (Array.isArray(livePage.ctas)
    ? (livePage.ctas as Record<string, unknown>[])
    : livePage.cta
      ? [livePage.cta as Record<string, unknown>]
      : []
  ).map(ctaToForm);

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
    // 실시간 참여 — 채팅 탭 노출 (오프하면 시청 화면에서 채팅 탭이 사라짐)
    chatEnabled: components.chatEnabled === true,
    // 알림 받고 이어보기 박스 (config.livePage.notify)
    notifyEnabled: notify.enabled === true,
    notifyKicker: (notify.kicker as string) ?? "",
    notifyTitle: (notify.title as string) ?? "",
    notifyDescription: (notify.description as string) ?? "",
    notifySwitchLabel: (notify.switchLabel as string) ?? "",
  });
  const [ctaCards, setCtaCards] = useState<CtaFormCard[]>(initialCtas);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");

  const updateCta = (i: number, patch: Partial<CtaFormCard>) =>
    setCtaCards((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const ctaInputCls = "w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors";

  // config.livePage 조립 — 빈 값은 넣지 않아 라이브 페이지에서 해당 요소가 자동으로 숨겨진다
  const buildLivePage = () => {
    // CTA 카드 배열 — 내용 있는 카드만 저장 (빈 카드는 자동 제외)
    const ctas = ctaCards
      .map((card) => {
        const buttons: { label: string; url: string; style: "white" | "ghost" }[] = [];
        if (card.primaryLabel.trim() && card.primaryUrl.trim()) {
          buttons.push({ label: card.primaryLabel.trim(), url: card.primaryUrl.trim(), style: "white" });
        }
        if (card.secondaryLabel.trim() && card.secondaryUrl.trim()) {
          buttons.push({ label: card.secondaryLabel.trim(), url: card.secondaryUrl.trim(), style: "ghost" });
        }
        const benefits = card.benefits.split("\n").map((s) => s.trim()).filter(Boolean);
        const c: Record<string, unknown> = {};
        if (card.eyebrow.trim()) c.eyebrow = card.eyebrow.trim();
        if (card.title.trim()) c.title = card.title.trim();
        if (card.description.trim()) c.description = card.description.trim();
        if (benefits.length) c.benefits = benefits;
        if (buttons.length) c.buttons = buttons;
        return c;
      })
      .filter((c) => Object.keys(c).length > 0);

    // 알림 박스 — enabled 플래그를 항상 담아 온/오프 상태가 유지되게 한다
    const notifyObj: Record<string, unknown> = { enabled: form.notifyEnabled };
    if (form.notifyKicker.trim()) notifyObj.kicker = form.notifyKicker.trim();
    if (form.notifyTitle.trim()) notifyObj.title = form.notifyTitle.trim();
    if (form.notifyDescription.trim()) notifyObj.description = form.notifyDescription.trim();
    if (form.notifySwitchLabel.trim()) notifyObj.switchLabel = form.notifySwitchLabel.trim();

    const livePage: Record<string, unknown> = {};
    if (form.lpContact.trim()) livePage.infoContact = form.lpContact.trim();
    if (form.lpNotice.trim()) livePage.notice = form.lpNotice.trim();
    if (ctas.length) livePage.ctas = ctas; // 신규 배열 키 (레거시 cta 는 승격되어 대체됨)
    livePage.notify = notifyObj;
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
            chatEnabled: form.chatEnabled,
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

        {/* 자료 받기 카드 (CTA) — 여러 장 추가 가능 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">자료 받기 카드 (CTA)</p>
            <span className="text-[11px] text-muted-foreground/70">시청 화면 하단에 표시돼요</span>
          </div>

          {ctaCards.length === 0 && (
            <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
              아직 CTA 카드가 없어요. 아래 버튼으로 추가하세요.
            </p>
          )}

          <AnimatePresence initial={false}>
            {ctaCards.map((card, i) => (
              <motion.div
                key={i}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="rounded-2xl border border-border bg-secondary/20 p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">카드 {i + 1}</p>
                  <button
                    type="button"
                    onClick={() => setCtaCards((prev) => prev.filter((_, j) => j !== i))}
                    className="text-[11px] text-muted-foreground transition-colors hover:text-red-500"
                  >
                    카드 삭제
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input type="text" placeholder="상단 라벨 (예: 세션 자료)" value={card.eyebrow}
                    onChange={(e) => updateCta(i, { eyebrow: e.target.value })} className={ctaInputCls} />
                  <input type="text" placeholder="제목 (예: 발표 자료·템플릿 받기)" value={card.title}
                    onChange={(e) => updateCta(i, { title: e.target.value })} className={ctaInputCls} />
                </div>
                <textarea rows={2} placeholder="설명" value={card.description}
                  onChange={(e) => updateCta(i, { description: e.target.value })} className={`${ctaInputCls} resize-none`} />
                <textarea rows={2} placeholder="혜택 목록 — 한 줄에 하나씩 (선택)" value={card.benefits}
                  onChange={(e) => updateCta(i, { benefits: e.target.value })} className={`${ctaInputCls} resize-none`} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input type="text" placeholder="메인 버튼 라벨 (예: 자료 받기)" value={card.primaryLabel}
                    onChange={(e) => updateCta(i, { primaryLabel: e.target.value })} className={ctaInputCls} />
                  <input type="url" placeholder="메인 버튼 URL" value={card.primaryUrl}
                    onChange={(e) => updateCta(i, { primaryUrl: e.target.value })} className={ctaInputCls} />
                  <input type="text" placeholder="보조 버튼 라벨 (선택)" value={card.secondaryLabel}
                    onChange={(e) => updateCta(i, { secondaryLabel: e.target.value })} className={ctaInputCls} />
                  <input type="url" placeholder="보조 버튼 URL (선택)" value={card.secondaryUrl}
                    onChange={(e) => updateCta(i, { secondaryUrl: e.target.value })} className={ctaInputCls} />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            transition={spring}
            onClick={() => setCtaCards((prev) => [...prev, { ...EMPTY_CTA }])}
            className="w-full rounded-xl border border-dashed border-border py-2.5 text-xs font-medium text-violet-500 transition-colors hover:bg-violet-500/5"
          >
            + CTA 카드 추가
          </motion.button>
        </div>

        {/* 알림 받고 이어보기 카드 (config.livePage.notify) */}
        <div className="rounded-2xl border border-border bg-secondary/20 p-4 space-y-3">
          <Toggle
            checked={form.notifyEnabled}
            onChange={(v) => setForm((f) => ({ ...f, notifyEnabled: v }))}
            label="알림 받고 이어보기 카드 표시"
            desc="시청 화면 하단에 다음 세션 알림·다시보기 안내 카드를 보여줘요."
          />
          {form.notifyEnabled && (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input type="text" placeholder="상단 라벨 (예: 다음 세션 · 20:20)" value={form.notifyKicker}
                  onChange={(e) => setForm((f) => ({ ...f, notifyKicker: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors" />
                <input type="text" placeholder="제목 (예: 알림 받고 이어보기)" value={form.notifyTitle}
                  onChange={(e) => setForm((f) => ({ ...f, notifyTitle: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors" />
              </div>
              <textarea rows={2} placeholder="설명 (비워두면 기본 문구)" value={form.notifyDescription}
                onChange={(e) => setForm((f) => ({ ...f, notifyDescription: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm resize-none focus:outline-none focus:border-violet-400 transition-colors" />
              <input type="text" placeholder="스위치 문구 (예: 세션 시작 알림 받기)" value={form.notifySwitchLabel}
                onChange={(e) => setForm((f) => ({ ...f, notifySwitchLabel: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors" />
            </div>
          )}
        </div>
      </section>

      {/* 실시간 참여 */}
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">실시간 참여</h3>
          <p className="mt-1 text-xs text-muted-foreground">시청 화면의 참여 박스(Q&amp;A·채팅·세션) 구성이에요.</p>
        </div>
        <div className="rounded-2xl border border-border bg-secondary/20 p-4">
          <Toggle
            checked={form.chatEnabled}
            onChange={(v) => setForm((f) => ({ ...f, chatEnabled: v }))}
            label="채팅 탭 사용"
            desc="끄면 시청 화면 참여 박스에서 채팅 탭이 사라져요. (실시간 채팅 연결은 준비 중)"
          />
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
