"use client";

// 만들기 → 랜딩 페이지 — 외부 사이트(아임웹 등)에 임베드하는 상세페이지 편집.
// 모든 값은 config.landingPage 한 곳에 저장되고 공개 페이지(/webinar/[slug]/landing)가 그대로 렌더한다.
// 섹션은 "토글 ON + 실제 내용 있음"일 때만 공개 페이지에 노출된다(빈 껍데기 방지 — 읽기에서 걸러짐).

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Plus, Trash2, Image as ImageIcon, Clapperboard, Ban, Loader2, UploadCloud, Link2 } from "lucide-react";
import { toast } from "sonner";
import { useAutosave } from "@/components/ui/use-autosave";
import { AutosaveIndicator } from "@/components/ui/autosave-indicator";
import { Switch } from "@/components/ui/switch";
import {
  normalizeLandingPageConfig,
  type LandingFaqItem,
  type LandingHighlightItem,
  type LandingJoinStep,
  type LandingProgramItem,
} from "@/lib/webinar-config";
import { LANDING_IMAGE_ACCEPT, LANDING_VIDEO_ACCEPT, validateLandingMedia } from "@/lib/webinar-landing-media";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;
const inputCls =
  "w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors";
const labelCls = "block text-xs font-medium text-muted-foreground mb-1";

interface Webinar {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  config: Record<string, unknown>;
}

type HeroMediaType = "none" | "image" | "video";

interface EditorState {
  enabled: boolean;
  heroMediaType: HeroMediaType;
  heroMediaUrl: string;
  brand: string;
  titleText: string; // 줄바꿈 = 히어로 타이틀 줄 나눔
  subtitle: string;
  venue: string;
  ctaLabel: string;
  intro: { enabled: boolean; title: string; body: string };
  sessionsEnabled: boolean;
  timetableEnabled: boolean;
  programs: { enabled: boolean; items: LandingProgramItem[] };
  highlights: { enabled: boolean; items: LandingHighlightItem[] };
  join: { enabled: boolean; steps: LandingJoinStep[] };
  faq: { enabled: boolean; items: LandingFaqItem[] };
}

function toEditorState(config: Record<string, unknown>): EditorState {
  const lp = normalizeLandingPageConfig(config);
  return {
    enabled: lp.enabled,
    heroMediaType: lp.heroMedia ? lp.heroMedia.type : "none",
    heroMediaUrl: lp.heroMedia?.url ?? "",
    brand: lp.brand,
    titleText: lp.titleLines.join("\n"),
    subtitle: lp.subtitle,
    venue: lp.venue,
    ctaLabel: lp.ctaLabel,
    intro: lp.intro,
    sessionsEnabled: lp.sessions.enabled,
    timetableEnabled: lp.timetable.enabled,
    programs: lp.programs,
    highlights: lp.highlights,
    join: lp.join,
    faq: lp.faq,
  };
}

function toConfigPayload(s: EditorState) {
  return {
    enabled: s.enabled,
    heroMedia:
      s.heroMediaType !== "none" && s.heroMediaUrl.trim()
        ? { type: s.heroMediaType, url: s.heroMediaUrl.trim() }
        : null,
    brand: s.brand,
    titleLines: s.titleText.split("\n").map((line) => line.trim()).filter(Boolean),
    subtitle: s.subtitle,
    venue: s.venue,
    ctaLabel: s.ctaLabel,
    intro: s.intro,
    sessions: { enabled: s.sessionsEnabled },
    timetable: { enabled: s.timetableEnabled },
    programs: s.programs,
    highlights: s.highlights,
    join: s.join,
    faq: s.faq,
  };
}

