"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { kstDateTimeLocalInput, kstDateTimeLocalToIso } from "@/lib/datetime";
import WebinarSchedulePicker from "@/components/webinar/WebinarSchedulePicker";
import { useAutosave, useExternalSync } from "@/components/ui/use-autosave";
import { useReportAutosave } from "@/components/ui/autosave-scope";
import { btnCls, FIELD_CLS, FIELD_CLS_DANGER, R } from "@/components/ui/primitives";

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
export default function BasicInfoTab({ webinar, onSilentUpdate, embedded }: {
  webinar: Webinar;
  onSilentUpdate: () => void;
  /**
   * 다른 화면 안에 얹힐 때 true — 자기 좌우 패딩을 빼고(부모가 소유) 위험 구역도 그리지 않는다.
   * 위험 구역이 여기 남으면 원본 정보 화면에서 '웨비나 삭제' 가 화면 **중간**(진행 순서 바로 위)에
   * 놓인다. AGENTS: 위험한 저빈도 액션은 멀리·작게·확인 뒤에 — 그래서 부모가 맨 끝에 놓는다.
   */
  embedded?: boolean;
}) {
  const toLocal = (iso: string) => kstDateTimeLocalInput(iso);
  const components = (webinar.components ?? {}) as Record<string, unknown>;

  const [form, setForm] = useState({
    name: webinar.name,
    description: webinar.description ?? "",
    liveStartAt: toLocal(webinar.liveStartAt),
    liveEndAt: toLocal(webinar.liveEndAt),
  });

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
          // 마감·라이브 중 접수는 등록 폼 탭이 소유한다 — 여기서 보내면 서로 덮어쓴다.
        }),
      });
      if (!res.ok) { toast.error("자동 저장 실패 — 잠시 후 다시 시도돼요", { id: "autosave-error" }); return false; }
      onSilentUpdate();
      return true;
    } catch { return false; }
  };
  const { state: saveState, dirty, retry } = useAutosave(form, save);
  // 표시는 껍데기 한 곳에서 그린다(만들기 화면당 1개) — 저장 경로는 그대로 각자.
  useReportAutosave(saveState, retry);

  // 다른 창·다른 기기에서 이름·일정이 바뀌면 이 폼도 따라간다(편집 중이면 대기).
  // 예전엔 초기값 1회라, 열어둔 창의 다음 자동저장이 낡은 값으로 상대의 수정을 되돌렸다.
  const incoming = useMemo(
    () => ({
      name: webinar.name,
      description: webinar.description ?? "",
      liveStartAt: toLocal(webinar.liveStartAt),
      liveEndAt: toLocal(webinar.liveEndAt),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [webinar.name, webinar.description, webinar.liveStartAt, webinar.liveEndAt],
  );
  useExternalSync(incoming, setForm, dirty);


  return (
    <div className={`max-w-2xl space-y-8 ${embedded ? "" : "p-4 sm:p-6 lg:p-8"}`}>
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
              className={FIELD_CLS}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">설명</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className={`${FIELD_CLS} resize-none leading-relaxed`}
            />
          </div>
        </div>
      </section>

      {/* 일정 */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold">일정</h3>
        {/* 마감·라이브 중 접수는 '등록 폼 › 접수 창' 으로 옮겼다(IA 3단계) — 둘 다 접수 정책인데
            여기와 저기로 쪼개져 있어서 모순 조합("마감=시작" + "계속 받기")을 경고할 자리가 없었다.
            signupDeadline 은 이 탭이 더 이상 보내지 않는다(서버가 필드별로 병합하므로 안전). */}
        <WebinarSchedulePicker
          showDeadline={false}
          // 마감은 이 탭의 state 가 아니다 — props 값을 그대로 넘겨 픽커의 값 형태만 맞춘다.
          // state 로 들고 있으면 등록 폼에서 마감이 바뀔 때 useExternalSync 가 이 폼을 흔들어
          // 마감과 무관한 PATCH 가 한 번 더 나간다.
          value={{ liveStartAt: form.liveStartAt, liveEndAt: form.liveEndAt, signupDeadline: toLocal(webinar.signupDeadline) }}
          onChange={(v) => setForm((f) => ({ ...f, liveStartAt: v.liveStartAt, liveEndAt: v.liveEndAt }))}
        />
      </section>

      <div className="flex items-center gap-3">
        {!form.name.trim() && <span className="text-[11px] text-destructive">이름을 입력해야 저장돼요</span>}
      </div>

    </div>
  );
}

/**
 * 웨비나 삭제 — 파괴적이고 저빈도라 **화면 맨 끝**에만 놓는다.
 * 예전엔 BasicInfoTab 안에 있었는데, 그 컴포넌트가 원본 정보의 첫 블록으로 얹히면서
 * 삭제 버튼이 '진행 순서' 구분선 바로 위, 즉 세션을 편집하러 스크롤하는 경로에 끼어 있었다.
 */
export function WebinarDangerZone({ webinar }: { webinar: { id: string; name: string } }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");

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
    <div className="max-w-2xl">
      {/* 제목·구분선은 부모(SourceInfoTab 의 AreaDivider)가 그린다 — 예전엔 여기서도
          border-t + h3 "위험 구역" 을 그려서 같은 제목과 같은 수평선이 두 번 나왔다.
          BrandSection 에서 잡은 것과 같은 종류의 중복이다. */}
      <section className="space-y-3">
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
            className={btnCls("dangerQuiet", "px-4")}
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
            /* 빨강 경계는 장식이 아니라 신호라서 유지하되, 마감 규칙대로 헤어라인을 그림자
               안에 넣는다. 색은 red-500 → --destructive 로 — 토큰은 다크에서 한 단 밝아지고
               (0.577 → 0.704) red-500 은 고정이라, 다크에서 경고가 배경에 묻혔다. */
            className={`p-4 ${R.panel} bg-destructive/5 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--destructive)_30%,transparent)] space-y-3`}
          >
            <p className="text-sm text-destructive">모든 등록자, Q&A, 공지 데이터가 삭제돼요. 되돌릴 수 없어요.</p>
            <p className="text-xs text-muted-foreground">확인을 위해 웨비나 이름 <strong>{webinar.name}</strong>을 입력하세요</p>
            <input
              type="text"
              placeholder={webinar.name}
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              className={FIELD_CLS_DANGER}
            />
            <div className="flex gap-2">
              <motion.button
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
                transition={spring}
                onClick={handleDelete}
                disabled={deleteInput !== webinar.name || isDeleting}
                className={btnCls("danger", "px-4 disabled:opacity-40")}
              >
                {isDeleting ? "삭제 중..." : "삭제"}
              </motion.button>
              <motion.button
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
                transition={spring}
                onClick={() => { setShowDeleteConfirm(false); setDeleteInput(""); }}
                className={btnCls("quiet", "px-4")}
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
