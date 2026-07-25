"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { useAutosave } from "@/components/ui/use-autosave";
import { normalizeLivePageConfig, type LivePageConfig, type LiveResource, type LiveNextWebinar } from "@/lib/webinar-config";
import { AutosaveIndicator } from "@/components/ui/autosave-indicator";
import { getYouTubeVideoId } from "@/lib/youtube";

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

/**
 * 이름 있는 모드 두 개 중 하나를 고르는 컨트롤. on/off 가 아니라 "어느 쪽인가"라서
 * Toggle 대신 라디오로 둔다 — 토글은 꺼진 쪽이 무엇인지 라벨로 드러나지 않는다.
 * 선택 상태는 외곽선이 아니라 그림자로 마감(제품 원칙).
 */
function ModeChoice<T extends string>({ value, onChange, label, desc, options }: {
  value: T;
  onChange: (v: T) => void;
  label: string;
  desc?: string;
  options: { value: T; title: string; desc: string }[];
}) {
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      {desc && <p className="text-[11px] text-muted-foreground/70 mt-0.5 leading-relaxed">{desc}</p>}
      <div className="mt-2.5 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.value)}
              className={`rounded-xl p-3 text-left transition-all ${
                on ? "bg-violet-500/12 shadow-[0_0_0_1.5px_rgb(139_92_246)]" : "bg-secondary/40 hover:bg-secondary/70"
              }`}
            >
              <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                <span
                  aria-hidden
                  className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full transition-colors ${
                    on ? "bg-violet-500" : "border border-border bg-transparent"
                  }`}
                >
                  {on && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </span>
                {o.title}
              </span>
              <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground/80">{o.desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// CTA 카드 편집 폼 (여러 장 지원)
// 버튼 연결: 링크(URL) 또는 폼(자체 설문 = 커스텀 폼 — 문의·신청 등), 열기 방식: 새 창/모달
type CtaBtnAction = "url" | "form";
type CtaBtnOpen = "newTab" | "modal";
interface CtaBtnForm { label: string; action: CtaBtnAction; url: string; surveyId: string; open: CtaBtnOpen }
interface CtaFormCard {
  id: string;
  eyebrow: string; title: string; description: string; benefits: string;
  primary: CtaBtnForm; secondary: CtaBtnForm;
}
const emptyBtn = (): CtaBtnForm => ({ label: "", action: "url", url: "", surveyId: "", open: "newTab" });
const emptyCta = (): CtaFormCard => ({
  id: crypto.randomUUID(),
  eyebrow: "", title: "", description: "", benefits: "",
  primary: emptyBtn(), secondary: emptyBtn(),
});
interface RawCtaButton { label?: string; url?: string; style?: string; action?: string; surveyId?: string; open?: string }
function btnToForm(b?: RawCtaButton): CtaBtnForm {
  return {
    label: b?.label ?? "",
    action: b?.action === "form" ? "form" : "url",
    url: b?.url ?? "",
    surveyId: b?.surveyId ?? "",
    open: b?.open === "modal" ? "modal" : "newTab",
  };
}
function ctaToForm(raw: Record<string, unknown>): CtaFormCard {
  const buttons = Array.isArray(raw.buttons) ? (raw.buttons as RawCtaButton[]) : [];
  return {
    id: crypto.randomUUID(),
    eyebrow: (raw.eyebrow as string) ?? "",
    title: (raw.title as string) ?? "",
    description: (raw.description as string) ?? "",
    benefits: Array.isArray(raw.benefits) ? (raw.benefits as string[]).join("\n") : "",
    primary: btnToForm(buttons.find((b) => b.style !== "ghost")),
    secondary: btnToForm(buttons.find((b) => b.style === "ghost")),
  };
}
/** 편집 폼 → 저장용 버튼 config. 라벨 + (URL 또는 폼) 이 갖춰져야 저장. */
function btnToConfig(b: CtaBtnForm, style: "white" | "ghost"): Record<string, unknown> | null {
  if (!b.label.trim()) return null;
  if (b.action === "form") {
    if (!b.surveyId) return null;
    return { label: b.label.trim(), action: "form", surveyId: b.surveyId, open: b.open, style };
  }
  if (!b.url.trim()) return null;
  const o: Record<string, unknown> = { label: b.label.trim(), url: b.url.trim(), style };
  if (b.open === "modal") o.open = "modal"; // 기본(새 창)은 저장하지 않아 기존 config 와 동일 형태 유지
  return o;
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

export type LivePageSection = "waiting" | "live" | "ended";

const inputCls = "w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors";

// 만들기 › 대기/라이브/종료 화면 편집.
// ⚠️ 세 메뉴가 하나의 인스턴스를 공유한다(PageSetupTab 그룹 키) — livePage 를 통째로 재구성해 저장하므로
// 상태를 쪼개면 다른 화면 데이터가 유실된다. 렌더만 section 으로 게이트.
export default function LivePageTab({ webinar, slug, section, onSilentUpdate }: { webinar: Webinar; slug: string; section: LivePageSection; onSilentUpdate: () => void }) {
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
    qaMode: components.qaMode === "closed" ? ("closed" as const) : ("open" as const),
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
  const youtubeVideoId = getYouTubeVideoId(form.youtubeId);

  // 라이브 페이지 화면(대기·입장·종료) 섹션 on/off + 자료·다음웨비나 데이터
  const [screens, setScreens] = useState(() => normalizeLivePageConfig(webinar.config));
  const [resources, setResources] = useState<LiveResource[]>(() => normalizeLivePageConfig(webinar.config).resources);
  const [nextWeb, setNextWeb] = useState<LiveNextWebinar>(() => normalizeLivePageConfig(webinar.config).nextWebinar ?? { title: "", when: "", url: "" });
  const setW = (k: keyof LivePageConfig["waiting"], v: boolean) => setScreens((s) => ({ ...s, waiting: { ...s.waiting, [k]: v } }));
  const setEn = (k: keyof LivePageConfig["ended"], v: boolean) => setScreens((s) => ({ ...s, ended: { ...s.ended, [k]: v } }));

  const updateCta = (i: number, patch: Partial<CtaFormCard>) =>
    setCtaCards((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  // 폼형 버튼의 연결 대상(자체 설문 = 커스텀 폼) 목록 — CTA 편집에서 선택
  const [surveyOptions, setSurveyOptions] = useState<{ id: string; title: string }[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/webinars/${webinar.id}/surveys`);
        if (cancelled) return;
        if (!res.ok) { setSurveyOptions([]); return; }
        const data = await res.json();
        setSurveyOptions(((data.surveys ?? []) as { id: string; title: string }[]).map((s) => ({ id: s.id, title: s.title })));
      } catch { if (!cancelled) setSurveyOptions([]); }
    })();
    return () => { cancelled = true; };
  }, [webinar.id]);

  const buildLivePage = () => {
    const ctas = ctaCards
      .map((card) => {
        const buttons = [btnToConfig(card.primary, "white"), btnToConfig(card.secondary, "ghost")]
          .filter((b): b is Record<string, unknown> => b !== null);
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
    // 화면 구성 — 섹션 on/off + 자료·다음웨비나 (뷰어는 normalizeLivePageConfig 로 읽음)
    lp.waiting = screens.waiting;
    lp.entry = screens.entry;
    lp.ended = screens.ended;
    const res = resources.filter((r) => r.url.trim());
    if (res.length) lp.resources = res.map((r) => ({ title: r.title.trim() || "자료", meta: r.meta.trim(), url: r.url.trim() }));
    if (nextWeb.title.trim()) lp.nextWebinar = { title: nextWeb.title.trim(), when: nextWeb.when.trim(), url: nextWeb.url.trim() };
    return lp;
  };

  // 자동저장 — 폼·CTA·테마 변경 시 디바운스 후 PATCH. 성공하면 상위 config 를 조용히 최신화.
  const save = async () => {
    try {
      // 입력이 비면 의도적 해제(null)지만, 값이 있는데 파싱 실패면 저장에서 제외한다.
      // 오타 한 글자로 방송 중인 영상 ID 가 지워지는 걸 막는다(경고는 입력란 아래 인라인).
      const youtubeTouched = form.youtubeId.trim() === "" || youtubeVideoId !== null;
      const res = await fetch(`/api/webinars/${webinar.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        keepalive: true, // 페이지 이탈 중 flush 도 서버에 도달하도록
        // 이 탭이 소유한 키만 보낸다 — 서버가 config 를 키 단위로 병합하므로
        // 옛 스냅샷을 스프레드하면 다른 탭이 방금 저장한 값을 되돌린다.
        body: JSON.stringify({
          config: {
            ...(youtubeTouched ? { youtubeId: youtubeVideoId } : {}),
            calendarUrl: form.calendarUrl.trim() || null,
            surveyUrl: form.surveyUrl.trim() || null,
            livePage: buildLivePage(),
          },
          theme,
          // 다른 components 키(allowLiveRegistration 등)는 보존
          components: { chatEnabled: form.chatEnabled, qaMode: form.qaMode },
        }),
      });
      if (!res.ok) { toast.error("자동 저장 실패 — 잠시 후 다시 시도돼요", { id: "autosave-error" }); return false; }
      onSilentUpdate(); // 상위 webinar.config 를 조용히 최신화(탭 간 config 유지, 로더 플래시 없음)
      return true;
    } catch { return false; }
  };
  const { state: saveState, retry } = useAutosave({ form, ctaCards, theme, screens, resources, nextWeb }, save);

  const colorFields: { key: keyof Theme; label: string }[] = [
    { key: "accentColor", label: "키 컬러" },
    { key: "bgColor", label: "배경 컬러" },
    { key: "surfaceColor", label: "서피스 컬러" },
    { key: "textColor", label: "텍스트 컬러" },
  ];

  const previewState = section === "live" ? "live" : section;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl space-y-8">
      {/* ══════════ 대기 화면 ══════════ */}
      {section === "waiting" && (
        <>
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">화면 구성</h3>
              <p className="mt-1 text-xs text-muted-foreground">대기 화면에 보여줄 요소예요. 데이터가 없으면 켜져 있어도 자동으로 숨겨져요.</p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/20 p-4 space-y-2.5">
              <Toggle label="세션 순서(아젠다)" checked={screens.waiting.agenda} onChange={(v) => setW("agenda", v)} desc="세션 탭에 등록한 시간표가 타임라인으로 표시돼요" />
              <Toggle label="등록자 수(사회적 증거)" checked={screens.waiting.social} onChange={(v) => setW("social", v)} />
              <Toggle label="캘린더에 추가" checked={screens.waiting.calendar} onChange={(v) => setW("calendar", v)} desc="아래 캘린더 URL이 있을 때만 표시" />
              <Toggle label="초대 공유" checked={screens.waiting.share} onChange={(v) => setW("share", v)} />
              <Toggle label="시작 알림 받기" checked={screens.waiting.notify} onChange={(v) => setW("notify", v)} desc="이메일 등록자에게 시작 리마인더를 보낼 수 있어요" />
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">캘린더</h3>
              <p className="mt-1 text-xs text-muted-foreground">&ldquo;캘린더에 추가&rdquo; 버튼이 여는 링크예요.</p>
            </div>
            <input type="url" placeholder="https://calendar.google.com/..." value={form.calendarUrl}
              onChange={(e) => setForm((f) => ({ ...f, calendarUrl: e.target.value }))} className={inputCls} />
          </section>
        </>
      )}

      {/* ══════════ 라이브 페이지 (시청 + 입장) ══════════ */}
      {section === "live" && (
        <>
          {/* 영상 */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">영상</h3>
              <p className="mt-1 text-xs text-muted-foreground">시청 화면에 재생될 라이브 방송 소스예요.</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">YouTube 공유 링크 또는 영상 ID</label>
              <input type="text" placeholder="예: https://youtu.be/dQw4w9WgXcQ" value={form.youtubeId}
                onChange={(e) => setForm((f) => ({ ...f, youtubeId: e.target.value }))}
                className={`${inputCls} font-mono ${form.youtubeId.trim() && !youtubeVideoId ? "border-red-400 focus:border-red-400" : ""}`} />
              <p className={`mt-1 text-[11px] ${form.youtubeId.trim() && !youtubeVideoId ? "text-red-500" : "text-muted-foreground"}`}>
                {form.youtubeId.trim() && !youtubeVideoId
                  ? "YouTube 공유 링크 또는 11자리 영상 ID를 입력해 주세요."
                  : "공유 링크를 그대로 붙여 넣어도 자동으로 영상 ID로 저장돼요."}
              </p>
            </div>
          </section>

          {/* 콘텐츠 */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">콘텐츠</h3>
              <p className="mt-1 text-xs text-muted-foreground">시청 화면의 정보·안내 문구예요. 비워두면 표시되지 않아요.</p>
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
            </div>
          </section>

          {/* 입장 화면 */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">입장 화면</h3>
              <p className="mt-1 text-xs text-muted-foreground">라이브 중 미인증 방문자가 보는 입장 확인 화면이에요.</p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/20 p-4">
              <Toggle label="실시간 시청자 수" checked={screens.entry.viewerCount} onChange={(v) => setScreens((s) => ({ ...s, entry: { viewerCount: v } }))}
                desc="'지금 N명이 함께 보고 있어요' — 입장을 유도하는 사회적 증거예요" />
            </div>
          </section>

          {/* 자료 받기 카드 (CTA) — 여러 장 */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">자료 받기 카드 (CTA)</h3>
                <p className="mt-1 text-xs text-muted-foreground">시청 화면 하단에 표시돼요.</p>
              </div>
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
                  <div className="space-y-2">
                    {(["primary", "secondary"] as const).map((slot) => {
                      const btn = card[slot];
                      const upd = (patch: Partial<CtaBtnForm>) => updateCta(i, { [slot]: { ...btn, ...patch } } as Partial<CtaFormCard>);
                      return (
                        <div key={slot} className="space-y-2 rounded-xl border border-border/60 bg-background/60 p-2.5">
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_130px_96px]">
                            <input
                              type="text"
                              placeholder={slot === "primary" ? "메인 버튼 라벨 (예: 자료 받기·문의하기)" : "보조 버튼 라벨 (선택)"}
                              value={btn.label}
                              onChange={(e) => upd({ label: e.target.value })}
                              className={inputCls}
                            />
                            <select value={btn.action} onChange={(e) => upd({ action: e.target.value as CtaBtnAction })} aria-label="버튼 연결 대상" className={inputCls}>
                              <option value="url">링크 (URL)</option>
                              <option value="form">폼 (문의·신청)</option>
                            </select>
                            <select value={btn.open} onChange={(e) => upd({ open: e.target.value as CtaBtnOpen })} aria-label="열기 방식" className={inputCls}>
                              <option value="newTab">새 창</option>
                              <option value="modal">모달</option>
                            </select>
                          </div>
                          {btn.action === "url" ? (
                            <>
                              <input type="url" placeholder="연결 URL (https://…)" value={btn.url} onChange={(e) => upd({ url: e.target.value })} className={inputCls} />
                              {btn.open === "modal" && (
                                <p className="text-[11px] text-amber-600">일부 사이트는 페이지 안 임베드(모달)를 차단해요 — 모달이 비어 보이면 새 창으로 바꿔주세요.</p>
                              )}
                            </>
                          ) : surveyOptions === null ? (
                            <p className="text-[11px] text-muted-foreground">폼 목록 불러오는 중…</p>
                          ) : surveyOptions.length === 0 ? (
                            <p className="text-[11px] text-amber-600">연결할 폼이 없어요 — 만들기 → 설문에서 먼저 만들어주세요. 설문 빌더가 곧 커스텀 폼 빌더예요(문항 자유 구성).</p>
                          ) : (
                            <>
                              <select value={btn.surveyId} onChange={(e) => upd({ surveyId: e.target.value })} aria-label="연결할 폼" className={inputCls}>
                                <option value="">폼 선택…</option>
                                {surveyOptions.map((s) => (
                                  <option key={s.id} value={s.id}>{s.title}</option>
                                ))}
                              </select>
                              <p className="text-[11px] text-muted-foreground">응답은 분석 탭 → 설문 결과에서 개별 확인·CSV로 내려받을 수 있어요.</p>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            <motion.button type="button" whileTap={{ scale: 0.98 }} transition={spring}
              onClick={() => setCtaCards((prev) => [...prev, emptyCta()])}
              className="w-full rounded-xl border border-dashed border-border py-2.5 text-xs font-medium text-violet-500 transition-colors hover:bg-violet-500/5">
              + CTA 카드 추가
            </motion.button>
          </section>

          {/* 알림 받고 이어보기 카드 */}
          <section className="rounded-2xl border border-border bg-secondary/20 p-4 space-y-3">
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
          </section>

          {/* 참여 구성 */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">참여 구성</h3>
              <p className="mt-1 text-xs text-muted-foreground">시청 화면 참여 박스(Q&amp;A·채팅·세션) 구성이에요.</p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/20 p-4 space-y-4">
              <Toggle
                checked={form.chatEnabled}
                onChange={(v) => setForm((f) => ({ ...f, chatEnabled: v }))}
                label="채팅 탭 사용"
                desc="끄면 참여 박스에서 채팅 탭이 사라져요. 라이브 중 메시지 관리는 운영 → 라이브 콘솔 → 실시간 채팅에서."
              />
              <div className="border-t border-border/60 pt-4">
                <ModeChoice
                  value={form.qaMode}
                  onChange={(v) => setForm((f) => ({ ...f, qaMode: v }))}
                  label="Q&A 공개 범위"
                  desc="라이브 중에도 운영 → 라이브 콘솔에서 바꿀 수 있어요."
                  options={[
                    { value: "open", title: "오픈형", desc: "올라온 질문을 시청자끼리 보고 추천할 수 있어요." },
                    { value: "closed", title: "폐쇄형", desc: "질문은 주최자만 봐요. 시청자에겐 질문하기 입력만 보여요." },
                  ]}
                />
              </div>
            </div>
          </section>

          {/* 디자인 */}
          <section className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold">디자인</h3>
              <p className="mt-1 text-xs text-muted-foreground">색상·폰트·톤 — 대기·입장·종료 화면과 등록 페이지에 공통 적용돼요.</p>
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
        </>
      )}

      {/* ══════════ 종료 화면 ══════════ */}
      {section === "ended" && (
        <>
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">화면 구성</h3>
              <p className="mt-1 text-xs text-muted-foreground">종료 화면에 보여줄 요소예요. 데이터가 없으면 켜져 있어도 자동으로 숨겨져요.</p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/20 p-4 space-y-2.5">
              <Toggle label="다시보기 신청" checked={screens.ended.replay} onChange={(v) => setEn("replay", v)} desc="신청자는 알림 수신 목록에 담겨요 — 다시보기 링크를 이메일로 보내세요" />
              <Toggle label="만족도 설문" checked={screens.ended.survey} onChange={(v) => setEn("survey", v)} desc="아래 설문 URL이 있을 때만 표시" />
              <Toggle label="자료 다운로드" checked={screens.ended.resources} onChange={(v) => setEn("resources", v)} desc="아래 자료를 1개 이상 추가해야 표시" />
              <Toggle label="다음 웨비나" checked={screens.ended.nextWebinar} onChange={(v) => setEn("nextWebinar", v)} desc="아래 제목을 입력해야 표시" />
              <Toggle label="공유" checked={screens.ended.share} onChange={(v) => setEn("share", v)} />
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">만족도 설문</h3>
              <p className="mt-1 text-xs text-muted-foreground">&ldquo;설문 참여하기&rdquo; 버튼이 여는 링크예요.</p>
            </div>
            <input type="url" placeholder="https://tally.so/..." value={form.surveyUrl}
              onChange={(e) => setForm((f) => ({ ...f, surveyUrl: e.target.value }))} className={inputCls} />
          </section>

          {screens.ended.resources && (
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">받아가세요 · 자료</h3>
                <p className="mt-1 text-xs text-muted-foreground">종료 화면에서 다운로드 리스트로 표시돼요.</p>
              </div>
              {resources.map((r, i) => (
                <div key={i} className="rounded-xl border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">자료 {i + 1}</span>
                    <button type="button" onClick={() => setResources((p) => p.filter((_, j) => j !== i))} className="text-[11px] text-muted-foreground transition-colors hover:text-red-500">삭제</button>
                  </div>
                  <input className={inputCls} placeholder="제목 (예: 발표자료)" value={r.title} onChange={(e) => setResources((p) => p.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input className={inputCls} placeholder="설명 (예: PDF · 4.2MB)" value={r.meta} onChange={(e) => setResources((p) => p.map((x, j) => (j === i ? { ...x, meta: e.target.value } : x)))} />
                    <input className={inputCls} type="url" placeholder="다운로드 URL" value={r.url} onChange={(e) => setResources((p) => p.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => setResources((p) => [...p, { title: "", meta: "", url: "" }])} className="w-full rounded-xl border border-dashed border-border py-2 text-xs font-medium text-violet-500 transition-colors hover:bg-violet-500/5">+ 자료 추가</button>
            </section>
          )}

          {screens.ended.nextWebinar && (
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">다음 웨비나</h3>
                <p className="mt-1 text-xs text-muted-foreground">종료 화면 하단에 사전등록 티저로 표시돼요.</p>
              </div>
              <input className={inputCls} placeholder="제목 (예: 미국 아마존 입점 A to Z)" value={nextWeb.title} onChange={(e) => setNextWeb((n) => ({ ...n, title: e.target.value }))} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input className={inputCls} placeholder="일시 (예: 8월 21일 오후 2시)" value={nextWeb.when} onChange={(e) => setNextWeb((n) => ({ ...n, when: e.target.value }))} />
                <input className={inputCls} type="url" placeholder="사전등록 URL" value={nextWeb.url} onChange={(e) => setNextWeb((n) => ({ ...n, url: e.target.value }))} />
              </div>
            </section>
          )}
        </>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4">
        <AutosaveIndicator state={saveState} onRetry={retry} />
        <a href={`/live-preview?slug=${encodeURIComponent(slug)}&state=${previewState}`} target="_blank" rel="noopener noreferrer"
          title="저장된 내용 기준으로 새 탭에서 이 화면을 미리봅니다 (영상은 보안상 미표시)"
          className="ml-auto text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5">
          이 화면 미리보기 ↗
        </a>
      </div>
    </div>
  );
}
