"use client";

import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Clock, Edit3, ImagePlus, Link2, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useUndoableDelete } from "@/components/ui/use-undoable-delete";
import { SPEAKER_PHOTO_ACCEPT, validateSpeakerPhoto } from "@/lib/webinar-speaker-photo";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

// 세션 유형 — 라이브 Q&A 칩은 "세션"만, 아젠다엔 전부(유형 표시)
const SESSION_TYPES = [
  { value: "session", label: "세션" },
  { value: "qa", label: "Q&A" },
  { value: "break", label: "휴식" },
] as const;
const TYPE_LABEL: Record<string, string> = { session: "세션", qa: "Q&A", break: "휴식" };

interface WebinarSession {
  id: string;
  number: number;
  type: string;
  title: string;
  speaker: string | null;
  speakerCompany: string | null;
  speakerPhotoUrl: string | null;
  description: string | null;
  speakerBio: string | null;
  startTime: string;
  endTime: string;
}

interface SessionForm {
  number: string;
  type: string;
  title: string;
  speaker: string;
  speakerCompany: string;
  speakerPhotoUrl: string;
  description: string;
  speakerBio: string;
  startTime: string;
  endTime: string;
}

const emptyForm: SessionForm = {
  number: "",
  type: "session",
  title: "",
  speaker: "",
  speakerCompany: "",
  speakerPhotoUrl: "",
  description: "",
  speakerBio: "",
  startTime: "",
  endTime: "",
};

function toForm(session: WebinarSession): SessionForm {
  return {
    number: String(session.number),
    type: session.type || "session",
    title: session.title,
    speaker: session.speaker ?? "",
    speakerCompany: session.speakerCompany ?? "",
    speakerPhotoUrl: session.speakerPhotoUrl ?? "",
    description: session.description ?? "",
    speakerBio: session.speakerBio ?? "",
    startTime: session.startTime,
    endTime: session.endTime,
  };
}

