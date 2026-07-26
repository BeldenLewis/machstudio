"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { kstDateTimeLocalInput, kstDateTimeLocalToIso } from "@/lib/datetime";
import WebinarSchedulePicker from "@/components/webinar/WebinarSchedulePicker";
import { useAutosave, useExternalSync } from "@/components/ui/use-autosave";
import { AutosaveIndicator } from "@/components/ui/autosave-indicator";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

interface Webinar {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  liveStartAt: string;
  liveEndAt: string;
  signupDeadline: string;
  components?: Record<string, unknown> | null;
}

// 만들기 › 기본 정보 — 정체성(이름·설명) + 일정 + 위험 구역만.
// 라이브 페이지 콘텐츠·디자인·참여 설정은 '라이브 페이지' 섹션(LivePageTab)으로 분리됨.
export default function BasicInfoTab({ webinar, onSilentUpdate }: { webinar: Webinar; onSilentUpdate: () => void }) {
  const router = useRouter();
  const toLocal = (iso: string) => kstDateTimeLocalInput(iso);
  const components = (webinar.components ?? {}) as Record<string, unknown>;

  const [form, setForm] = useState({
    name: webinar.name,
    description: webinar.description ?? "",
    liveStartAt: toLocal(webinar.liveStartAt),
    liveEndAt: toLocal(webinar.liveEndAt),
    signupDeadline: toLocal(webinar.signupDeadline),
    // 라이브 중 사전등록 정책 — 3상태.
    // "auto"(값 없음)는 마감일까지만 받는 기존 동작이라, 마감일이 지난 뒤 들어온
    // 미등록 시청자는 등록할 방법이 없었다. "open"으로 그 경우를 열 수 있게 한다.
    liveReg: components.allowLiveRegistration === false ? "closed"
      : components.allowLiveRegistration === true ? "open"
      : "auto" as "auto" | "open" | "closed",
  });
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");

  // 자동저장 — 이름·설명·일정·마감옵션 변경 시 디바운스 후 PATCH. 이름이 비면 저장하지 않는다(필수).
  const save = async () => {
    if (!form.name.trim()) return false; // 이름 필수 — 빈 값으로 덮어쓰지 않음
    try {
      const res = await fetch(`/api/webinars/${webinar.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        keepalive: true, // 페이지 이탈 중 flush 도 서버에 도달하도록
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
          liveStartAt: kstDateTimeLocalToIso(form.liveStartAt),
          liveEndAt: kstDateTimeLocalToIso(form.liveEndAt),
          signupDeadline: kstDateTimeLocalToIso(form.signupDeadline),
          // 이 탭이 소유한 키만 보낸다 — 다른 키(chatEnabled 등)는 서버가 병합으로 보존한다.
          // auto 는 null 로 저장해 "마감일까지" 기존 동작을 유지한다.
          components: { allowLiveRegistration: form.liveReg === "closed" ? false : form.liveReg === "open" ? true : null },
        }),
      });
      if (!res.ok) { toast.error("자동 저장 실패 — 잠시 후 다시 시도돼요", { id: "autosave-error" }); return false; }
      onSilentUpdate();
      return true;
    } catch { return false; }
  };
  const { state: saveState, dirty, retry } = useAutosave(form, save);

  // 다른 창·다른 기기에서 이름·일정이 바뀌면 이 폼도 따라간다(편집 중이면 대기).
  // 예전엔 초기값 1회라, 열어둔 창의 다음 자동저장이 낡은 값으로 상대의 수정을 되돌렸다.
  const incoming = useMemo(
    () => ({
      name: webinar.name,
      description: webinar.description ?? "",
      liveStartAt: toLocal(webinar.liveStartAt),
      liveEndAt: toLocal(webinar.liveEndAt),
      signupDeadline: toLocal(webinar.signupDeadline),
      liveReg: (components.allowLiveRegistration === false ? "closed"
        : components.allowLiveRegistration === true ? "open"
        : "auto") as "auto" | "open" | "closed",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [webinar.name, webinar.description, webinar.liveStartAt, webinar.liveEndAt, webinar.signupDeadline, webinar.components],
  );
  useExternalSync(incoming, setForm, dirty);

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
        <div className="pt-1 space-y-1.5">
          <span className="text-xs font-medium">라이브 중 사전등록</span>
          <div className="flex flex-wrap gap-1.5">
            {([
              { v: "auto", label: "마감일까지", hint: "설정한 등록 마감 시각이 지나면 접수를 닫아요." },
              { v: "open", label: "계속 받기", hint: "마감일이 지나도 라이브 중 들어온 사람이 등록할 수 있어요." },
              { v: "closed", label: "시작 시 마감", hint: "라이브가 시작되면 바로 접수를 닫아요." },
            ] as const).map((opt) => (
              <button
                key={opt.v}
                type="button"
                aria-pressed={form.liveReg === opt.v}
                onClick={() => setForm((f) => ({ ...f, liveReg: opt.v }))}
                className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  form.liveReg === opt.v ? "bg-violet-500 text-white" : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <span className="block text-[11px] text-muted-foreground/70 leading-relaxed">
            {form.liveReg === "auto" ? "설정한 등록 마감 시각이 지나면 접수를 닫아요."
              : form.liveReg === "open" ? "마감일이 지나도 라이브 중 들어온 사람이 등록할 수 있어요 — 입장 확인 화면에 사전등록 버튼이 보여요."
              : "라이브가 시작되면 바로 접수를 닫아요. 입장 확인 화면에 사전등록 버튼이 보이지 않아요."}
          </span>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <AutosaveIndicator state={saveState} onRetry={retry} />
        {!form.name.trim() && <span className="text-[11px] text-red-500">이름을 입력해야 저장돼요</span>}
      </div>

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
