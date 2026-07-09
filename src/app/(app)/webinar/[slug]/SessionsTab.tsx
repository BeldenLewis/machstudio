"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Clock, Edit3, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

// 세션 유형 — 라이브 Q&A 칩은 "세션"만, 아젠다엔 전부(유형 표시)
const SESSION_TYPES = [
  { value: "session", label: "세션" },
  { value: "qa", label: "Q&A" },
  { value: "break", label: "브레이크" },
] as const;
const TYPE_LABEL: Record<string, string> = { session: "세션", qa: "Q&A", break: "브레이크" };

interface WebinarSession {
  id: string;
  number: number;
  type: string;
  title: string;
  speaker: string | null;
  speakerPhotoUrl: string | null;
  description: string | null;
  startTime: string;
  endTime: string;
}

interface SessionForm {
  number: string;
  type: string;
  title: string;
  speaker: string;
  speakerPhotoUrl: string;
  description: string;
  startTime: string;
  endTime: string;
}

const emptyForm: SessionForm = {
  number: "",
  type: "session",
  title: "",
  speaker: "",
  speakerPhotoUrl: "",
  description: "",
  startTime: "",
  endTime: "",
};

function toForm(session: WebinarSession): SessionForm {
  return {
    number: String(session.number),
    type: session.type || "session",
    title: session.title,
    speaker: session.speaker ?? "",
    speakerPhotoUrl: session.speakerPhotoUrl ?? "",
    description: session.description ?? "",
    startTime: session.startTime,
    endTime: session.endTime,
  };
}

function SessionFormFields({
  form,
  setForm,
}: {
  form: SessionForm;
  setForm: Dispatch<SetStateAction<SessionForm>>;
}) {
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
        <label className="text-xs text-muted-foreground mb-1 block">연사</label>
        <input
          type="text"
          value={form.speaker}
          onChange={(e) => setForm((f) => ({ ...f, speaker: e.target.value }))}
          placeholder="홍길동 | 회사명"
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
      <div className="col-span-12 sm:col-span-4">
        <label className="text-xs text-muted-foreground mb-1 block">설명</label>
        <input
          type="text"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="선택 입력"
          className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors"
        />
      </div>
      <div className="col-span-12">
        <label className="text-xs text-muted-foreground mb-1 block">연사 사진 URL (선택)</label>
        <input
          type="url"
          value={form.speakerPhotoUrl}
          onChange={(e) => setForm((f) => ({ ...f, speakerPhotoUrl: e.target.value }))}
          placeholder="https://... (라이브 페이지 아젠다에 원형 사진으로 표시돼요)"
          className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors"
        />
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
  // 삭제는 2단계 인라인 확인 — 실수 삭제 방지(네이티브 confirm 대신 조용한 확인 버튼)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const sortedSessions = [...sessions].sort((a, b) => a.number - b.number);

  const resetCreate = () => {
    setCreateForm({ ...emptyForm, number: String((sortedSessions.at(-1)?.number ?? 0) + 1) });
    setShowCreate(false);
  };

  const buildPayload = (form: SessionForm) => ({
    number: Number(form.number),
    type: form.type,
    title: form.title.trim(),
    speaker: form.speaker.trim() || null,
    speakerPhotoUrl: form.speakerPhotoUrl.trim() || null,
    description: form.description.trim() || null,
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

  const handleDelete = async (sessionId: string) => {
    setConfirmDeleteId(null);
    const res = await fetch(`/api/webinars/${webinarId}/sessions/${sessionId}`, { method: "DELETE" });
    if (!res.ok) { toast.error("세션 삭제 실패"); return; }
    toast.success("세션이 삭제됐어요");
    if (editingId === sessionId) setEditingId(null);
    onUpdate();
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
            <SessionFormFields form={createForm} setForm={setCreateForm} />
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
                  <SessionFormFields form={editForm} setForm={setEditForm} />
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
                    {confirmDeleteId === session.id ? (
                      <>
                        <motion.button
                          whileHover={{ y: -1 }}
                          whileTap={{ scale: 0.92 }}
                          transition={spring}
                          onClick={() => handleDelete(session.id)}
                          className="px-2 py-1 rounded-lg bg-red-500 text-white text-xs font-medium"
                          title="삭제 확인"
                        >
                          삭제
                        </motion.button>
                        <motion.button
                          whileHover={{ y: -1 }}
                          whileTap={{ scale: 0.92 }}
                          transition={spring}
                          onClick={() => setConfirmDeleteId(null)}
                          className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
                          title="취소"
                        >
                          <X className="w-3.5 h-3.5" />
                        </motion.button>
                      </>
                    ) : (
                      <motion.button
                        whileHover={{ y: -1 }}
                        whileTap={{ scale: 0.92 }}
                        transition={spring}
                        onClick={() => setConfirmDeleteId(session.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 hover:text-red-500 text-muted-foreground transition-colors"
                        title="삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </motion.button>
                    )}
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