function SessionFormFields({
  webinarId,
  form,
  setForm,
}: {
  webinarId: string;
  form: SessionForm;
  setForm: Dispatch<SetStateAction<SessionForm>>;
}) {
  const [photoSource, setPhotoSource] = useState<"upload" | "url">("upload");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadPhoto = async (file: File) => {
    const validationError = validateSpeakerPhoto(file);
    if (validationError) { toast.error(validationError); return; }

    setIsUploading(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(`/api/webinars/${webinarId}/speaker-photo`, { method: "POST", body });
      const data = await res.json().catch(() => null);
      if (!res.ok || typeof data?.url !== "string") {
        toast.error(data?.error ?? "사진 업로드에 실패했어요.");
        return;
      }
      setForm((f) => ({ ...f, speakerPhotoUrl: data.url }));
      toast.success("연사 사진을 올렸어요");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-4 sm:col-span-2">
        <label className="text-xs text-muted-foreground mb-1 block">번호</label>
        <input
          type="number"
          min={1}
          value={form.number}
          onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
          className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors"
        />
      </div>
      <div className="col-span-8 sm:col-span-3">
        <label className="text-xs text-muted-foreground mb-1 block">유형</label>
        <select
          value={form.type}
          onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
          className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors"
        >
          {SESSION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <div className="col-span-12 sm:col-span-7">
        <label className="text-xs text-muted-foreground mb-1 block">제목</label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder={form.type === "break" ? "예: 휴식" : form.type === "qa" ? "예: 라이브 Q&A" : "예: AI 기반 데이터 분석 플랫폼의 혁신"}
          className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors"
        />
      </div>
      <div className="col-span-12 sm:col-span-4">
        <label className="text-xs text-muted-foreground mb-1 block">연사 이름</label>
        <input
          type="text"
          value={form.speaker}
          onChange={(e) => setForm((f) => ({ ...f, speaker: e.target.value }))}
          placeholder="홍길동"
          className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors"
        />
      </div>
      <div className="col-span-12 sm:col-span-4">
        <label className="text-xs text-muted-foreground mb-1 block">소속·직책</label>
        <input
          type="text"
          value={form.speakerCompany}
          onChange={(e) => setForm((f) => ({ ...f, speakerCompany: e.target.value }))}
          placeholder="예: 잡코리아 CEO"
          className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors"
        />
      </div>
      <div className="col-span-6 sm:col-span-2">
        <label className="text-xs text-muted-foreground mb-1 block">시작</label>
        <input
          type="time"
          value={form.startTime}
          onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
          className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors"
        />
      </div>
      <div className="col-span-6 sm:col-span-2">
        <label className="text-xs text-muted-foreground mb-1 block">종료</label>
        <input
          type="time"
          value={form.endTime}
          onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
          className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors"
        />
      </div>
      <div className="col-span-12">
        <label className="text-xs text-muted-foreground mb-1 block">세션 내용</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="세션 주제에 대한 상세 설명 (선택) — 랜딩 상세 팝업에 표시돼요"
          rows={2}
          className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors resize-y"
        />
      </div>
      <div className="col-span-12">
        <label className="text-xs text-muted-foreground mb-1 block">연사 약력·경력</label>
        <textarea
          value={form.speakerBio}
          onChange={(e) => setForm((f) => ({ ...f, speakerBio: e.target.value }))}
          placeholder={"예:\n전) 우아한청년들 CEO\n전) 우아한형제들 공동창업자 겸 CTO, COO"}
          rows={3}
          className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors resize-y"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">랜딩 상세 팝업의 &lsquo;약력&rsquo; 영역에 표시돼요. 줄바꿈이 그대로 유지됩니다.</p>
      </div>
      <div className="col-span-12">
        <label className="text-xs text-muted-foreground mb-1.5 block">연사 사진 (선택)</label>
        <div className="flex items-center gap-1 mb-2" role="group" aria-label="연사 사진 입력 방식">
          <button type="button" onClick={() => setPhotoSource("upload")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${photoSource === "upload" ? "bg-violet-500 text-white" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
            <ImagePlus className="w-3.5 h-3.5" />파일 업로드
          </button>
          <button type="button" onClick={() => setPhotoSource("url")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${photoSource === "url" ? "bg-violet-500 text-white" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
            <Link2 className="w-3.5 h-3.5" />URL 입력
          </button>
        </div>
        {photoSource === "upload" ? (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-secondary/20 px-3 py-2.5">
            {form.speakerPhotoUrl && (
              // 외부 URL도 지원하므로 Next Image 최적화 도메인 제한을 적용하지 않는다.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.speakerPhotoUrl} alt="선택한 연사 사진 미리보기" className="w-9 h-9 rounded-full object-cover border border-border" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium">JPG, PNG, WebP, GIF · 최대 5MB</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">올린 사진은 라이브 아젠다의 연사 프로필로 표시돼요.</p>
            </div>
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-secondary disabled:opacity-50">
              {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
              {isUploading ? "업로드 중" : form.speakerPhotoUrl ? "사진 변경" : "사진 선택"}
            </button>
            <input ref={fileInputRef} type="file" accept={SPEAKER_PHOTO_ACCEPT} className="sr-only" onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) void uploadPhoto(file);
            }} />
          </div>
        ) : (
          <input type="url" value={form.speakerPhotoUrl}
            onChange={(e) => setForm((f) => ({ ...f, speakerPhotoUrl: e.target.value }))}
            placeholder="https://... (라이브 페이지 아젠다에 원형 사진으로 표시돼요)"
            className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors" />
        )}
      </div>
    </div>
  );
}

export default function SessionsTab({
  webinarId,
  sessions,
  onUpdate,
}: {
  webinarId: string;
  sessions: WebinarSession[];
  onUpdate: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<SessionForm>({
    ...emptyForm,
    number: String((sessions.at(-1)?.number ?? 0) + 1),
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<SessionForm>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  // 삭제는 낙관적 제거 + 실행취소 토스트 — 즉시 사라지고 5초 안에 되돌릴 수 있다(그 뒤 실제 삭제)
  const { remove: undoableRemove } = useUndoableDelete();
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(() => new Set());

  const sortedSessions = [...sessions]
    .filter((s) => !pendingDeleteIds.has(s.id))
    .sort((a, b) => a.number - b.number);

  const resetCreate = () => {
    setCreateForm({ ...emptyForm, number: String((sortedSessions.at(-1)?.number ?? 0) + 1) });
    setShowCreate(false);
  };

  const buildPayload = (form: SessionForm) => ({
    number: Number(form.number),
    type: form.type,
    title: form.title.trim(),
    speaker: form.speaker.trim() || null,
    speakerCompany: form.speakerCompany.trim() || null,
    speakerPhotoUrl: form.speakerPhotoUrl.trim() || null,
    description: form.description.trim() || null,
    speakerBio: form.speakerBio.trim() || null,
    startTime: form.startTime,
    endTime: form.endTime,
  });

  const validate = (form: SessionForm) => {
    if (!Number.isInteger(Number(form.number)) || Number(form.number) < 1) return "세션 번호를 확인해주세요";
    if (!form.title.trim()) return "세션 제목을 입력해주세요";
    if (!form.startTime || !form.endTime) return "세션 시간을 입력해주세요";
    return null;
  };

  const handleCreate = async () => {
    const error = validate(createForm);
    if (error) { toast.error(error); return; }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/webinars/${webinarId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(createForm)),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "세션 추가 실패");
        return;
      }
      toast.success("세션이 추가됐어요");
      resetCreate();
      onUpdate();
    } finally {
      setIsSaving(false);
    }
  };

  const startEdit = (session: WebinarSession) => {
    setEditingId(session.id);
    setEditForm(toForm(session));
    setShowCreate(false);
  };

  const handleUpdate = async (sessionId: string) => {
    const error = validate(editForm);
    if (error) { toast.error(error); return; }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/webinars/${webinarId}/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(editForm)),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "세션 저장 실패");
        return;
      }
      toast.success("세션이 저장됐어요");
      setEditingId(null);
      onUpdate();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (session: WebinarSession) => {
    if (editingId === session.id) setEditingId(null);
    undoableRemove({
      key: session.id,
      message: `세션 ${session.number}을(를) 삭제했어요`,
      onOptimistic: () => setPendingDeleteIds((prev) => new Set(prev).add(session.id)),
      onUndo: () => setPendingDeleteIds((prev) => { const n = new Set(prev); n.delete(session.id); return n; }),
      commit: async () => {
        const res = await fetch(`/api/webinars/${webinarId}/sessions/${session.id}`, { method: "DELETE" });
        setPendingDeleteIds((prev) => { const n = new Set(prev); n.delete(session.id); return n; });
        if (!res.ok) { toast.error("세션 삭제 실패 — 목록을 새로고침합니다"); }
        onUpdate(); // 성공: 서버에서 사라짐 / 실패: 원상 복구 반영
      },
    });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          라이브 페이지와 임베드 코드에 표시될 세션 아젠다를 관리해요
        </p>
        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.96 }}
          transition={spring}
          onClick={() => {
            setEditingId(null);
            setCreateForm({ ...emptyForm, number: String((sortedSessions.at(-1)?.number ?? 0) + 1) });
            setShowCreate(true);
          }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-500 text-white text-xs font-medium hover:bg-violet-600 transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />세션 추가
        </motion.button>
      </div>

      <AnimatePresence initial={false}>
      {showCreate && (
        <motion.div
          initial={{ opacity: 0, y: -4, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -4, height: 0 }}
          transition={spring}
          className="overflow-hidden"
        >
          <div className="p-4 rounded-2xl border border-violet-400/30 bg-violet-500/5 space-y-3">
            <SessionFormFields webinarId={webinarId} form={createForm} setForm={setCreateForm} />
            <div className="flex gap-2">
              <motion.button
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
                transition={spring}
                onClick={handleCreate}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors disabled:opacity-40"
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                추가
              </motion.button>
              <motion.button
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
                transition={spring}
                onClick={resetCreate}
                className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-secondary transition-colors"
              >
                취소
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      {sortedSessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Clock className="w-10 h-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">아직 세션이 없어요</p>
          <p className="text-xs text-muted-foreground mt-1">세션을 추가하면 라이브 페이지 아젠다에 바로 표시됩니다.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
          {sortedSessions.map((session) => (
            <motion.div
              key={session.id}
              layout
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -8 }}
              whileHover={editingId === session.id ? undefined : { borderColor: "rgba(139, 92, 246, 0.18)" }}
              transition={spring}
              className="p-4 rounded-2xl border border-border bg-background"
            >
              {editingId === session.id ? (
                <div className="space-y-3">
                  <SessionFormFields webinarId={webinarId} form={editForm} setForm={setEditForm} />
                  <div className="flex gap-2">
                    <motion.button
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.96 }}
                      transition={spring}
                      onClick={() => handleUpdate(session.id)}
                      disabled={isSaving}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors disabled:opacity-40"
                    >
                      {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      저장
                    </motion.button>
                    <motion.button
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.96 }}
                      transition={spring}
                      onClick={() => setEditingId(null)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-sm hover:bg-secondary transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />취소
                    </motion.button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-4">
                  <div className="w-9 h-9 rounded-xl bg-violet-500/10 text-violet-500 flex items-center justify-center text-sm font-semibold shrink-0">
                    {session.number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {session.type && session.type !== "session" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-500 font-semibold">
                          {TYPE_LABEL[session.type] ?? session.type}
                        </span>
                      )}
                      <h4 className="text-sm font-medium">{session.title}</h4>
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
                        {session.startTime} - {session.endTime}
                      </span>
                    </div>
                    {session.speaker && <p className="text-xs text-muted-foreground mt-1">{session.speaker}</p>}
                    {session.description && <p className="text-xs text-muted-foreground mt-1.5">{session.description}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <motion.button
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.92 }}
                      transition={spring}
                      onClick={() => startEdit(session)}
                      className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      title="수정"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </motion.button>
                    <motion.button
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.92 }}
                      transition={spring}
                      onClick={() => handleDelete(session)}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 hover:text-red-500 text-muted-foreground transition-colors"
                      title="삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </motion.button>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
