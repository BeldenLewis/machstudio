"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { motion, Reorder, useDragControls } from "framer-motion";
import { Plus, Trash2, GripVertical, Link2, Loader2, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { useAutosave } from "@/components/ui/use-autosave";
import { AutosaveIndicator } from "@/components/ui/autosave-indicator";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { SURVEY_TYPE_LABELS, type SurveyQuestion, type SurveyQuestionType } from "@/lib/webinar-survey";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

const inputCls = "w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors disabled:opacity-40";
// 문항 인라인 편집 그리드 — 그립 | 문항 | 타입 | 필수 | 삭제
const ROW_GRID = "grid grid-cols-[24px_minmax(0,1fr)_140px_36px_24px] gap-2 items-center";

interface AdminSurvey {
  id: string;
  title: string;
  description: string | null;
  questions: SurveyQuestion[];
  isOpen: boolean;
  showOnEnded: boolean;
  isActive: boolean;
  _count?: { responses: number };
}

const DEFAULT_QUESTIONS: SurveyQuestion[] = [
  { id: crypto.randomUUID(), type: "rating", title: "오늘 웨비나는 전반적으로 어떠셨나요?", required: true, options: [] },
  { id: crypto.randomUUID(), type: "single", title: "가장 도움이 된 세션은 무엇인가요?", required: false, options: ["세션 1", "세션 2", "세션 3"] },
  { id: crypto.randomUUID(), type: "nps", title: "동료에게 이 웨비나를 추천하시겠어요?", required: false, options: [] },
  { id: crypto.randomUUID(), type: "text", title: "더 듣고 싶은 주제나 의견을 남겨주세요.", required: false, options: [] },
];

function QuestionRow({
  q,
  setQuestions,
  onRemove,
}: {
  q: SurveyQuestion;
  setQuestions: Dispatch<SetStateAction<SurveyQuestion[]>>;
  onRemove: () => void;
}) {
  const dragControls = useDragControls();
  const patch = (next: Partial<SurveyQuestion>) =>
    setQuestions((qs) => qs.map((item) => (item.id === q.id ? { ...item, ...next } : item)));
  const hasOptions = q.type === "single" || q.type === "multiple";

  return (
    <Reorder.Item value={q} dragListener={false} dragControls={dragControls} layout className="rounded-xl border border-border bg-background px-2 py-2">
      <div className={ROW_GRID}>
        <button
          type="button"
          aria-label="순서 변경"
          onPointerDown={(e) => { e.preventDefault(); dragControls.start(e); }}
          className="p-1 rounded-md text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none transition-colors justify-self-center"
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <input value={q.title} onChange={(e) => patch({ title: e.target.value })} placeholder="문항을 입력하세요" aria-label="문항" className={inputCls} />
        <select value={q.type} onChange={(e) => patch({ type: e.target.value as SurveyQuestionType })} aria-label="타입" className={inputCls}>
          {(Object.keys(SURVEY_TYPE_LABELS) as SurveyQuestionType[]).map((t) => (
            <option key={t} value={t}>{SURVEY_TYPE_LABELS[t]}</option>
          ))}
        </select>
        <Switch checked={q.required} onChange={(v) => patch({ required: v })} label={`${q.title || "문항"} 필수`} />
        <button type="button" onClick={onRemove} aria-label="문항 삭제" className="p-1 rounded-md text-muted-foreground/50 hover:text-red-500 transition-colors justify-self-center">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {hasOptions && (
        <div className="mt-2 ml-8 mr-1">
          <textarea
            rows={2}
            value={q.options.join("\n")}
            onChange={(e) => patch({ options: e.target.value.split("\n").map((v) => v.trim()).filter(Boolean) })}
            placeholder={"선택지 — 한 줄에 하나씩"}
            className={`${inputCls} resize-none`}
          />
        </div>
      )}
    </Reorder.Item>
  );
}

// 설문 1개 편집기 — 자체 자동저장(디바운스 PATCH)
function SurveyEditor({
  webinarId,
  slug,
  survey,
  onDeleted,
  onMetaChanged,
}: {
  webinarId: string;
  slug: string;
  survey: AdminSurvey;
  onDeleted: () => void;
  onMetaChanged: (patch: Partial<AdminSurvey>) => void;
}) {
  const [title, setTitle] = useState(survey.title);
  const [description, setDescription] = useState(survey.description ?? "");
  const [questions, setQuestions] = useState<SurveyQuestion[]>(survey.questions);
  const [copied, setCopied] = useState(false);
  const confirm = useConfirm();

  const save = async () => {
    try {
      const res = await fetch(`/api/webinars/${webinarId}/surveys/${survey.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ title, description, questions }),
      });
      if (!res.ok) { toast.error("자동 저장 실패 — 잠시 후 다시 시도돼요", { id: "autosave-error" }); return false; }
      return true;
    } catch { return false; }
  };
  const { state: saveState, retry } = useAutosave({ title, description, questions }, save);

  const toggle = async (key: "isOpen" | "showOnEnded", value: boolean) => {
    const res = await fetch(`/api/webinars/${webinarId}/surveys/${survey.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    });
    if (res.ok) onMetaChanged({ [key]: value });
    else toast.error("변경에 실패했어요");
  };

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

  return (
    <div className="rounded-2xl border border-border bg-background p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="설문 제목" className={`${inputCls} font-semibold`} />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="설명 (선택) — 응답 페이지 상단에 표시" aria-label="설문 설명" className={inputCls} />
        </div>
        <button type="button" onClick={remove} aria-label="설문 삭제" className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-red-500 hover:bg-red-500/10 transition-colors shrink-0">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <Reorder.Group axis="y" values={questions} onReorder={setQuestions} className="space-y-1.5">
        {questions.map((q) => (
          <QuestionRow key={q.id} q={q} setQuestions={setQuestions} onRemove={() => setQuestions((prev) => prev.filter((item) => item.id !== q.id))} />
        ))}
      </Reorder.Group>
      <button
        type="button"
        onClick={() => setQuestions((prev) => [...prev, { id: crypto.randomUUID(), type: "text", title: "", required: false, options: [] }])}
        className="w-full rounded-xl border border-dashed border-border py-2 text-xs font-medium text-violet-500 transition-colors hover:bg-violet-500/5"
      >
        + 문항 추가
      </button>
      {questions.some((q) => !q.title.trim()) && (
        <p className="text-[11px] text-muted-foreground/70">제목이 빈 문항은 저장은 되지만 응답 화면에는 표시되지 않아요.</p>
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground select-none">
          <Switch checked={survey.isOpen} onChange={(v) => toggle("isOpen", v)} label="응답 받기" />
          응답 받기
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground select-none">
          <Switch checked={survey.showOnEnded} onChange={(v) => toggle("showOnEnded", v)} label="종료 화면에 연결" />
          종료 화면에 연결
        </label>
        <span className="text-xs text-muted-foreground/70 inline-flex items-center gap-1"><BarChart3 className="w-3 h-3" />응답 {survey._count?.responses ?? 0}건</span>
        <button type="button" onClick={copyLink} className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <Link2 className="w-3.5 h-3.5" />{copied ? "복사됨 ✓" : "응답 링크 복사"}
        </button>
        <AutosaveIndicator state={saveState} onRetry={retry} />
      </div>
    </div>
  );
}

export default function SurveyTab({ webinarId, slug }: { webinarId: string; slug: string }) {
  const [surveys, setSurveys] = useState<AdminSurvey[] | null>(null);
  const [creating, setCreating] = useState(false);

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
        body: JSON.stringify({ title: "만족도 설문", questions: DEFAULT_QUESTIONS }),
      });
      if (!res.ok) { toast.error("설문 생성에 실패했어요"); return; }
      const data = await res.json();
      setSurveys((prev) => [...(prev ?? []), data.survey]);
    } finally { setCreating(false); }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">설문</h3>
          <p className="text-sm text-muted-foreground mt-1">
            종료 화면·라이브 푸시·응답 링크에서 같은 설문으로 응답을 모아요. 결과는 분석 탭에서.
          </p>
        </div>
        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.96 }}
          transition={spring}
          onClick={create}
          disabled={creating}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-500 text-white text-xs font-medium hover:bg-violet-600 transition-colors shrink-0 disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" />새 설문
        </motion.button>
      </div>

      {surveys === null && (
        <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
      )}
      {surveys?.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center space-y-2">
          <p className="text-sm font-medium">아직 설문이 없어요</p>
          <p className="text-xs text-muted-foreground">새 설문을 만들면 만족도 템플릿(별점·객관식·추천지수·주관식)으로 시작해요.</p>
        </div>
      )}
      {surveys?.map((s) => (
        <SurveyEditor
          key={s.id}
          webinarId={webinarId}
          slug={slug}
          survey={s}
          onDeleted={() => setSurveys((prev) => (prev ?? []).filter((item) => item.id !== s.id))}
          onMetaChanged={(patch) =>
            setSurveys((prev) => (prev ?? []).map((item) => {
              if (item.id !== s.id) return patch.showOnEnded === true ? { ...item, showOnEnded: false } : item;
              return { ...item, ...patch };
            }))
          }
        />
      ))}
    </div>
  );
}
