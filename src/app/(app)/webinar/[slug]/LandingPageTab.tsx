"use client";

// 만들기 → 랜딩 페이지 — 외부 사이트(아임웹 등)에 임베드하는 상세페이지 편집.
// 모든 값은 config.landingPage 한 곳에 저장되고 공개 페이지(/webinar/[slug]/landing)가 그대로 렌더한다.
// 섹션은 "토글 ON + 실제 내용 있음"일 때만 공개 페이지에 노출된다(빈 껍데기 방지 — 읽기에서 걸러짐).

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Clapperboard, Ban, Loader2, UploadCloud, Link2, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { useAutosave } from "@/components/ui/use-autosave";
import { useReportAutosave } from "@/components/ui/autosave-scope";
import { Switch } from "@/components/ui/switch";
import {
  normalizeLandingPageConfig,
  type LandingFaqItem,
  type LandingHighlightItem,
  type LandingJoinStep,
  type LandingProgramItem,
} from "@/lib/webinar-config";
import { LANDING_IMAGE_ACCEPT, LANDING_VIDEO_ACCEPT, validateLandingMedia } from "@/lib/webinar-landing-media";
import { FINISH, FIELD_CLS, Segmented } from "@/components/ui/primitives";
import { EditableList, ROW_KEY, withRowKeys, stripRowKeys, type WithRowKey } from "@/components/ui/editable-list";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;
// 입력 값은 프리미티브 한 곳에서 온다 — 예전엔 탭마다 로컬 선언이라 값이 3종으로 갈렸다.
const inputCls = FIELD_CLS;
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
  sessionsDetailPopup: boolean;
  timetableEnabled: boolean;
  programs: { enabled: boolean; items: WithRowKey<LandingProgramItem>[] };
  highlights: { enabled: boolean; items: WithRowKey<LandingHighlightItem>[] };
  join: { enabled: boolean; steps: WithRowKey<LandingJoinStep>[] };
  faq: { enabled: boolean; items: WithRowKey<LandingFaqItem>[] };
}

