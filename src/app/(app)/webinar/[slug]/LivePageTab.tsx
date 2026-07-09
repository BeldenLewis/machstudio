"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";

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
  id: string;
  eyebrow: string; title: string; description: string; benefits: string;
  primaryLabel: string; primaryUrl: string; secondaryLabel: string; secondaryUrl: string;
}
const EMPTY_CTA: CtaFormCard = {
  id: crypto.randomUUID(),
  eyebrow: "", title: "", description: "", benefits: "",
  primaryLabel: "", primaryUrl: "", secondaryLabel: "", secondaryUrl: "",
};
function ctaToForm(raw: Record<string, unknown>): CtaFormCard {
  const buttons = Array.isArray(raw.buttons) ? (raw.buttons as { label?: string; url?: string; style?: string }[]) : [];
  const primary = buttons.find((b) => b.style !== "ghost");
  const secondary = buttons.find((b) => b.style === "ghost");
  return {
    id: crypto.randomUUID(),
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

interface Theme {
  accentColor: string; bgColor: string; surfaceColor: string; textColor: string; font: string; borderRadius?: string;
}
const FONTS = ["Pretendard", "Noto Sans KR", "Inter", "Roboto", "Spoqa Han Sans Neo"];
const RADIUS_OPTIONS = [
  { value: "0px", label: "각진" },
  { value: "8px", label: "약간" },
  { value: "16px", label: "기본" },
  { value: "24px", label: "둥근" },
];

interface Webinar {
  id: string;
  theme: Record<string, string>;
  config: Record<string, unknown>;
  components?: Record<string, unknown> | null;
}

const inputCls = "w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors";

// 만들기 › 라이브 페이지 — 영상·콘텐츠·CTA·알림·참여·디자인을 한 곳에서 편집(단일 저장).
export default function LivePageTab({ webinar, onUpdate, onDirtyChange }: { webinar: Webinar; onUpdate: () => void; onDirtyChange?: (dirty: boolean) => void }) {
  const livePage = (webinar.config?.livePage ?? {}) as Record<string, unknown>;
  const notify = (livePage.notify ?? {}) as Record<string, unknown>;
  const components = (webinar.components ?? {}) as Record<string, unknown>;
  const initialCtas: CtaFormCard[] = (Array.isArray(livePage.ctas)
    ? (livePage.ctas as Record<string, unknown>[])
    : livePage.cta ? [livePage.cta as Record<string, unknown>] : []
  ).map(ctaToForm);

  const [form, setForm] = useState({
    youtubeId: (webinar.config?.youtubeId as string) ?? "",
    calendarUrl: (webinar.config?.calendarUrl as string) ?? "",
    surveyUrl: (webinar.config?.surveyUrl as string) ?? "",
    lpContact: (livePage.infoContact as string) ?? "",
    lpNotice: (livePage.notice as string) ?? "",
    chatEnabled: components.chatEnabled === true,
    notifyEnabled: notify.enabled === true,
    notifyKicker: (notify.kicker as string) ?? "",
    notifyTitle: (notify.title as string) ?? "",
    notifyDescription: (notify.description as string) ?? "",
    notifySwitchLabel: (notify.switchLabel as string) ?? "",
  });
  const [ctaCards, setCtaCards] = useState<CtaFormCard[]>(initialCtas);
  const [theme, setTheme] = useState<Theme>({
    accentColor: "#6d28d9", bgColor: "#0f0f0f", surfaceColor: "#1a1a1a", textColor: "#ffffff", font: "Pretendard", borderRadius: "16px",
    ...(webinar.theme as Partial<Theme>),
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // 미저장 편집 통지 — 폼·CTA·테마 전체를 저장 기준 스냅샷과 비교
  const baselineRef = useRef(JSON.stringify({ form, ctaCards, theme }));
  const dirty = JSON.stringify({ form, ctaCards, theme }) !== baselineRef.current;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const updateCta = (i: number, patch: Partial<CtaFormCard>) =>
    setCtaCards((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const buildLivePage = () => {
    const ctas = ctaCards
      .map((card) => {
        const buttons: { label: string; url: string; style: "white" | "ghost" }[] = [];
        if (card.primaryLabel.trim() && card.primaryUrl.trim()) buttons.push({ label: card.primaryLabel.trim(), url: card.primaryUrl.trim(), style: "white" });
        if (card.secondaryLabel.trim() && card.secondaryUrl.trim()) buttons.push({ label: card.secondaryLabel.trim(), url: card.secondaryUrl.trim(), style: "ghost" });
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

    const notifyObj: Record<string, unknown> = { enabled: form.notifyEnabled };
    if (form.notifyKicker.trim()) notifyObj.kicker = form.notifyKicker.trim();
    if (form.notifyTitle.trim()) notifyObj.title = form.notifyTitle.trim();
    if (form.notifyDescription.trim()) notifyObj.description = form.notifyDescription.trim();
    if (form.notifySwitchLabel.trim()) notifyObj.switchLabel = form.notifySwitchLabel.trim();

    const lp: Record<string, unknown> = {};
    if (form.lpContact.trim()) lp.infoContact = form.lpContact.trim();
    if (form.lpNotice.trim()) lp.notice = form.lpNotice.trim();
    if (ctas.length) lp.ctas = ctas;
    lp.notify = notifyObj;
    return lp;
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/webinars/${webinar.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            ...(webinar.config ?? {}),
            youtubeId: form.youtubeId.trim() || null,
            calendarUrl: form.calendarUrl.trim() || null,
            surveyUrl: form.surveyUrl.trim() || null,
            livePage: buildLivePage(),
          },
          theme,
          // 다른 components 키(allowLiveRegistration 등)는 보존
          components: { ...(webinar.components ?? {}), chatEnabled: form.chatEnabled },
        }),
      });
      if (!res.ok) { toast.error("저장 실패"); return; }
      toast.success("라이브 페이지가 저장됐어요");
      baselineRef.current = JSON.stringify({ form, ctaCards, theme }); // 저장 기준 갱신
      onDirtyChange?.(false);
      onUpdate();
    } finally {
      setIsSaving(false);
    }
  };

  const colorFields: { key: keyof Theme; label: string }[] = [
    { key: "accentColor", label: "키 컬러" },
    { key: "bgColor", label: "배경 컬러" },
    { key: "surfaceColor", label: "서피스 컬러" },
    { key: "textColor", label: "텍스트 컬러" },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl space-y-8">
      {/* 영상 */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">영상</h3>
          <p className="mt-1 text-xs text-muted-foreground">시청 화면에 재생될 라이브 방송 소스예요.</p>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">YouTube 영상 ID</label>
          <input type="text" placeholder="예: dQw4w9WgXcQ" value={form.youtubeId}
            onChange={(e) => setForm((f) => ({ ...f, youtubeId: e.target.value }))}
            className={`${inputCls} font-mono`} />
        </div>
      </section>

      {/* 콘텐츠 */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">콘텐츠</h3>
          <p className="mt-1 text-xs text-muted-foreground">시청 화면의 정보·안내 문구와 링크예요. 비워두면 표시되지 않아요.</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">문의처 (정보 카드)</label>
            <input type="text" placeholder="예: STK 운영사무국" value={form.lpContact}
              onChange={(e) => setForm((f) => ({ ...f, lpContact: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">안내 문구 (하단 노티스)</label>
            <textarea rows={2} placeholder="비워두면 기본 안내 문구가 표시돼요." value={form.lpNotice}
              onChange={(e) => setForm((f) => ({ ...f, lpNotice: e.target.value }))} className={`${inputCls} resize-none`} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">캘린더 추가 URL</label>
              <input type="url" placeholder="https://calendar.google.com/..." value={form.calendarUrl}
                onChange={(e) => setForm((f) => ({ ...f, calendarUrl: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">만족도 조사 URL</label>
              <input type="url" placeholder="https://tally.so/..." value={form.surveyUrl}
                onChange={(e) => setForm((f) => ({ ...f, surveyUrl: e.target.value }))} className={inputCls} />
            </div>
          </div>
        </div>

        {/* 자료 받기 카드 (CTA) — 여러 장 */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">자료 받기 카드 (CTA)</p>
            <span className="text-[11px] text-muted-foreground/70">시청 화면 하단에 표시돼요</span>
          </div>
          {ctaCards.length === 0 && (
            <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">아직 CTA 카드가 없어요. 아래 버튼으로 추가하세요.</p>
          )}
          <AnimatePresence initial={false}>
            {ctaCards.map((card, i) => (
              <motion.div key={card.id} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
                className="rounded-2xl border border-border bg-secondary/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">카드 {i + 1}</p>
                  <button type="button" onClick={() => setCtaCards((prev) => prev.filter((_, j) => j !== i))}
                    className="text-[11px] text-muted-foreground transition-colors hover:text-red-500">카드 삭제</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input type="text" placeholder="상단 라벨 (예: 세션 자료)" value={card.eyebrow} onChange={(e) => updateCta(i, { eyebrow: e.target.value })} className={inputCls} />
                  <input type="text" placeholder="제목 (예: 발표 자료·템플릿 받기)" value={card.title} onChange={(e) => updateCta(i, { title: e.target.value })} className={inputCls} />
                </div>
                <textarea rows={2} placeholder="설명" value={card.description} onChange={(e) => updateCta(i, { description: e.target.value })} className={`${inputCls} resize-none`} />
                <textarea rows={2} placeholder="혜택 목록 — 한 줄에 하나씩 (선택)" value={card.benefits} onChange={(e) => updateCta(i, { benefits: e.target.value })} className={`${inputCls} resize-none`} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input type="text" placeholder="메인 버튼 라벨 (예: 자료 받기)" value={card.primaryLabel} onChange={(e) => updateCta(i, { primaryLabel: e.target.value })} className={inputCls} />
                  <input type="url" placeholder="메인 버튼 URL" value={card.primaryUrl} onChange={(e) => updateCta(i, { primaryUrl: e.target.value })} className={inputCls} />
                  <input type="text" placeholder="보조 버튼 라벨 (선택)" value={card.secondaryLabel} onChange={(e) => updateCta(i, { secondaryLabel: e.target.value })} className={inputCls} />
                  <input type="url" placeholder="보조 버튼 URL (선택)" value={card.secondaryUrl} onChange={(e) => updateCta(i, { secondaryUrl: e.target.value })} className={inputCls} />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <motion.button type="button" whileTap={{ scale: 0.98 }} transition={spring}
            onClick={() => setCtaCards((prev) => [...prev, { ...EMPTY_CTA, id: crypto.randomUUID() }])}
            className="w-full rounded-xl border border-dashed border-border py-2.5 text-xs font-medium text-violet-500 transition-colors hover:bg-violet-500/5">
            + CTA 카드 추가
          </motion.button>
        </div>

        {/* 알림 받고 이어보기 카드 */}
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
                  onChange={(e) => setForm((f) => ({ ...f, notifyKicker: e.target.value }))} className={inputCls} />
                <input type="text" placeholder="제목 (예: 알림 받고 이어보기)" value={form.notifyTitle}
                  onChange={(e) => setForm((f) => ({ ...f, notifyTitle: e.target.value }))} className={inputCls} />
              </div>
              <textarea rows={2} placeholder="설명 (비워두면 기본 문구)" value={form.notifyDescription}
                onChange={(e) => setForm((f) => ({ ...f, notifyDescription: e.target.value }))} className={`${inputCls} resize-none`} />
              <input type="text" placeholder="스위치 문구 (예: 세션 시작 알림 받기)" value={form.notifySwitchLabel}
                onChange={(e) => setForm((f) => ({ ...f, notifySwitchLabel: e.target.value }))} className={inputCls} />
            </div>
          )}
        </div>
      </section>

      {/* 참여 구성 */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">참여 구성</h3>
          <p className="mt-1 text-xs text-muted-foreground">시청 화면 참여 박스(Q&amp;A·채팅·세션) 구성이에요.</p>
        </div>
        <div className="rounded-2xl border border-border bg-secondary/20 p-4">
          <Toggle
            checked={form.chatEnabled}
            onChange={(v) => setForm((f) => ({ ...f, chatEnabled: v }))}
            label="채팅 탭 사용"
            desc="끄면 참여 박스에서 채팅 탭이 사라져요. 라이브 중 메시지 관리는 운영 → 라이브 콘솔 → 실시간 채팅에서."
          />
        </div>
      </section>

      {/* 디자인 */}
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">디자인</h3>
          <p className="mt-1 text-xs text-muted-foreground">시청·등록 페이지의 색상·폰트·톤이에요.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {colorFields.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-background">
              <div className="relative">
                <div className="w-9 h-9 rounded-lg border border-border/50 cursor-pointer" style={{ backgroundColor: theme[key] as string }} />
                <input type="color" value={theme[key] as string} onChange={(e) => setTheme((t) => ({ ...t, [key]: e.target.value }))}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
              </div>
              <div>
                <p className="text-xs font-medium">{label}</p>
                <p className="text-xs text-muted-foreground font-mono">{theme[key] as string}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">폰트</p>
          <div className="flex flex-wrap gap-2">
            {FONTS.map((font) => (
              <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }} transition={spring} key={font}
                onClick={() => setTheme((t) => ({ ...t, font }))}
                className={`px-3 py-2 rounded-xl border text-sm transition-colors ${theme.font === font ? "border-violet-500 bg-violet-500/10 text-violet-500" : "border-border hover:bg-secondary text-muted-foreground"}`}
                style={{ fontFamily: font }}>
                {font}
              </motion.button>
            ))}
          </div>
        </div>
        <div>
          <button onClick={() => setShowAdvanced(!showAdvanced)} className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
            <motion.span animate={{ rotate: showAdvanced ? 90 : 0 }} transition={{ duration: 0.15 }} className="inline-block">▶</motion.span>
            테두리 둥글기 {showAdvanced ? "접기" : "펼치기"}
          </button>
          {showAdvanced && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-3">
              <div className="flex gap-2">
                {RADIUS_OPTIONS.map(({ value, label }) => (
                  <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }} transition={spring} key={value}
                    onClick={() => setTheme((t) => ({ ...t, borderRadius: value }))}
                    className={`px-3 py-2 rounded-xl border text-sm transition-colors ${theme.borderRadius === value ? "border-violet-500 bg-violet-500/10 text-violet-500" : "border-border hover:bg-secondary text-muted-foreground"}`}>
                    {label}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">미리보기</p>
          <div className="rounded-2xl p-6 space-y-3" style={{ backgroundColor: theme.bgColor, fontFamily: theme.font, borderRadius: theme.borderRadius }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-bold"
              style={{ backgroundColor: theme.accentColor, borderRadius: theme.borderRadius ? `calc(${theme.borderRadius} * 0.6)` : undefined }}>W</div>
            <p className="font-semibold" style={{ color: theme.textColor }}>웨비나 제목 예시</p>
            <p className="text-sm opacity-70" style={{ color: theme.textColor }}>웨비나 설명 텍스트가 여기에 표시돼요</p>
            <button className="px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: theme.accentColor, borderRadius: theme.borderRadius ? `calc(${theme.borderRadius} * 0.7)` : "8px" }}>사전 등록하기</button>
          </div>
        </div>
      </section>

      <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} transition={spring} onClick={handleSave} disabled={isSaving}
        className="px-5 py-2.5 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors disabled:opacity-40">
        {isSaving ? "저장 중..." : "라이브 페이지 저장"}
      </motion.button>
    </div>
  );
}
