"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction, type ElementType } from "react";
import { motion, Reorder, useDragControls } from "framer-motion";
import {
  Plus, Trash2, GripVertical, Link2, Loader2, BarChart3,
  Star, CircleDot, ListChecks, Gauge, AlignLeft, Copy, ChevronDown, ChevronRight, ArrowLeft, Info, X, Smartphone, CalendarClock, CircleCheckBig, ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { useAutosave } from "@/components/ui/use-autosave";
import { useReportAutosave } from "@/components/ui/autosave-scope";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { isSurveyAcceptingResponses, normalizeSurveyQuestions, SURVEY_MAX_QUESTIONS, SURVEY_TYPE_LABELS, type SurveyQuestion, type SurveyQuestionType } from "@/lib/webinar-survey";
import SurveyForm, { SURVEY_FORM_CSS } from "@/app/webinar/[slug]/SurveyForm";
import { buildStkCss } from "@/app/webinar/[slug]/LiveContentStk";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

/** 문항 유형 메타 — 팝오버·칩이 공유. 아이콘+설명으로 각 유형이 뭘 하는지 즉시 보이게. */
const TYPE_META: Record<SurveyQuestionType, { label: string; desc: string; icon: ElementType }> = {
  rating: { label: "별점", desc: "1–5점 만족도", icon: Star },
  single: { label: "객관식 · 단일", desc: "하나만 선택", icon: CircleDot },
  multiple: { label: "객관식 · 복수", desc: "여러 개 · 최대 개수 제한", icon: ListChecks },
  nps: { label: "추천지수 NPS", desc: "0–10 추천 점수", icon: Gauge },
  text: { label: "주관식", desc: "자유 서술형 (최대 2000자)", icon: AlignLeft },
};
const TYPE_ORDER: SurveyQuestionType[] = ["rating", "single", "multiple", "nps", "text"];

/** 척도 고정 유형의 안내 문구 — 편집할 게 없는 이유를 설명한다. */
const FIXED_TYPE_HINT: Partial<Record<SurveyQuestionType, string>> = {
  rating: "별점 1–5개 — 응답자가 별을 눌러 만족도를 매겨요. 척도는 고정이에요.",
  nps: "0–10 추천지수 — 0=전혀 아니에요, 10=매우 그래요. 척도는 고정이에요.",
  text: "주관식 장문 — 응답자가 자유롭게 서술해요 (최대 2000자).",
};

interface AdminSurvey {
  id: string;
  title: string;
  description: string | null;
  questions: SurveyQuestion[];
  isOpen: boolean;
  closesAt: string | null; // 마감 예약 — 지나면 isOpen 과 무관하게 응답 마감
  doneTitle: string | null; // 제출 완료 화면 제목(없으면 기본 문구)
  doneDescription: string | null; // 제출 완료 화면 설명
  showOnEnded: boolean;
  isActive: boolean;
  _count?: { responses: number };
}

/** ISO → datetime-local 입력값(로컬 타임존 yyyy-MM-ddTHH:mm) */
function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

interface ViewerTheme { accent: string; text: string; surface: string }

// 호출 시점마다 새 id 를 만든다 — 모듈 스코프에서 1회 평가하면 한 세션에서 만든 설문들이 문항 id 를 공유한다.
const buildDefaultQuestions = (): SurveyQuestion[] => [
  { id: crypto.randomUUID(), type: "rating", title: "오늘 웨비나는 전반적으로 어떠셨나요?", required: true, options: [] },
  { id: crypto.randomUUID(), type: "single", title: "가장 도움이 된 세션은 무엇인가요?", required: false, options: ["세션 1", "세션 2", "세션 3"] },
  { id: crypto.randomUUID(), type: "nps", title: "동료에게 이 웨비나를 추천하시겠어요?", required: false, options: [] },
  { id: crypto.randomUUID(), type: "text", title: "더 듣고 싶은 주제나 의견을 남겨주세요.", required: false, options: [] },
];

const countOptions = (q: SurveyQuestion) => q.options.filter((o) => o.trim()).length;

/* ---------- 유형 선택 팝오버 (칩·문항 추가 버튼이 공유) ---------- */
function TypeMenu({ current, onPick }: { current?: SurveyQuestionType; onPick: (t: SurveyQuestionType) => void }) {
  return (
    <div className="absolute left-0 top-full z-30 mt-1.5 w-64 rounded-xl border border-border bg-background p-1.5 shadow-xl">
      <p className="px-2 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
        {current ? "질문 유형 변경" : "추가할 유형 선택"}
      </p>
      {TYPE_ORDER.map((t) => {
        const meta = TYPE_META[t];
        const Icon = meta.icon;
        const active = current === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onPick(t)}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${active ? "bg-violet-500/10" : "hover:bg-secondary/70"}`}
          >
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${active ? "bg-violet-500 text-white" : "bg-violet-500/10 text-violet-500"}`}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0">
              <span className={`block text-[13px] font-semibold ${active ? "text-violet-600 dark:text-violet-400" : ""}`}>{meta.label}</span>
              <span className="block text-[11px] text-muted-foreground">{meta.desc}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** 열림 상태 + 바깥 클릭/ESC 닫기를 묶은 훅 */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return { open, setOpen, ref };
}

/* ---------- 문항 카드 ---------- */
function QuestionRow({
  q,
  index,
  setQuestions,
  onRemove,
  onDuplicate,
  onFocusQuestion,
}: {
  q: SurveyQuestion;
  index: number;
  setQuestions: Dispatch<SetStateAction<SurveyQuestion[]>>;
  onRemove: () => void;
  onDuplicate: () => void;
  onFocusQuestion: (qid: string) => void;
}) {
  const dragControls = useDragControls();
  const rootRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<number | null>(null);
  const typePop = usePopover();

  const patch = (next: Partial<SurveyQuestion>) =>
    setQuestions((qs) => qs.map((item) => (item.id === q.id ? { ...item, ...next } : item)));
  const hasOptions = q.type === "single" || q.type === "multiple";
  const optionCount = countOptions(q);

  // 선택지 추가/삭제 후 해당 입력으로 포커스 이동 (리렌더 뒤 실행)
  useEffect(() => {
    if (pendingFocus.current === null) return;
    const el = rootRef.current?.querySelector<HTMLInputElement>(`input[data-opt-idx="${pendingFocus.current}"]`);
    pendingFocus.current = null;
    el?.focus();
  });

  // 옵션이 줄어 maxSelect 가 옵션수 이상이 되면 무제한과 같아진다 — 정규화 규칙·UI 표시와 어긋나지 않게 정리.
  const clampMax = (options: string[], next: Partial<SurveyQuestion>) => {
    const n = options.filter((o) => o.trim()).length;
    if (q.maxSelect !== undefined && q.maxSelect >= n) next.maxSelect = undefined;
    return next;
  };
  const setOption = (idx: number, v: string) => {
    const options = [...q.options];
    options[idx] = v;
    patch(clampMax(options, { options }));
  };
  const addOption = (at: number) => {
    const options = [...q.options];
    options.splice(at, 0, "");
    patch({ options });
    pendingFocus.current = at;
  };
  const removeOption = (at: number, focusPrev = false) => {
    const options = [...q.options];
    if (options.length <= 1) options[at] = "";
    else options.splice(at, 1);
    patch(clampMax(options, { options }));
    if (focusPrev) pendingFocus.current = Math.max(0, at - 1);
  };

  const changeType = (t: SurveyQuestionType) => {
    typePop.setOpen(false);
    if (t === q.type) return;
    const next: Partial<SurveyQuestion> = { type: t };
    if ((t === "single" || t === "multiple") && optionCount === 0) next.options = ["", ""];
    if (t !== "multiple") next.maxSelect = undefined;
    patch(next);
  };

  const meta = TYPE_META[q.type];
  const TypeIcon = meta.icon;

  return (
    <Reorder.Item value={q} dragListener={false} dragControls={dragControls} layout className="rounded-xl bg-secondary/40 transition-colors focus-within:bg-secondary/60">
      <div ref={rootRef} onFocusCapture={() => onFocusQuestion(q.id)}>
        <div className="flex items-center gap-1 px-2 pt-2">
          <button
            type="button"
            aria-label="순서 변경"
            onPointerDown={(e) => { e.preventDefault(); dragControls.start(e); }}
            className="grid h-8 w-7 shrink-0 cursor-grab place-items-center rounded-md text-muted-foreground/40 transition-colors hover:text-muted-foreground active:cursor-grabbing touch-none"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <span className="w-7 shrink-0 text-center font-mono text-[10px] font-semibold text-muted-foreground/70">Q{index + 1}</span>

          <div className="relative" ref={typePop.ref}>
            <button
              type="button"
              onClick={() => typePop.setOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={typePop.open}
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-background px-2 py-1.5 text-xs font-semibold shadow-sm transition-shadow hover:shadow"
            >
              <span className="grid h-5 w-5 place-items-center rounded-md bg-violet-500/10 text-violet-500"><TypeIcon className="h-3 w-3" /></span>
              {meta.label}
              <ChevronDown className="h-3 w-3 text-muted-foreground/60" />
            </button>
            {typePop.open && <TypeMenu current={q.type} onPick={changeType} />}
          </div>

          <span className="flex-1" />
          <label className={`flex select-none items-center gap-1.5 text-[11px] ${q.required ? "font-semibold text-amber-600" : "text-muted-foreground"}`}>
            필수
            <Switch checked={q.required} onChange={(v) => patch({ required: v })} label={`${q.title || "문항"} 필수`} />
          </label>
          <button type="button" onClick={onDuplicate} aria-label="문항 복제" className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground/50 transition-colors hover:bg-background hover:text-foreground">
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onRemove} aria-label="문항 삭제" className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground/50 transition-colors hover:bg-red-500/10 hover:text-red-500">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="px-3 pb-3 pl-[42px] pt-1">
          <input
            value={q.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="질문을 입력하세요"
            aria-label="문항"
            className="w-full bg-transparent pb-2 text-[14px] font-semibold tracking-tight outline-none placeholder:font-normal placeholder:text-muted-foreground/50"
          />

          {hasOptions && (
            <div className="space-y-1.5">
              {q.options.map((opt, idx) => (
                <div key={idx} className="group flex items-center gap-2 rounded-lg bg-background px-2.5 shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-violet-400/50">
                  <span className={`h-3.5 w-3.5 shrink-0 border-[1.5px] border-muted-foreground/40 ${q.type === "multiple" ? "rounded-[5px]" : "rounded-full"}`} />
                  <input
                    value={opt}
                    data-opt-idx={idx}
                    onChange={(e) => setOption(idx, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing) return; // 한글 조합 중 Enter 무시
                      if (e.key === "Enter") { e.preventDefault(); addOption(idx + 1); }
                      else if (e.key === "Backspace" && e.currentTarget.value === "" && q.options.length > 1) { e.preventDefault(); removeOption(idx, true); }
                    }}
                    placeholder={`선택지 ${idx + 1}`}
                    aria-label={`${q.title || "문항"} 선택지 ${idx + 1}`}
                    className="min-w-0 flex-1 bg-transparent py-2 text-[13px] outline-none placeholder:text-muted-foreground/40"
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(idx)}
                    aria-label={`선택지 ${idx + 1} 삭제`}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground/40 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-500 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => addOption(q.options.length)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-violet-500 transition-colors hover:bg-violet-500/10">
                <Plus className="h-3.5 w-3.5" />선택지 추가 <span className="font-normal text-muted-foreground/60">— 입력 중 Enter 로도 추가돼요</span>
              </button>

              {optionCount === 0 && (
                <p className="flex items-center gap-1.5 pt-0.5 text-[11px] text-amber-600">
                  <Info className="h-3 w-3 shrink-0" />선택지가 없으면 응답 화면에 표시되지 않아요{q.required ? " — 필수 문항이라 제출도 막혀요" : ""}.
                </p>
              )}

              {q.type === "multiple" && optionCount >= 2 && (
                <div className="mt-1 flex flex-wrap items-center gap-1.5 border-t border-dashed border-border pt-2.5">
                  <span className="mr-1 text-[11px] font-medium text-muted-foreground">최대 선택</span>
                  <button
                    type="button"
                    aria-pressed={q.maxSelect === undefined}
                    onClick={() => patch({ maxSelect: undefined })}
                    className={`h-6 rounded-md px-2 text-[11px] font-semibold shadow-sm transition-colors ${q.maxSelect === undefined ? "bg-violet-500 text-white" : "bg-background text-muted-foreground hover:text-foreground"}`}
                  >
                    무제한
                  </button>
                  {/* 옵션 전체 선택 = 무제한과 같으므로 옵션수-1 까지만 제공(저장 규칙과 일치) */}
                  {Array.from({ length: optionCount - 1 }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={q.maxSelect === n}
                      onClick={() => patch({ maxSelect: n })}
                      className={`h-6 min-w-7 rounded-md px-2 text-[11px] font-semibold tabular-nums shadow-sm transition-colors ${q.maxSelect === n ? "bg-violet-500 text-white" : "bg-background text-muted-foreground hover:text-foreground"}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {!hasOptions && (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
              <Info className="h-3 w-3 shrink-0" />{FIXED_TYPE_HINT[q.type]}
            </p>
          )}
        </div>
      </div>
    </Reorder.Item>
  );
}

/* ---------- 응답자 실시간 미리보기 — 실제 뷰어 컴포넌트(SurveyForm)를 STK 테마로 그대로 렌더 ---------- */
const PREVIEW_CSS = `
.stk-live.svprev { background:var(--card-2); padding:20px 14px 28px; min-height:100%; }
.stk-live.svprev .pv-head { text-align:center; margin-bottom:16px; padding:0 4px; }
.stk-live.svprev .pv-kick { font-size:10px; font-weight:750; letter-spacing:.14em; text-transform:uppercase; color:var(--key); margin:0 0 6px; }
.stk-live.svprev .pv-title { font-size:17px; font-weight:820; letter-spacing:-.02em; color:var(--text); margin:0; word-break:keep-all; }
.stk-live.svprev .pv-desc { font-size:12px; line-height:1.6; color:var(--muted); margin:7px 0 0; white-space:pre-wrap; word-break:keep-all; }
.stk-live.svprev .pv-card { background:var(--card); border-radius:16px; box-shadow:var(--card-shadow); padding:18px 15px; }
.stk-live.svprev .pv-empty { text-align:center; font-size:12px; line-height:1.8; color:var(--muted); margin:6px 0; }
`;

function SurveyPreview({
  slug,
  webinarName,
  title,
  description,
  questions,
  theme,
  bodyRef,
}: {
  slug: string;
  webinarName?: string;
  title: string;
  description: string;
  questions: SurveyQuestion[];
  theme: ViewerTheme;
  bodyRef: React.RefObject<HTMLDivElement | null>;
}) {
  const css = useMemo(
    () => buildStkCss(theme.accent, theme.text, theme.surface) + SURVEY_FORM_CSS + PREVIEW_CSS,
    [theme.accent, theme.text, theme.surface],
  );
  // 뷰어 경로와 같은 정규화 — 빈 제목·선택지 0개 객관식은 실제 응답 화면처럼 숨긴다.
  const visible = useMemo(() => normalizeSurveyQuestions(questions), [questions]);

  return (
    <div className="mx-auto w-full max-w-[440px] 2xl:sticky 2xl:top-4">
      <div className="mb-2 flex items-center gap-1.5 px-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
        <Smartphone className="h-3 w-3" />응답자 미리보기
        <span className="ml-auto inline-flex items-center gap-1.5 text-emerald-500">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" />실시간
        </span>
      </div>
      <div className="overflow-hidden rounded-[24px] shadow-xl">
        <div className="flex h-8 items-center justify-center bg-secondary/70 px-3">
          <span className="truncate font-mono text-[10px] text-muted-foreground/80">…/webinar/{slug}/survey</span>
        </div>
        <div ref={bodyRef} className="relative max-h-[min(760px,calc(100vh-230px))] overflow-y-auto overscroll-contain">
          <style dangerouslySetInnerHTML={{ __html: css }} />
          <div className="stk-live svprev">
            <div className="pv-head">
              {webinarName && <p className="pv-kick">{webinarName}</p>}
              <h4 className="pv-title">{title.trim() || "제목 없는 설문"}</h4>
              {description.trim() !== "" && <p className="pv-desc">{description}</p>}
            </div>
            <div className="pv-card">
              {visible.length === 0 ? (
                <p className="pv-empty">아직 표시할 문항이 없어요.<br />질문 제목과 선택지를 채우면 바로 나타나요.</p>
              ) : (
                <SurveyForm
                  questions={visible}
                  onSubmit={() => toast.success("미리보기 제출 완료 — 실제 응답으로 저장되지는 않아요")}
                />
              )}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-2 px-1 text-center text-[11px] text-muted-foreground/70">직접 눌러볼 수 있어요 — 필수 검증·선택 제한도 그대로 동작해요.</p>
    </div>
  );
}

/* ---------- 설문 1개 편집기 — 자체 자동저장(디바운스 PATCH) + 인접 실시간 미리보기 ---------- */
function SurveyEditor({
  webinarId,
  slug,
  webinarName,
  theme,
  survey,
  onDeleted,
  onMetaChanged,
}: {
  webinarId: string;
  slug: string;
  webinarName?: string;
  theme: ViewerTheme;
  survey: AdminSurvey;
  onDeleted: () => void;
  onMetaChanged: (patch: Partial<AdminSurvey>) => void;
}) {
  const [title, setTitle] = useState(survey.title);
  const [description, setDescription] = useState(survey.description ?? "");
  const [questions, setQuestions] = useState<SurveyQuestion[]>(survey.questions);
  const [doneTitle, setDoneTitle] = useState(survey.doneTitle ?? "");
  const [doneDescription, setDoneDescription] = useState(survey.doneDescription ?? "");
  const [copied, setCopied] = useState(false);
  // 보관 문항(retired)은 편집 대상이 아니다 — 답변이 있어 정의만 남겨둔 것이라
  // 편집 목록·드래그에서 빼고 아래 별도 섹션에 읽기 전용으로 보여준다.
  const activeQuestions = useMemo(() => questions.filter((q) => !q.retired), [questions]);
  const retiredQuestions = useMemo(() => questions.filter((q) => q.retired), [questions]);
  // 순서 변경은 활성 문항에만 적용하고 보관 문항은 항상 뒤에 유지한다.
  const setActiveOrder = (next: SurveyQuestion[]) => setQuestions([...next, ...retiredQuestions]);
  const confirm = useConfirm();
  const addPop = usePopover();
  const previewBodyRef = useRef<HTMLDivElement>(null);
  const lastFocusRef = useRef<string | null>(null);

  const save = async () => {
    try {
      const res = await fetch(`/api/webinars/${webinarId}/surveys/${survey.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ title, description, questions, doneTitle, doneDescription }),
      });
      if (!res.ok) { toast.error("자동 저장 실패 — 잠시 후 다시 시도돼요", { id: "autosave-error" }); return false; }
      // 목록(마스터-디테일) 왕복 후 재진입해도 방금 저장한 값으로 초기화되도록 부모 캐시 동기화
      // (빠뜨린 필드는 재진입 시 옛 값으로 되돌아가 다음 자동저장이 그 옛 값을 다시 저장한다)
      onMetaChanged({
        title,
        description: description.trim() || null,
        questions,
        doneTitle: doneTitle.trim() || null,
        doneDescription: doneDescription.trim() || null,
      });
      return true;
    } catch { return false; }
  };
  const { state: saveState, retry } = useAutosave({ title, description, questions, doneTitle, doneDescription }, save);
  // 표시는 껍데기 한 곳에서 그린다(만들기 화면당 1개) — 저장 경로는 그대로 각자.
  useReportAutosave(saveState, retry);

  const toggle = async (key: "isOpen" | "showOnEnded", value: boolean) => {
    const res = await fetch(`/api/webinars/${webinarId}/surveys/${survey.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    });
    if (res.ok) onMetaChanged({ [key]: value });
    else toast.error("변경에 실패했어요");
  };

  // 마감 예약 — 입력 중엔 로컬 draft, 확정(blur/해제)에만 PATCH (datetime-local 은 필드 편집마다 change 가 발생)
  const [closesDraft, setClosesDraft] = useState(() => toLocalInputValue(survey.closesAt));
  useEffect(() => { setClosesDraft(toLocalInputValue(survey.closesAt)); }, [survey.closesAt]);
  const commitClosesAt = async (local: string) => {
    const iso = local ? new Date(local).toISOString() : null;
    if (toLocalInputValue(iso) === toLocalInputValue(survey.closesAt)) return; // 변경 없음
    const res = await fetch(`/api/webinars/${webinarId}/surveys/${survey.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closesAt: iso }),
    });
    if (res.ok) onMetaChanged({ closesAt: iso });
    else { toast.error("마감 예약 변경에 실패했어요"); setClosesDraft(toLocalInputValue(survey.closesAt)); }
  };
  const scheduledClosed = !!survey.closesAt && new Date(survey.closesAt).getTime() <= Date.now();

  const remove = async () => {
    if (!(await confirm({
      title: "설문을 삭제할까요?",
      description: `"${title}" — 응답 ${survey._count?.responses ?? 0}건도 함께 삭제돼요. 되돌릴 수 없어요.`,
      confirmLabel: "삭제",
      tone: "danger",
    }))) return;
    const res = await fetch(`/api/webinars/${webinarId}/surveys/${survey.id}`, { method: "DELETE" });
    if (res.ok) { toast.success("설문을 삭제했어요"); onDeleted(); }
    else toast.error("삭제에 실패했어요");
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/webinar/${slug}/survey/${survey.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { toast.error("복사에 실패했어요"); }
  };

  const addQuestion = (t: SurveyQuestionType) => {
    addPop.setOpen(false);
    // 상한을 넘겨 저장하면 서버가 400 으로 막는다 → 누르기 전에 알려준다(예전엔 조용히 잘렸다).
    if (activeQuestions.length >= SURVEY_MAX_QUESTIONS) {
      toast.error(`문항은 최대 ${SURVEY_MAX_QUESTIONS}개까지예요.`);
      return;
    }
    const q: SurveyQuestion = { id: crypto.randomUUID(), type: t, title: "", required: false, options: t === "single" || t === "multiple" ? ["", ""] : [] };
    setQuestions((prev) => [...prev, q]);
  };

  const duplicateQuestion = (id: string) => {
    setQuestions((prev) => {
      const i = prev.findIndex((item) => item.id === id);
      if (i < 0) return prev;
      const copy: SurveyQuestion = { ...prev[i], id: crypto.randomUUID(), options: [...prev[i].options] };
      return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
    });
  };

  // 편집 중인 문항을 미리보기에서 하이라이트·스크롤 (미리보기 컨테이너만 스크롤 — 페이지는 안 움직이게)
  const focusQuestion = useCallback((qid: string) => {
    if (lastFocusRef.current === qid) return;
    lastFocusRef.current = qid;
    const cont = previewBodyRef.current;
    const el = cont?.querySelector<HTMLElement>(`#sv-q-${CSS.escape(qid)}`);
    if (!cont || !el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cRect = cont.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    const top = cont.scrollTop + (eRect.top - cRect.top) - cont.clientHeight / 2 + eRect.height / 2;
    cont.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
    if (!reduce) {
      el.animate(
        [{ backgroundColor: `color-mix(in srgb, ${theme.accent} 9%, transparent)`, borderRadius: "12px" }, { backgroundColor: "transparent", borderRadius: "12px" }],
        { duration: 900, easing: "ease-out" },
      );
    }
  }, [theme.accent]);

  return (
    <div className="rounded-2xl bg-background p-4 shadow-sm sm:p-5">
      <div className="space-y-5 2xl:grid 2xl:grid-cols-[minmax(0,1fr)_440px] 2xl:gap-8 2xl:space-y-0">
        {/* ---- 편집 컬럼 ---- */}
        <div className="min-w-0 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="설문 제목"
                aria-label="설문 제목"
                className="w-full bg-transparent text-[16px] font-bold tracking-tight outline-none placeholder:font-normal placeholder:text-muted-foreground/50"
              />
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="설명 (선택) — 응답 페이지 상단에 표시"
                aria-label="설문 설명"
                className="mt-0.5 w-full bg-transparent text-[13px] text-muted-foreground outline-none placeholder:text-muted-foreground/40"
              />
            </div>
            <button type="button" onClick={remove} aria-label="설문 삭제" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground/50 transition-colors hover:bg-red-500/10 hover:text-red-500">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <Reorder.Group axis="y" values={activeQuestions} onReorder={setActiveOrder} className="space-y-2">
            {activeQuestions.map((q, i) => (
              <QuestionRow
                key={q.id}
                q={q}
                index={i}
                setQuestions={setQuestions}
                onRemove={() => setQuestions((prev) => prev.filter((item) => item.id !== q.id))}
                onDuplicate={() => duplicateQuestion(q.id)}
                onFocusQuestion={focusQuestion}
              />
            ))}
          </Reorder.Group>

          <div className="relative" ref={addPop.ref}>
            <button
              type="button"
              onClick={() => addPop.setOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={addPop.open}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-secondary/40 py-2.5 text-xs font-semibold text-violet-500 transition-colors hover:bg-violet-500/10"
            >
              <Plus className="h-3.5 w-3.5" />질문 추가
            </button>
            {addPop.open && <TypeMenu onPick={addQuestion} />}
          </div>

          {/* 보관된 문항 — 지웠지만 이미 받은 답변이 있어 정의를 남겨둔 것.
              응답 화면에는 안 나오고, 분석·개별응답·CSV 에서 지난 답변을 계속 볼 수 있다.
              편집 값이 아니라 읽는 값이므로 요약만 보여준다(원칙 1: 읽는 영역). */}
          {retiredQuestions.length > 0 && (
            <div className="space-y-1.5 rounded-xl border border-border bg-secondary/20 p-3">
              <p className="text-[11px] font-semibold text-muted-foreground">
                보관된 문항 {retiredQuestions.length}개
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground/80">
                지운 문항이지만 받은 답변이 있어 분석·CSV 에서 볼 수 있도록 남겨뒀어요. 응답 화면에는 나오지 않아요.
              </p>
              <ul className="space-y-1 pt-1">
                {retiredQuestions.map((q) => (
                  <li key={q.id} className="flex items-baseline gap-2 text-xs text-muted-foreground">
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">
                      {SURVEY_TYPE_LABELS[q.type]}
                    </span>
                    <span className="break-words">{q.title || "(제목 없음)"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 제출 완료 화면 — 응답 제출 후 보이는 문구(비우면 기본 문구). 응답 링크·라이브 푸시·CTA 모달 공통 적용. */}
          <div className="space-y-2 rounded-xl border border-border bg-secondary/20 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
              <CircleCheckBig className="h-3.5 w-3.5 text-violet-500" />제출 완료 화면
            </p>
            <input
              value={doneTitle}
              onChange={(e) => setDoneTitle(e.target.value)}
              placeholder="완료 제목 (비우면 기본: 소중한 의견 감사합니다)"
              aria-label="제출 완료 제목"
              className="w-full bg-transparent text-[13px] font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground/50"
            />
            <textarea
              value={doneDescription}
              onChange={(e) => setDoneDescription(e.target.value)}
              rows={2}
              placeholder="완료 설명 (선택) — 예: 문의가 접수됐어요. 담당자가 확인 후 연락드릴게요."
              aria-label="제출 완료 설명"
              className="w-full resize-none bg-transparent text-[12px] leading-relaxed text-muted-foreground outline-none placeholder:text-muted-foreground/50"
            />
          </div>

          {questions.some((q) => !q.title.trim()) && (
            <p className="text-[11px] text-muted-foreground/70">제목이 빈 문항은 저장은 되지만 응답 화면에는 표시되지 않아요.</p>
          )}
          {(survey._count?.responses ?? 0) > 0 && (
            <p className="text-[11px] text-amber-600">
              이미 {survey._count?.responses}건이 응답했어요 — 문항을 지우거나 선택지 문구를 바꾸면 기존 응답이 결과 집계에서 빠져요.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-3">
            <label className="flex select-none items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={survey.isOpen} onChange={(v) => toggle("isOpen", v)} label="응답 받기" />
              응답 받기
            </label>
            <label className="flex select-none items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={survey.showOnEnded} onChange={(v) => toggle("showOnEnded", v)} label="종료 화면에 연결" />
              종료 화면에 연결
            </label>
            <label className="flex select-none items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" />마감 예약
              <input
                type="datetime-local"
                value={closesDraft}
                onChange={(e) => setClosesDraft(e.target.value)}
                onBlur={(e) => void commitClosesAt(e.target.value)}
                aria-label="마감 예약 시각"
                className="rounded-md border border-border bg-background px-1.5 py-1 text-[11px] tabular-nums transition-colors focus:border-violet-400 focus:outline-none"
              />
              {survey.closesAt && (
                <button
                  type="button"
                  onClick={() => { setClosesDraft(""); void commitClosesAt(""); }}
                  aria-label="마감 예약 해제"
                  className="grid h-5 w-5 place-items-center rounded text-muted-foreground/50 transition-colors hover:bg-red-500/10 hover:text-red-500"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
              {scheduledClosed && (
                <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">예약 시각이 지나 마감됨</span>
              )}
            </label>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/70"><BarChart3 className="h-3 w-3" />응답 {survey._count?.responses ?? 0}건</span>
            <button type="button" onClick={copyLink} className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
              <Link2 className="h-3.5 w-3.5" />{copied ? "복사됨 ✓" : "응답 링크 복사"}
            </button>
          </div>
        </div>

        {/* ---- 미리보기 컬럼 ---- */}
        <div className="min-w-0">
          <SurveyPreview
            slug={slug}
            webinarName={webinarName}
            title={title}
            description={description}
            questions={questions}
            theme={theme}
            bodyRef={previewBodyRef}
          />
        </div>
      </div>
    </div>
  );
}

export default function SurveyTab({
  webinarId,
  slug,
  webinarName,
  theme,
}: {
  webinarId: string;
  slug: string;
  webinarName?: string;
  theme?: Record<string, string>;
}) {
  const [surveys, setSurveys] = useState<AdminSurvey[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null); // 목록↔상세(마스터-디테일)

  const viewerTheme: ViewerTheme = useMemo(() => ({
    accent: theme?.accentColor || "#6D28D9",
    text: theme?.textColor || "#141320",
    surface: theme?.surfaceColor || "#FFFFFF",
  }), [theme]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/webinars/${webinarId}/surveys`);
      if (!res.ok) return;
      const data = await res.json();
      setSurveys(data.surveys ?? []);
    } catch { /* 다음 시도 */ }
  }, [webinarId]);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    setCreating(true);
    try {
      const res = await fetch(`/api/webinars/${webinarId}/surveys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "만족도 설문", questions: buildDefaultQuestions() }),
      });
      if (!res.ok) { toast.error("설문 생성에 실패했어요"); return; }
      const data = await res.json();
      setSurveys((prev) => [...(prev ?? []), data.survey]);
      setSelectedId(data.survey.id); // 만들면 바로 편집으로
    } finally { setCreating(false); }
  };

  // ── 상세(선택된 설문 편집) — 목록에서 클릭하면 진입 ──
  const selected = surveys?.find((s) => s.id === selectedId) ?? null;
  if (selected) {
    return (
      <div className="max-w-[1600px] space-y-4 p-4 sm:p-6 lg:p-8">
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />설문 목록
        </button>
        <SurveyEditor
          key={selected.id}
          webinarId={webinarId}
          slug={slug}
          webinarName={webinarName}
          theme={viewerTheme}
          survey={selected}
          onDeleted={() => { setSurveys((prev) => (prev ?? []).filter((item) => item.id !== selected.id)); setSelectedId(null); }}
          onMetaChanged={(patch) =>
            setSurveys((prev) => (prev ?? []).map((item) => {
              if (item.id !== selected.id) return patch.showOnEnded === true ? { ...item, showOnEnded: false } : item;
              return { ...item, ...patch };
            }))
          }
        />
      </div>
    );
  }

  // ── 목록 ──
  return (
    <div className="max-w-3xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">설문</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            종료 화면·라이브 푸시·응답 링크에서 같은 설문으로 응답을 모아요. 결과는 분석 탭에서.
          </p>
        </div>
        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.96 }}
          transition={spring}
          onClick={create}
          disabled={creating}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-violet-500 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-violet-600 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />새 설문
        </motion.button>
      </div>

      {surveys === null && (
        <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      )}
      {surveys?.length === 0 && (
        <div className="space-y-2 rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium">아직 설문이 없어요</p>
          <p className="text-xs text-muted-foreground">새 설문을 만들면 만족도 템플릿(별점·객관식·추천지수·주관식)으로 시작해요.</p>
        </div>
      )}

      {/* 설문 목록 — 카드 하나 = 설문 하나. 클릭하면 편집으로 (밑으로 길게 쌓이지 않게) */}
      {surveys && surveys.length > 0 && (
        <div className="space-y-2">
          {surveys.map((s) => {
            const qCount = s.questions.filter((q) => q.title.trim() && !((q.type === "single" || q.type === "multiple") && q.options.filter(Boolean).length === 0)).length;
            const accepting = isSurveyAcceptingResponses(s);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedId(s.id)}
                className="group flex w-full items-center gap-3 rounded-2xl bg-background p-4 text-left shadow-sm transition-all hover:shadow-md hover:ring-1 hover:ring-violet-400/40"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
                  <ClipboardList className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-semibold">{s.title || "제목 없는 설문"}</span>
                    {s.isActive && <span className="rounded-full bg-green-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-green-600 dark:text-green-400">송출 중</span>}
                    {s.showOnEnded && <span className="rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400">종료 화면</span>}
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${accepting ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-secondary text-muted-foreground"}`}>
                      {accepting ? "응답 받는 중" : "마감"}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground tabular-nums">
                    {qCount}문항 · 응답 {(s._count?.responses ?? 0).toLocaleString()}건
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-violet-500" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