function toEditorState(config: Record<string, unknown>): EditorState {
  // keepEmptyRows: 편집 중에는 제목 없는 행도 살려둔다. 공개 렌더용 필터를 그대로 쓰면
  // 아직 제목을 안 쓴 행이 리마운트 때 사라지고, 다음 자동저장이 그 배열을 덮어써 DB 에서도 없어진다.
  const lp = normalizeLandingPageConfig(config, { keepEmptyRows: true });
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
    sessionsDetailPopup: lp.sessions.detailPopup,
    timetableEnabled: lp.timetable.enabled,
    // 이 네 목록은 스키마에 id 가 없다 → 편집 중에만 클라이언트 키를 붙인다(저장 시 제거).
    programs: { ...lp.programs, items: withRowKeys(lp.programs.items) },
    highlights: { ...lp.highlights, items: withRowKeys(lp.highlights.items) },
    join: { ...lp.join, steps: withRowKeys(lp.join.steps) },
    faq: { ...lp.faq, items: withRowKeys(lp.faq.items) },
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
    sessions: { enabled: s.sessionsEnabled, detailPopup: s.sessionsDetailPopup },
    timetable: { enabled: s.timetableEnabled },
    programs: { ...s.programs, items: stripRowKeys(s.programs.items) },
    highlights: { ...s.highlights, items: stripRowKeys(s.highlights.items) },
    join: { ...s.join, steps: stripRowKeys(s.join.steps) },
    faq: { ...s.faq, items: stripRowKeys(s.faq.items) },
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
    <section className={`rounded-2xl bg-card p-4 sm:p-5 ${FINISH.s1}`}>
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
    } catch {
      // try/finally 만 있으면 네트워크 실패가 unhandled rejection 으로 사라져
      // 어드민은 "눌렸는데 아무 일도 없다" 만 본다.
      toast.error("업로드 중 문제가 생겼어요. 연결을 확인하고 다시 시도해주세요.");
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
      keepalive: true, // 페이지 이탈 중 flush 도 서버에 도달하도록 (탭 닫기 시 마지막 편집 유실 방지)
    });
    if (res.ok) onSilentUpdate();
    else toast.error("랜딩 페이지 저장에 실패했어요. 잠시 후 다시 시도돼요.");
    return res.ok;
  });
  // 표시는 껍데기 한 곳에서 그린다(만들기 화면당 1개) — 저장 경로는 그대로 각자.
  useReportAutosave(saveState, retry);

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
          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card p-4 sm:p-5 ${FINISH.s1}`}>
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
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener"
                className={`inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-xs font-medium transition-colors hover:text-violet-500 ${FINISH.control}`}
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
                {/* 선택 칸이 bg-violet-500 + 흰 글자였다 — 그건 Btn tone="key", 즉 **주요 버튼**의
                    모양이다. 세그먼트 칸은 액션이 아니라 상태라서 잘못된 신호였고, 선택 관용구도
                    한 개 더 늘리고 있었다. SELECTED 를 쓰는 Segmented 로 흡수. */}
                <Segmented
                  label="배경 미디어"
                  value={state.heroMediaType}
                  onChange={(next) => patch({ heroMediaType: next })}
                  options={MEDIA_TYPES.map((m) => {
                    const Icon = m.icon;
                    return {
                      value: m.id,
                      label: (<><Icon className="h-3.5 w-3.5" /> {m.label}</>),
                    };
                  })}
                />
                {state.heroMediaType !== "none" && (
                  <>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className={`inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-xs font-medium transition-colors hover:text-violet-500 disabled:opacity-50 ${FINISH.control}`}
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
                <div className={`mt-2 overflow-hidden rounded-xl bg-black/40 ${FINISH.s2}`}>
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
              <label className={`flex items-center justify-between gap-3 rounded-xl bg-secondary px-3 py-2.5 text-sm ${FINISH.s2}`}>
                연사 카드 (세션 소개)
                <Switch checked={state.sessionsEnabled} onChange={(v) => patch({ sessionsEnabled: v })} label="연사 카드 표시" />
              </label>
              <label className={`flex items-center justify-between gap-3 rounded-xl bg-secondary px-3 py-2.5 text-sm ${FINISH.s2}`}>
                타임테이블
                <Switch checked={state.timetableEnabled} onChange={(v) => patch({ timetableEnabled: v })} label="타임테이블 표시" />
              </label>
            </div>
            <label className={`flex items-center justify-between gap-3 rounded-xl bg-secondary px-3 py-2.5 text-sm ${FINISH.s2} transition-opacity ${state.sessionsEnabled ? "" : "opacity-50"}`}>
              <span>
                카드 클릭 시 상세 팝업
                <span className="mt-0.5 block text-[11px] text-muted-foreground">주제·세션 내용·연사 사진·소속·약력을 팝업으로 보여줘요.</span>
              </span>
              <Switch checked={state.sessionsDetailPopup} onChange={(v) => patch({ sessionsDetailPopup: v })} disabled={!state.sessionsEnabled} label="상세 팝업 열기" />
            </label>
            <p className="text-[11px] text-muted-foreground">
              내용(소속·직책·약력 포함)은 만들기 → 세션에서 관리해요. 이 구간에서 배경이 키컬러로 전환돼요.
            </p>
          </SectionCard>

          {/* 프로그램 */}
          <SectionCard
            title="프로그램"
            hint="무엇을 다루는지 2열 카드로 — 제목이 있는 항목만 노출돼요."
            enabled={state.programs.enabled}
            onToggle={(v) => patch({ programs: { ...state.programs, enabled: v } })}
          >
            <EditableList
              listId="lp-programs" itemNoun="프로그램" reorderable
              items={state.programs.items} onChange={(next) => setRows("programs", next)}
              rowKey={(r) => r[ROW_KEY]}
              makeItem={() => ({ icon: "", title: "", description: "", [ROW_KEY]: crypto.randomUUID() })}
              addLabel="프로그램 추가" emptyState={<p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">아직 프로그램이 없어요. 아래에서 추가하면 랜딩 페이지에 표시돼요.</p>}
              renderRow={({ item, patch: p }) => (
                <>
                  <div className="flex gap-2">
                    <input className={`${inputCls} w-24 shrink-0`} value={item.icon} onChange={(e) => p({ icon: e.target.value })} placeholder="배지 (예: Q&A)" />
                    <input className={inputCls} value={item.title} onChange={(e) => p({ title: e.target.value })} placeholder="제목" />
                  </div>
                  <textarea className={`${inputCls} resize-none`} rows={2} value={item.description} onChange={(e) => p({ description: e.target.value })} placeholder="설명 (줄바꿈 유지)" />
                </>
              )}
            />
          </SectionCard>

          {/* 하이라이트 */}
          <SectionCard
            title="하이라이트"
            hint="참여 이유 3~4가지 — 번호(01·02·…)는 자동으로 붙어요."
            enabled={state.highlights.enabled}
            onToggle={(v) => patch({ highlights: { ...state.highlights, enabled: v } })}
          >
            <EditableList
              listId="lp-highlights" itemNoun="하이라이트" reorderable
              items={state.highlights.items} onChange={(next) => setRows("highlights", next)}
              rowKey={(r) => r[ROW_KEY]}
              makeItem={() => ({ title: "", description: "", [ROW_KEY]: crypto.randomUUID() })}
              addLabel="하이라이트 추가" emptyState={<p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">아직 하이라이트이 없어요. 아래에서 추가하면 랜딩 페이지에 표시돼요.</p>}
              renderRow={({ item, index, patch: p }) => (
                <>
                  {/* 번호(01·02)는 입력값이 아니라 렌더 순서에서 파생 — 드래그로 순서를 바꾸면 즉시 재계산된다 */}
                  <input className={inputCls} value={item.title} onChange={(e) => p({ title: e.target.value })} placeholder={`제목 (${String(index + 1).padStart(2, "0")})`} />
                  <textarea className={`${inputCls} resize-none`} rows={2} value={item.description} onChange={(e) => p({ description: e.target.value })} placeholder="설명" />
                </>
              )}
            />
          </SectionCard>

          {/* 참여 방법 */}
          <SectionCard
            title="참여 방법"
            hint="Step 1·2·3 — 온라인 웨비나 공통 절차가 기본으로 채워져 있어요."
            enabled={state.join.enabled}
            onToggle={(v) => patch({ join: { ...state.join, enabled: v } })}
          >
            <EditableList
              listId="lp-join" itemNoun="단계" reorderable
              items={state.join.steps} onChange={(steps) => patch({ join: { ...state.join, steps } })}
              rowKey={(r) => r[ROW_KEY]}
              makeItem={() => ({ title: "", description: "", [ROW_KEY]: crypto.randomUUID() })}
              addLabel="단계 추가" emptyState={<p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">아직 단계이 없어요. 아래에서 추가하면 랜딩 페이지에 표시돼요.</p>}
              renderRow={({ item, index, patch: p }) => (
                <>
                  <input className={inputCls} value={item.title} onChange={(e) => p({ title: e.target.value })} placeholder={`Step ${index + 1} 제목`} />
                  <textarea className={`${inputCls} resize-none`} rows={2} value={item.description} onChange={(e) => p({ description: e.target.value })} placeholder="설명" />
                </>
              )}
            />
          </SectionCard>

          {/* FAQ */}
          <SectionCard
            title="FAQ"
            hint="같은 카테고리끼리 탭으로 묶여요. 질문이 있는 항목만 노출돼요."
            enabled={state.faq.enabled}
            onToggle={(v) => patch({ faq: { ...state.faq, enabled: v } })}
          >
            <EditableList
              listId="lp-faq" itemNoun="질문" reorderable
              items={state.faq.items} onChange={(next) => setRows("faq", next)}
              rowKey={(r) => r[ROW_KEY]}
              makeItem={() => ({ category: "참가신청", question: "", answer: "", [ROW_KEY]: crypto.randomUUID() })}
              addLabel="질문 추가" emptyState={<p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">아직 질문이 없어요. 아래에서 추가하면 랜딩 페이지에 표시돼요.</p>}
              renderRow={({ item, patch: p }) => (
                <>
                  <div className="flex gap-2">
                    <input className={`${inputCls} w-28 shrink-0`} value={item.category} onChange={(e) => p({ category: e.target.value })} placeholder="카테고리" />
                    <input className={inputCls} value={item.question} onChange={(e) => p({ question: e.target.value })} placeholder="질문" />
                  </div>
                  <textarea className={`${inputCls} resize-none`} rows={2} value={item.answer} onChange={(e) => p({ answer: e.target.value })} placeholder="답변 (줄바꿈 유지)" />
                </>
              )}
            />
          </SectionCard>
        </div>

        {/* 미리보기 — 공개 페이지 자체를 iframe 으로(저장 완료 시 갱신). 2xl 미만에선 아래로 쌓임 */}
        <div className="2xl:sticky 2xl:top-6">
          <div className={`overflow-hidden rounded-2xl bg-[#06080d] ${FINISH.s2}`}>
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