function SectionCard({
  title,
  hint,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  hint?: string;
  enabled?: boolean;
  onToggle?: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          {hint && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
        </div>
        {onToggle && (
          <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            표시
            <Switch checked={enabled ?? false} onChange={onToggle} label={`${title} 표시`} />
          </label>
        )}
      </div>
      {children && <div className="mt-4 space-y-3">{children}</div>}
    </section>
  );
}

function RowShell({ onRemove, children }: { onRemove: () => void; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-background/60 p-2.5">
      <div className="min-w-0 flex-1 space-y-2">{children}</div>
      <button
        type="button"
        onClick={onRemove}
        className="mt-0.5 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
        aria-label="항목 삭제"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function AddRowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.98 }}
      transition={spring}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-violet-400 hover:text-violet-500"
    >
      <Plus className="h-3.5 w-3.5" /> {label}
    </motion.button>
  );
}

const MEDIA_TYPES: { id: HeroMediaType; label: string; icon: typeof Ban }[] = [
  { id: "none", label: "없음", icon: Ban },
  { id: "image", label: "이미지", icon: ImageIcon },
  { id: "video", label: "동영상", icon: Clapperboard },
];

export default function LandingPageTab({
  webinar,
  onSilentUpdate,
}: {
  webinar: Webinar;
  onSilentUpdate: () => void;
}) {
  const [state, setState] = useState<EditorState>(() => toEditorState(webinar.config));
  const [previewNonce, setPreviewNonce] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const patch = (updates: Partial<EditorState>) => setState((prev) => ({ ...prev, ...updates }));

  // 히어로 배경 파일 업로드 — 성공하면 URL 필드를 채우고 자동저장이 이어서 영속화한다
  const uploadHeroMedia = async (file: File) => {
    const validationError = validateLandingMedia(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setIsUploading(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(`/api/webinars/${webinar.id}/landing-media`, { method: "POST", body });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) {
        toast.error(data?.error ?? "업로드에 실패했어요.");
        return;
      }
      patch({ heroMediaType: data.type === "video" ? "video" : "image", heroMediaUrl: data.url });
      toast.success("업로드했어요");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const { state: saveState, retry } = useAutosave(state, async (value) => {
    const res = await fetch(`/api/webinars/${webinar.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: { landingPage: toConfigPayload(value) } }),
    });
    if (res.ok) onSilentUpdate();
    return res.ok;
  });

  // 저장 완료 시 미리보기 새로고침 — 공개 페이지가 저장된 값을 다시 읽는다
  useEffect(() => {
    if (saveState === "saved") setPreviewNonce((n) => n + 1);
  }, [saveState]);

  const previewUrl = useMemo(
    () => `/webinar/${webinar.slug}/landing?preview=1&r=${previewNonce}`,
    [webinar.slug, previewNonce],
  );

  const setRows = <K extends "programs" | "highlights" | "faq">(key: K, items: EditorState[K]["items"]) =>
    setState((prev) => ({ ...prev, [key]: { ...prev[key], items } }));

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-[1600px] space-y-6 2xl:grid 2xl:grid-cols-[minmax(0,1fr)_440px] 2xl:items-start 2xl:gap-6 2xl:space-y-0">
        <div className="min-w-0 space-y-4">
          {/* 상단: 공개 스위치 + 저장 상태 + 미리보기 */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <Switch checked={state.enabled} onChange={(v) => patch({ enabled: v })} label="랜딩 페이지 공개" />
              <div>
                <p className="text-sm font-semibold">{state.enabled ? "공개 중" : "비공개"}</p>
                <p className="text-xs text-muted-foreground">
                  {state.enabled
                    ? "링크와 임베드로 접근할 수 있어요. 배포 탭에서 임베드 코드를 복사하세요."
                    : "끄면 링크·임베드 모두 비공개 안내만 보여요."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <AutosaveIndicator state={saveState} onRetry={retry} />
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium transition-colors hover:border-violet-400 hover:text-violet-500"
              >
                <ExternalLink className="h-3.5 w-3.5" /> 새 탭에서 미리보기
              </a>
            </div>
          </div>

          {/* 히어로 */}
          <SectionCard title="히어로" hint="첫 화면 — 비워두면 웨비나 이름·설명·일시가 자동으로 들어가요.">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>브랜드 라벨</label>
                <input className={inputCls} value={state.brand} onChange={(e) => patch({ brand: e.target.value })} placeholder={webinar.name} />
              </div>
              <div>
                <label className={labelCls}>일시 옆 라벨</label>
                <input className={inputCls} value={state.venue} onChange={(e) => patch({ venue: e.target.value })} placeholder="ONLINE LIVE" />
              </div>
            </div>
            <div>
              <label className={labelCls}>대형 타이틀 (줄바꿈 = 줄 나눔)</label>
              <textarea
                className={`${inputCls} resize-none`}
                rows={2}
                value={state.titleText}
                onChange={(e) => patch({ titleText: e.target.value })}
                placeholder={webinar.name}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>부제</label>
                <input
                  className={inputCls}
                  value={state.subtitle}
                  onChange={(e) => patch({ subtitle: e.target.value })}
                  placeholder={(webinar.description ?? "").split("\n")[0] || "부제를 입력하세요"}
                />
              </div>
              <div>
                <label className={labelCls}>등록 버튼 문구</label>
                <input className={inputCls} value={state.ctaLabel} onChange={(e) => patch({ ctaLabel: e.target.value })} placeholder="사전 등록하기" />
              </div>
            </div>
            <div>
              <label className={labelCls}>배경 미디어</label>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-xl border border-border p-0.5">
                  {MEDIA_TYPES.map((mediaType) => {
                    const Icon = mediaType.icon;
                    const active = state.heroMediaType === mediaType.id;
                    return (
                      <button
                        key={mediaType.id}
                        type="button"
                        onClick={() => patch({ heroMediaType: mediaType.id })}
                        className={`inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          active ? "bg-violet-500 text-white" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" /> {mediaType.label}
                      </button>
                    );
                  })}
                </div>
                {state.heroMediaType !== "none" && (
                  <>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium transition-colors hover:border-violet-400 hover:text-violet-500 disabled:opacity-50"
                    >
                      {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
                      {isUploading ? "올리는 중…" : "파일 올리기"}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={state.heroMediaType === "video" ? LANDING_VIDEO_ACCEPT : LANDING_IMAGE_ACCEPT}
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.currentTarget.files?.[0];
                        if (file) void uploadHeroMedia(file);
                      }}
                    />
                    <div className="relative flex-1 min-w-[220px]">
                      <Link2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <input
                        className={`${inputCls} pl-8`}
                        value={state.heroMediaUrl}
                        onChange={(e) => patch({ heroMediaUrl: e.target.value })}
                        placeholder={state.heroMediaType === "video" ? "또는 URL 붙여넣기 (mp4)" : "또는 URL 붙여넣기 (jpg·png)"}
                      />
                    </div>
                  </>
                )}
              </div>
              {state.heroMediaType !== "none" && state.heroMediaUrl.trim() && (
                <div className="mt-2 overflow-hidden rounded-xl border border-border bg-black/40">
                  {state.heroMediaType === "video" ? (
                    <video src={state.heroMediaUrl} className="h-28 w-full object-cover" muted loop autoPlay playsInline />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- 어드민 미리보기(임의 호스트 URL)
                    <img src={state.heroMediaUrl} alt="배경 미리보기" className="h-28 w-full object-cover" />
                  )}
                </div>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground">
                이미지 5MB·동영상 50MB까지. 없으면 키컬러 그라디언트가 배경이 돼요. 동영상은 자동재생·음소거·반복으로 깔려요.
              </p>
            </div>
          </SectionCard>

          {/* 소개 */}
          <SectionCard
            title="소개"
            hint="히어로 다음의 한 문단 — 비우면 웨비나 설명이 그대로 들어가요."
            enabled={state.intro.enabled}
            onToggle={(v) => patch({ intro: { ...state.intro, enabled: v } })}
          >
            <div>
              <label className={labelCls}>제목</label>
              <input
                className={inputCls}
                value={state.intro.title}
                onChange={(e) => patch({ intro: { ...state.intro, title: e.target.value } })}
                placeholder={(webinar.description ?? "").split("\n")[0] || "소개 제목"}
              />
            </div>
            <div>
              <label className={labelCls}>본문 (줄바꿈 유지)</label>
              <textarea
                className={`${inputCls} resize-y`}
                rows={3}
                value={state.intro.body}
                onChange={(e) => patch({ intro: { ...state.intro, body: e.target.value } })}
                placeholder={webinar.description ?? ""}
              />
            </div>
          </SectionCard>

          {/* 세션 · 타임테이블 */}
          <SectionCard title="세션 · 타임테이블" hint="내용은 만들기 → 세션에서 관리해요. 여기서는 랜딩 노출만 켜고 끕니다.">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/60 px-3 py-2.5 text-sm">
                연사 카드 (세션 소개)
                <Switch checked={state.sessionsEnabled} onChange={(v) => patch({ sessionsEnabled: v })} label="연사 카드 표시" />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/60 px-3 py-2.5 text-sm">
                타임테이블
                <Switch checked={state.timetableEnabled} onChange={(v) => patch({ timetableEnabled: v })} label="타임테이블 표시" />
              </label>
            </div>
            <p className="text-[11px] text-muted-foreground">
              이 구간에서 배경이 키컬러로 전환돼요. 연사 사진은 세션의 연사 사진을 그대로 사용해요.
            </p>
          </SectionCard>

          {/* 프로그램 */}
          <SectionCard
            title="프로그램"
            hint="무엇을 다루는지 2열 카드로 — 제목이 있는 항목만 노출돼요."
            enabled={state.programs.enabled}
            onToggle={(v) => patch({ programs: { ...state.programs, enabled: v } })}
          >
            {state.programs.items.map((item, index) => (
              <RowShell key={index} onRemove={() => setRows("programs", state.programs.items.filter((_, i) => i !== index))}>
                <div className="flex gap-2">
                  <input
                    className={`${inputCls} w-24 shrink-0`}
                    value={item.icon}
                    onChange={(e) => setRows("programs", state.programs.items.map((r, i) => (i === index ? { ...r, icon: e.target.value } : r)))}
                    placeholder="배지 (예: Q&A)"
                  />
                  <input
                    className={inputCls}
                    value={item.title}
                    onChange={(e) => setRows("programs", state.programs.items.map((r, i) => (i === index ? { ...r, title: e.target.value } : r)))}
                    placeholder="제목"
                  />
                </div>
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={2}
                  value={item.description}
                  onChange={(e) => setRows("programs", state.programs.items.map((r, i) => (i === index ? { ...r, description: e.target.value } : r)))}
                  placeholder="설명 (줄바꿈 유지)"
                />
              </RowShell>
            ))}
            <AddRowButton label="프로그램 추가" onClick={() => setRows("programs", [...state.programs.items, { icon: "", title: "", description: "" }])} />
          </SectionCard>

          {/* 하이라이트 */}
          <SectionCard
            title="하이라이트"
            hint="참여 이유 3~4가지 — 번호(01·02·…)는 자동으로 붙어요."
            enabled={state.highlights.enabled}
            onToggle={(v) => patch({ highlights: { ...state.highlights, enabled: v } })}
          >
            {state.highlights.items.map((item, index) => (
              <RowShell key={index} onRemove={() => setRows("highlights", state.highlights.items.filter((_, i) => i !== index))}>
                <input
                  className={inputCls}
                  value={item.title}
                  onChange={(e) => setRows("highlights", state.highlights.items.map((r, i) => (i === index ? { ...r, title: e.target.value } : r)))}
                  placeholder={`제목 (${String(index + 1).padStart(2, "0")})`}
                />
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={2}
                  value={item.description}
                  onChange={(e) => setRows("highlights", state.highlights.items.map((r, i) => (i === index ? { ...r, description: e.target.value } : r)))}
                  placeholder="설명"
                />
              </RowShell>
            ))}
            <AddRowButton label="하이라이트 추가" onClick={() => setRows("highlights", [...state.highlights.items, { title: "", description: "" }])} />
          </SectionCard>

          {/* 참여 방법 */}
          <SectionCard
            title="참여 방법"
            hint="Step 1·2·3 — 온라인 웨비나 공통 절차가 기본으로 채워져 있어요."
            enabled={state.join.enabled}
            onToggle={(v) => patch({ join: { ...state.join, enabled: v } })}
          >
            {state.join.steps.map((step, index) => (
              <RowShell
                key={index}
                onRemove={() => patch({ join: { ...state.join, steps: state.join.steps.filter((_, i) => i !== index) } })}
              >
                <input
                  className={inputCls}
                  value={step.title}
                  onChange={(e) =>
                    patch({ join: { ...state.join, steps: state.join.steps.map((r, i) => (i === index ? { ...r, title: e.target.value } : r)) } })
                  }
                  placeholder={`Step ${index + 1} 제목`}
                />
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={2}
                  value={step.description}
                  onChange={(e) =>
                    patch({
                      join: { ...state.join, steps: state.join.steps.map((r, i) => (i === index ? { ...r, description: e.target.value } : r)) },
                    })
                  }
                  placeholder="설명"
                />
              </RowShell>
            ))}
            <AddRowButton label="단계 추가" onClick={() => patch({ join: { ...state.join, steps: [...state.join.steps, { title: "", description: "" }] } })} />
          </SectionCard>

          {/* FAQ */}
          <SectionCard
            title="FAQ"
            hint="같은 카테고리끼리 탭으로 묶여요. 질문이 있는 항목만 노출돼요."
            enabled={state.faq.enabled}
            onToggle={(v) => patch({ faq: { ...state.faq, enabled: v } })}
          >
            {state.faq.items.map((item, index) => (
              <RowShell key={index} onRemove={() => setRows("faq", state.faq.items.filter((_, i) => i !== index))}>
                <div className="flex gap-2">
                  <input
                    className={`${inputCls} w-28 shrink-0`}
                    value={item.category}
                    onChange={(e) => setRows("faq", state.faq.items.map((r, i) => (i === index ? { ...r, category: e.target.value } : r)))}
                    placeholder="카테고리"
                  />
                  <input
                    className={inputCls}
                    value={item.question}
                    onChange={(e) => setRows("faq", state.faq.items.map((r, i) => (i === index ? { ...r, question: e.target.value } : r)))}
                    placeholder="질문"
                  />
                </div>
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={2}
                  value={item.answer}
                  onChange={(e) => setRows("faq", state.faq.items.map((r, i) => (i === index ? { ...r, answer: e.target.value } : r)))}
                  placeholder="답변 (줄바꿈 유지)"
                />
              </RowShell>
            ))}
            <AddRowButton label="질문 추가" onClick={() => setRows("faq", [...state.faq.items, { category: "참가신청", question: "", answer: "" }])} />
          </SectionCard>
        </div>

        {/* 미리보기 — 공개 페이지 자체를 iframe 으로(저장 완료 시 갱신). 2xl 미만에선 아래로 쌓임 */}
        <div className="2xl:sticky 2xl:top-6">
          <div className="overflow-hidden rounded-2xl border border-border bg-[#06080d] shadow-sm">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
              <span className="text-xs font-medium text-white/70">미리보기</span>
              <span className="text-[10px] text-white/40">저장되면 자동 갱신</span>
            </div>
            <iframe
              key={previewNonce}
              src={previewUrl}
              title="랜딩 페이지 미리보기"
              className="h-[640px] w-full border-0"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
