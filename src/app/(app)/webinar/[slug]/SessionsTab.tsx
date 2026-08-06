"use client";

import { useEffect, useId, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Clock, Edit3, GripVertical, ImagePlus, Link2, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useUndoableDelete } from "@/components/ui/use-undoable-delete";
import {
  SESSION_LOGO_ACCEPT,
  SESSION_LOGO_MAX_LABEL,
  SPEAKER_PHOTO_ACCEPT,
  SPEAKER_PHOTO_MAX_LABEL,
  validateSessionLogo,
  validateSpeakerPhoto,
} from "@/lib/webinar-speaker-photo";
import {
  DEFAULT_SESSION_TYPE,
  SESSION_TYPES,
  cleanSessionText,
  isRealSession,
  sessionHasSpeaker,
  sessionTypeLabel,
} from "@/lib/webinar-sessions";
import { btnCls, FIELD_CLS, FINISH, R, Segmented, UrlField } from "@/components/ui/primitives";
import { normalizeSpeakerLinks, parseSpeakerLink, SPEAKER_LINKS_MAX } from "@/lib/webinar-speaker-links";
import { isHttpUrl } from "@/lib/webinar-config";
import { IMAGE_PRESETS, transformedImageUrl } from "@/lib/webinar-image";

/**
 * 이 목록을 EditableList(골격)로 이관하지 않는다 — 판정 근거를 남긴다.
 *
 * 만들기의 나머지 반복 목록 5개(선택지 2, 등록 필드, 설문 문항, CTA 카드, 자료·다음웨비나)는
 * 전부 골격으로 모았다. 여기만 남기는 이유는 "아직 안 했다" 가 아니라 **얻을 것이 없다** 다:
 *
 *   골격이 주는 것            세션 탭의 현재 상태
 *   ────────────────────────  ─────────────────────────────────────────────
 *   dnd-kit 드래그            이미 있음 (아래 SessionRow)
 *   방향키 재정렬             이미 있음 (KeyboardSensor + sortableKeyboardCoordinates)
 *   삭제 되돌리기             이미 있음 (useUndoableDelete)
 *   transform 저자권 수정     이미 있음 — 실측 근거까지 아래 주석에 있다
 *   핸들·삭제 아이콘 통일     이것만 남는다
 *
 * 반대로 치러야 할 값이 있다. 골격의 `reorderable` 은 **목록 단위 boolean** 인데 이 목록은
 * **행 단위** 조건이 필요하다 — `editingId !== session.id`(편집 중인 행이 끌려가면 입력이
 * 날아간다). `removable` 은 이미 (item) => boolean 인데 `reorderable` 만 boolean 인 비대칭을
 * 고쳐야 하고, 소비자가 하나뿐인 API 를 위해 골격을 넓히는 건 이미 한 번 실수했다
 * (onPendingRemoveChange — 만들어 놓고 소비자가 0곳이다).
 *
 * 게다가 이 목록만 저장 모델이 다르다: 배열 in/out 이 아니라 **행마다 서버 엔드포인트**이고
 * 재정렬은 낙관적 갱신 + 실패 롤백이며, 행 안에 편집/보기 모드 전환이 있다. 만들기에서
 * 가장 상태가 많은 목록을 이득 하나(아이콘 통일) 때문에 건드릴 이유가 없다.
 *
 * 다시 볼 조건: 행 단위 reorderable 이 **다른 목록에서도** 필요해지면, 그때 골격을 넓히고
 * 여기까지 함께 옮긴다.
 */

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

// 유형 목록·라벨·연사 유무는 src/lib/webinar-sessions.ts 가 소유한다. 예전엔 이 파일에만
// 3종 목록과 라벨맵이 있어서, 뷰어·랜딩·운영 콘솔이 각자 자기 사본을 들고 갈라졌다.

interface WebinarSession {
  id: string;
  number: number;
  type: string;
  title: string;
  speaker: string | null;
  speakerCompany: string | null;
  speakerPhotoUrl: string | null;
  logoUrl: string | null;
  description: string | null;
  speakerBio: string | null;
  speakerHomepage: string | null;
  speakerLinks: unknown;
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
  logoUrl: string;
  description: string;
  speakerBio: string;
  speakerHomepage: string;
  /** 편집 중에는 문자열 배열로 다룬다 — 저장 시 라우트가 스킴을 검증하고 정규화한다. */
  speakerLinks: string[];
  startTime: string;
  endTime: string;
}

const emptyForm: SessionForm = {
  number: "",
  type: DEFAULT_SESSION_TYPE,
  title: "",
  speaker: "",
  speakerCompany: "",
  speakerPhotoUrl: "",
  logoUrl: "",
  description: "",
  speakerBio: "",
  speakerHomepage: "",
  speakerLinks: [],
  startTime: "",
  endTime: "",
};

function toForm(session: WebinarSession): SessionForm {
  return {
    number: String(session.number),
    type: session.type || DEFAULT_SESSION_TYPE,
    title: session.title,
    speaker: session.speaker ?? "",
    speakerCompany: session.speakerCompany ?? "",
    speakerPhotoUrl: session.speakerPhotoUrl ?? "",
    logoUrl: session.logoUrl ?? "",
    description: session.description ?? "",
    speakerBio: session.speakerBio ?? "",
    speakerHomepage: session.speakerHomepage ?? "",
    // 저장된 값(URL 배열)을 그대로 편집칸으로. 잘못된 값은 정규화가 이미 걸렀다.
    speakerLinks: normalizeSpeakerLinks(session.speakerLinks).map((l) => l.url),
    startTime: session.startTime,
    endTime: session.endTime,
  };
}

/**
 * 드래그 가능한 세션 행. 손잡이(GripVertical)에만 드래그를 걸어, 카드 아무 데나 잡아도
 * 끌리는 일이 없게 한다(카드 안에 입력·버튼이 있어 오작동이 잦다).
 * 편집 중이면 draggable=false — 입력하다 행이 끌려가면 입력이 날아간다.
 */
function SessionRow({
  id, draggable, highlight, children,
}: { id: string; draggable: boolean; highlight: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !draggable });
  return (
    /**
     * 요소가 두 겹인 이유: transform 을 framer-motion 과 dnd-kit 이 동시에 쓸 수 없다.
     *
     * 한 겹으로 두고 motion.div 에 style={{transform}} 을 넘기면 **framer 가 이긴다** —
     * y 를 애니메이션하거나 layout 을 켜는 순간 framer 가 transform 문자열을 직접 만들어 쓰고
     * 넘긴 값은 버려진다. 결과는 **끌어도 행이 따라 움직이지 않는 상태**였다(놓으면 순서는
     * 맞게 바뀌므로 눈에 잘 안 띈다). editable-list.tsx 에서 하니스로 실측해 확인한 조합과 같다.
     *
     * 그래서 바깥은 순수 div — dnd-kit 의 ref·transform·transition 전용,
     * 안쪽 motion.div 는 등장 페이드·hover 전용. layout 은 뺐다(framer 를 transform 저자로
     * 만든 원인이고, 순서 이동은 dnd-kit 의 transition 이 이미 처리한다).
     */
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.55 : undefined }}
      className={isDragging ? "relative z-10" : undefined}
    >
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      /* 끌고 있을 때만 마감이 세진다 — 헤어라인을 --ring 으로 올리고 그림자를 띄운다.
         hover 로 border 색을 애니메이션하던 코드를 지웠다: border 자체가 없어졌고,
         그 값 rgba(139,92,246) 은 violet 을 딥네이비로 재정의한 뒤로 팔레트에 없는 색이었다. */
      className={`relative ${R.panel} bg-card p-4 transition-shadow ${
        isDragging
          ? "shadow-[inset_0_0_0_1px_var(--ring),0_14px_32px_-12px_rgb(0_0_0/0.28)]"
          : `${FINISH.s1} ${highlight ? "hover:shadow-[inset_0_0_0_1px_var(--ring),var(--shadow-card)]" : ""}`
      }`}
    >
      {draggable && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="순서 변경 — 끌어서 옮기거나 포커스 후 방향키를 쓰세요"
          title="끌어서 순서 변경"
          className="absolute left-0 top-1/2 grid h-8 w-5 -translate-y-1/2 cursor-grab touch-none place-items-center rounded-lg text-muted-foreground/40 transition-colors hover:text-muted-foreground active:cursor-grabbing"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}
      {children}
    </motion.div>
    </div>
  );
}

/** 유형별 제목 예시 — 삼항 체인이던 것을 표로. 유형이 늘 때 체인을 늘리지 않게. */
const TITLE_PLACEHOLDER: Record<string, string> = {
  opening: "예: 개회사 · 환영 인사",
  session: "예: AI 기반 데이터 분석 플랫폼의 혁신",
  qa: "예: 라이브 Q&A",
  break: "예: 휴식",
  closing: "예: 마무리 인사 · 경품 추첨",
};

/**
 * 이미지 한 칸 — "파일 업로드 / URL 입력" 전환 + 미리보기.
 *
 * 연사 사진과 로고가 이 컴포넌트를 공유하되 **미리보기 모양만 다르다**:
 *  - circle  : 원형 크롭(object-cover). 사람 얼굴은 잘려도 되고, 오히려 정렬이 예뻐진다.
 *  - contain : 원본 비율 유지(object-contain). 로고를 원형으로 크롭하면 글자가 잘려 못 읽는다.
 * 이 구분이 로고를 연사 사진 필드에 얹지 않고 따로 둔 이유다.
 */
function ImagePicker({
  title, hint, shape, source, onSourceChange, value, onValueChange,
  accept, maxLabel, busy, inputRef, onPick, urlPlaceholder, noun,
}: {
  title: string;
  hint: string;
  shape: "circle" | "contain";
  source: "upload" | "url";
  onSourceChange: (next: "upload" | "url") => void;
  value: string;
  onValueChange: (next: string) => void;
  accept: string;
  maxLabel: string;
  busy: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPick: (file: File) => void;
  urlPlaceholder: string;
  noun: string;
}) {
  return (
    <>
      <label className="text-xs text-muted-foreground mb-1.5 block">{title}</label>
      <Segmented
        className="mb-2"
        label={`${title} 입력 방식`}
        value={source}
        onChange={onSourceChange}
        options={[
          { value: "upload", label: <><ImagePlus className="h-3.5 w-3.5" />파일 업로드</> },
          { value: "url", label: <><Link2 className="h-3.5 w-3.5" />URL 입력</> },
        ]}
      />
      {source === "upload" ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-secondary/20 px-3 py-2.5">
          {value && (
            // 외부 URL도 지원하므로 Next Image 최적화 도메인 제한을 적용하지 않는다.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt={`선택한 ${noun} 미리보기`}
              className={
                shape === "circle"
                  ? `h-9 w-9 shrink-0 rounded-full object-cover ${FINISH.hairlineOut}`
                  // 로고는 배경이 투명한 PNG 가 많아 흰 판을 깔아야 다크에서도 보인다.
                  : `h-9 w-16 shrink-0 rounded-md bg-white object-contain p-1 ${FINISH.hairlineOut}`
              }
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium">JPG, PNG, WebP, GIF · 최대 {maxLabel}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
          </div>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
            className={btnCls("quiet", "shrink-0 px-2.5 py-1.5 text-xs disabled:opacity-50")}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
            {busy ? "업로드 중" : value ? `${noun} 변경` : `${noun} 선택`}
          </button>
          <input ref={inputRef} type="file" accept={accept} className="sr-only" onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (file) onPick(file);
          }} />
        </div>
      ) : (
        /* 스킴 없이 붙여넣으면 공개 화면에서 이미지가 조용히 안 나온다(랜딩·대기·시청 전부
           safeHttpUrl 로 거른다) — UrlField 가 blur 에 https:// 를 붙이고 안 되면 알린다. */
        <UrlField label={`${noun} URL`} value={value} onChange={onValueChange}
          placeholder={urlPlaceholder} isValidHttpUrl={isHttpUrl} />
      )}
    </>
  );
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
  const [logoSource, setLogoSource] = useState<"upload" | "url">("upload");
  /** 업로드 중인 종류 — 두 업로드가 스피너를 공유하면 로고를 올릴 때 사진 버튼도 돈다. */
  const [uploading, setUploading] = useState<null | "photo" | "logo">(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  /**
   * 연사 입력을 보일지 — 유형 표(webinar-sessions.ts)가 정한다.
   * 예전엔 `form.type === "break"` 였고, 그 판정이 화면마다 극성까지 달랐다(시청 화면은
   * `!== "break"`, 랜딩은 `=== "session"`). 오프닝·클로징은 사람이 서는 순서라 연사를 받는다.
   */
  const hasSpeaker = sessionHasSpeaker(form.type);
  /* 라벨↔입력을 id 로 묶는다. useId 인 이유: 이 폼은 '추가'와 '수정'이 동시에 열릴 수 있어
     고정 id("ses-order")면 두 벌이 겹쳐 라벨이 엉뚱한 칸을 가리켰다. */
  const uid = useId();

  /**
   * 사진·로고 업로드 — 엔드포인트와 담을 필드만 다르고 나머지는 같아 하나로 묶었다.
   * catch 가 반드시 있어야 한다: 예전엔 try/finally 뿐이라 네트워크 실패가 unhandled rejection
   * 으로 사라지고 어드민은 "눌렀는데 아무 일도 없다" 만 봤다(랜딩 업로드 쪽 주석과 같은 이유).
   */
  const uploadImage = async (
    file: File,
    kind: "photo" | "logo",
  ) => {
    const spec = kind === "photo"
      ? { validate: validateSpeakerPhoto, endpoint: "speaker-photo", field: "speakerPhotoUrl", noun: "연사 사진", ref: fileInputRef }
      : { validate: validateSessionLogo, endpoint: "session-logo", field: "logoUrl", noun: "로고", ref: logoInputRef };

    const validationError = spec.validate(file);
    if (validationError) { toast.error(validationError); return; }

    setUploading(kind);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(`/api/webinars/${webinarId}/${spec.endpoint}`, { method: "POST", body });
      const data = await res.json().catch(() => null);
      if (!res.ok || typeof data?.url !== "string") {
        toast.error(data?.error ?? `${spec.noun} 업로드에 실패했어요.`);
        return;
      }
      setForm((f) => ({ ...f, [spec.field]: data.url }));
      toast.success(`${spec.noun}을 올렸어요`);
    } catch {
      toast.error("업로드 중 문제가 생겼어요. 연결을 확인하고 다시 시도해주세요.");
    } finally {
      setUploading(null);
      if (spec.ref.current) spec.ref.current.value = "";
    }
  };

  return (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-4 sm:col-span-2">
        {/* "번호"가 아니라 "순서" — 휴식·Q&A 도 이 번호를 차지한다(진행 순서라서).
            시청자에게 보이는 "세션 n"은 실제 세션만 다시 센 값이라 이 숫자와 다를 수 있다. */}
        <label htmlFor={`${uid}-order`} className="text-xs text-muted-foreground mb-1 block">순서</label>
        <input
          id={`${uid}-order`}
          type="number"
          min={1}
          value={form.number}
          onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
          className={FIELD_CLS}
        />
      </div>
      <div className="col-span-8 sm:col-span-3">
        <label htmlFor={`${uid}-type`} className="text-xs text-muted-foreground mb-1 block">유형</label>
        <select
          id={`${uid}-type`}
          value={form.type}
          onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
          className={FIELD_CLS}
        >
          {SESSION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <div className="col-span-12 sm:col-span-7">
        <label htmlFor={`${uid}-title`} className="text-xs text-muted-foreground mb-1 block">제목</label>
        <input
          id={`${uid}-title`}
          type="text"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder={TITLE_PLACEHOLDER[form.type] ?? TITLE_PLACEHOLDER.session}
          className={FIELD_CLS}
        />
      </div>
      {/* 연사가 없는 유형(휴식)은 연사 입력칸을 아예 감춘다. 비워 두라고 안내하는 대신 안 보이게
          하는 게 맞다(빈칸이 있으면 채우게 된다). Q&A 는 "전체 연사", 오프닝·클로징은 진행자를
          적을 수 있어 그대로 둔다 — 판정은 유형 표의 hasSpeaker 하나가 한다. */}
      {hasSpeaker && (
        <>
          <div className="col-span-12 sm:col-span-4">
            <label htmlFor={`${uid}-speaker`} className="text-xs text-muted-foreground mb-1 block">연사 이름</label>
            <input
              id={`${uid}-speaker`}
              type="text"
              value={form.speaker}
              onChange={(e) => setForm((f) => ({ ...f, speaker: e.target.value }))}
              placeholder="홍길동"
              className={FIELD_CLS}
            />
          </div>
          <div className="col-span-12 sm:col-span-4">
            <label htmlFor={`${uid}-company`} className="text-xs text-muted-foreground mb-1 block">소속·직책</label>
            <input
              id={`${uid}-company`}
              type="text"
              value={form.speakerCompany}
              onChange={(e) => setForm((f) => ({ ...f, speakerCompany: e.target.value }))}
              placeholder="예: 잡코리아 CEO"
              className={FIELD_CLS}
            />
          </div>
        </>
      )}
      <div className="col-span-6 sm:col-span-2">
        <label htmlFor={`${uid}-start`} className="text-xs text-muted-foreground mb-1 block">시작</label>
        <input
          id={`${uid}-start`}
          type="time"
          value={form.startTime}
          onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
          className={FIELD_CLS}
        />
      </div>
      <div className="col-span-6 sm:col-span-2">
        <label htmlFor={`${uid}-end`} className="text-xs text-muted-foreground mb-1 block">종료</label>
        <input
          id={`${uid}-end`}
          type="time"
          value={form.endTime}
          onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
          className={FIELD_CLS}
        />
      </div>
      <div className="col-span-12">
        <label htmlFor={`${uid}-desc`} className="text-xs text-muted-foreground mb-1 block">세션 내용</label>
        <textarea
          id={`${uid}-desc`}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="세션 주제에 대한 상세 설명 (선택) — 랜딩 상세 팝업에 표시돼요"
          rows={2}
          className={`${FIELD_CLS} resize-y leading-relaxed`}
        />
      </div>
      {hasSpeaker && (
      <div className="col-span-12">
        <label htmlFor={`${uid}-bio`} className="text-xs text-muted-foreground mb-1 block">연사 약력·경력</label>
        <textarea
          id={`${uid}-bio`}
          value={form.speakerBio}
          onChange={(e) => setForm((f) => ({ ...f, speakerBio: e.target.value }))}
          placeholder={"예:\n전) 우아한청년들 CEO\n전) 우아한형제들 공동창업자 겸 CTO, COO"}
          rows={3}
          className={`${FIELD_CLS} resize-y leading-relaxed`}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">랜딩 상세 팝업의 &lsquo;약력&rsquo; 영역에 표시돼요. 줄바꿈이 그대로 유지됩니다.</p>
      </div>
      )}
      {hasSpeaker && (
      <div className="col-span-12 sm:col-span-6">
        <label htmlFor={`${uid}-homepage`} className="text-xs text-muted-foreground mb-1 block">홈페이지 (선택)</label>
        {/* 검증은 제출 전에 그 자리에서 — 저장 후 조용히 비워지면 왜 사라졌는지 알 수 없다.
            판정은 parseSpeakerLink(호스트까지 본다)이 소유한다 — UrlField 의 기본 판정을 쓰면
            화면이 통과시킨 값이 저장 경로에서 버려질 수 있다. */}
        <UrlField
          id={`${uid}-homepage`}
          label="홈페이지"
          value={form.speakerHomepage}
          onChange={(speakerHomepage) => setForm((f) => ({ ...f, speakerHomepage }))}
          placeholder="https://example.com"
          isValidHttpUrl={(v) => !!parseSpeakerLink(v)}
        />
        {form.speakerHomepage.trim() && !parseSpeakerLink(form.speakerHomepage) ? null : (
          <p className="mt-1 text-[11px] text-muted-foreground">랜딩 상세 팝업의 &lsquo;홈페이지 바로가기&rsquo;로 표시돼요.</p>
        )}
      </div>
      )}
      {hasSpeaker && (
      <div className="col-span-12 sm:col-span-6">
        <span className="text-xs text-muted-foreground mb-1 block">SNS 링크 (선택 · 최대 {SPEAKER_LINKS_MAX}개)</span>
        <div className="space-y-1.5">
          {form.speakerLinks.map((url, i) => {
            const link = parseSpeakerLink(url);
            const invalid = url.trim() !== "" && !link;
            return (
              <div key={i}>
                <div className="flex items-center gap-1.5">
                  <input
                    type="url"
                    inputMode="url"
                    aria-label={`SNS 링크 ${i + 1}`}
                    value={url}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        speakerLinks: f.speakerLinks.map((v, j) => (j === i ? e.target.value : v)),
                      }))
                    }
                    placeholder="https://www.linkedin.com/in/..."
                    className={FIELD_CLS}
                  />
                  {/* 플랫폼은 주소에서 읽는다 — 고르게 하지 않는 이유는 webinar-speaker-links.ts 주석 참고. */}
                  {link && (
                    <span className="shrink-0 rounded-md bg-secondary px-1.5 py-1 text-[10px] text-muted-foreground">
                      {link.label}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, speakerLinks: f.speakerLinks.filter((_, j) => j !== i) }))}
                    aria-label={`SNS 링크 ${i + 1} 삭제`}
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {invalid && <p className="mt-1 text-[11px] text-red-500">https:// 로 시작하는 주소만 저장돼요.</p>}
              </div>
            );
          })}
        </div>
        {form.speakerLinks.length < SPEAKER_LINKS_MAX && (
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, speakerLinks: [...f.speakerLinks, ""] }))}
            className="mt-1.5 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Plus className="h-3 w-3" />링크 추가
          </button>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground">랜딩 상세 팝업 맨 아래에 아이콘으로 표시돼요.</p>
      </div>
      )}
      {hasSpeaker && (
        <div className="col-span-12">
          <ImagePicker
            title="연사 사진 (선택)"
            hint="랜딩 세션 카드·상세 팝업과 라이브 아젠다에 함께 쓰여요."
            shape="circle"
            source={photoSource}
            onSourceChange={setPhotoSource}
            value={form.speakerPhotoUrl}
            onValueChange={(v) => setForm((f) => ({ ...f, speakerPhotoUrl: v }))}
            accept={SPEAKER_PHOTO_ACCEPT}
            maxLabel={SPEAKER_PHOTO_MAX_LABEL}
            busy={uploading === "photo"}
            inputRef={fileInputRef}
            onPick={(file) => void uploadImage(file, "photo")}
            urlPlaceholder="https://... (라이브 페이지 아젠다에 원형 사진으로 표시돼요)"
            noun="사진"
          />
        </div>
      )}
      {/* 로고는 연사와 무관하다 — 휴식에도 협력사 마크를 붙일 수 있어 hasSpeaker 로 가리지 않는다. */}
      <div className="col-span-12">
        <ImagePicker
          title="로고 (선택)"
          hint="주최·협력사 마크예요. 잘리지 않게 원본 비율로 표시돼요(원형 크롭인 연사 사진과 다릅니다)."
          shape="contain"
          source={logoSource}
          onSourceChange={setLogoSource}
          value={form.logoUrl}
          onValueChange={(v) => setForm((f) => ({ ...f, logoUrl: v }))}
          accept={SESSION_LOGO_ACCEPT}
          maxLabel={SESSION_LOGO_MAX_LABEL}
          busy={uploading === "logo"}
          inputRef={logoInputRef}
          onPick={(file) => void uploadImage(file, "logo")}
          urlPlaceholder="https://... (랜딩 타임테이블·라이브 아젠다에 표시돼요)"
          noun="로고"
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
  // 삭제는 낙관적 제거 + 실행취소 토스트 — 즉시 사라지고 5초 안에 되돌릴 수 있다(그 뒤 실제 삭제)
  const { remove: undoableRemove } = useUndoableDelete();
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(() => new Set());

  // 드래그 중에는 서버 응답 전 순서를 먼저 보여준다(낙관적). 실패하면 null 로 되돌린다.
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const sensors = useSensors(
    // 5px 이상 움직여야 드래그로 본다 — 안 그러면 수정·삭제 버튼 클릭이 드래그로 먹힌다
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /**
   * 낙관적 순서 해제. 이게 없으면 dragOrder 가 영구히 남아서
   *  - 서버 반영 후에도 옛 배열을 계속 렌더하고
   *  - 이후 추가된 세션은 dragOrder 에 없으니 목록에서 아예 사라진다.
   * 서버 순서가 요청과 같아졌거나 목록 구성이 바뀌면 버린다.
   */
  useEffect(() => {
    if (!dragOrder) return;
    const byNumber = [...sessions].sort((a, b) => a.number - b.number).map((s) => s.id);
    const sameSet = byNumber.length === dragOrder.length && dragOrder.every((id) => byNumber.includes(id));
    if (!sameSet || byNumber.join() === dragOrder.join()) setDragOrder(null);
  }, [sessions, dragOrder]);

  const visibleSessions = [...sessions].filter((s) => !pendingDeleteIds.has(s.id));
  const sortedSessions = dragOrder
    ? (dragOrder.map((id) => visibleSessions.find((s) => s.id === id)).filter(Boolean) as WebinarSession[])
    : visibleSessions.sort((a, b) => a.number - b.number);
  const realSessionCount = sortedSessions.filter(isRealSession).length;

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = sortedSessions.map((s) => s.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(ids, from, to);
    setDragOrder(next);
    setIsReordering(true);
    try {
      const res = await fetch(`/api/webinars/${webinarId}/sessions/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "순서 변경에 실패했어요");
      }
      // 서버가 재번호한 결과를 다시 불러온다. dragOrder 는 그 결과가 들어오면 필요 없어지지만,
      // onUpdate 가 비동기 반영이라 먼저 null 로 돌리면 한 프레임 옛 순서가 보인다 → 순서 유지.
      onUpdate();
      toast.success("순서를 변경했어요");
    } catch (e) {
      setDragOrder(null); // 원래 number 순서로 복귀
      toast.error(e instanceof Error ? e.message : "순서 변경에 실패했어요");
    } finally {
      setIsReordering(false);
    }
  };

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
    logoUrl: form.logoUrl.trim() || null,
    description: form.description.trim() || null,
    speakerBio: form.speakerBio.trim() || null,
    speakerHomepage: form.speakerHomepage.trim() || null,
    /* 빈 칸(링크 추가만 누르고 안 채운 행)은 보내지 않는다 — 라우트가 어차피 떨어뜨리지만,
       여기서 걸러 두면 "저장했는데 빈 행이 남았다" 는 인상이 안 남는다. */
    speakerLinks: form.speakerLinks.map((u) => u.trim()).filter(Boolean),
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
      // 세션이 아닌 행을 "세션 3" 이라고 부르지 않는다 — 유형 이름으로 말한다
      message: isRealSession(session)
        ? `세션 ${session.number}을(를) 삭제했어요`
        : `${sessionTypeLabel(session.type) ?? "항목"}을(를) 삭제했어요`,
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
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            라이브 페이지와 임베드 코드에 표시될 세션 아젠다를 관리해요
          </p>
          {/* 연사 사진이 여기 한 곳에서만 관리되고 랜딩까지 같이 간다는 걸 알려준다.
              랜딩 설정에 따로 사진 항목이 있는 줄 알고 찾는 경우가 있었다. */}
          <p className="mt-1 text-xs text-muted-foreground/70">
            끌어서 순서를 바꿀 수 있어요. 연사 사진은 각 세션에서 올리면 랜딩 세션 카드·상세 팝업과 라이브 아젠다에 함께 쓰여요.
          </p>
          {/* 세션 수와 진행 순서 항목 수를 나눠 보여준다 — 오프닝·Q&A·휴식·클로징은 순서를
              차지하지만 세션이 아니다. 둘이 다를 때만 뒤 문구를 붙여 군더더기를 없앤다.
              유형 이름을 열거하지 않는다 — 열거하면 유형이 늘 때마다 이 문구를 고쳐야 한다. */}
          {sortedSessions.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground/70">
              세션 {realSessionCount}개
              {sortedSessions.length !== realSessionCount && (
                <> · 진행 순서 {sortedSessions.length}개 (세션 외 항목 포함)</>
              )}
            </p>
          )}
        </div>
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
          <div className={`p-4 ${R.panel} bg-violet-500/5 space-y-3 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--ring)_45%,transparent)]`}>
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
                className={btnCls("quiet", "px-4")}
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sortedSessions.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {/* AnimatePresence 를 쓰지 않는다 — 직접 자식이 커스텀 컴포넌트(SessionRow)면
              exit 완료 신호를 받지 못해 삭제된 행이 DOM 에 영구히 남는다.
              삭제는 즉시 사라지고, 되돌리기 토스트가 실수를 받쳐 준다. */}
          {sortedSessions.map((session) => (
            <SessionRow
              key={session.id}
              id={session.id}
              // 편집 중엔 드래그를 끈다(입력하다 행이 끌려가면 입력이 날아간다).
              // 저장 중에도 끈다 — 연속으로 끌면 두 번째 요청이 첫 번째 결과를 덮어써 순서가 뒤엉킨다.
              draggable={editingId !== session.id && !isReordering}
              highlight={editingId !== session.id}
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
                      className={btnCls("quiet", "px-4")}
                    >
                      <X className="w-3.5 h-3.5" />취소
                    </motion.button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 pl-4">
                  {/* 진행 순서 번호(1..N) — 휴식·Q&A 도 순서를 차지하므로 번호는 그대로 보여준다.
                      다만 강조색은 실제 세션만. 휴식·Q&A 까지 같은 보라 배지를 달면
                      "세션 번호"처럼 읽혀서 세션이 6개인 줄 알게 된다. */}
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-semibold shrink-0 ${
                      isRealSession(session)
                        ? "bg-violet-500/10 text-violet-500"
                        : "bg-secondary text-muted-foreground/70"
                    }`}
                    title={isRealSession(session) ? `진행 순서 ${session.number}` : `진행 순서 ${session.number} · 세션 아님`}
                  >
                    {session.number}
                  </div>
                  {/* 연사 사진 썸네일 — 목록에서 사진이 붙었는지 바로 보이게. 예전엔 편집을 열어야만
                      알 수 있어서 "사진 첨부 기능이 없다"고 읽혔다. 연사 없는 유형엔 안 그린다. */}
                  {sessionHasSpeaker(session.type) && session.speakerPhotoUrl && (
                    // 외부 URL 도 허용하므로 next/image 도메인 제한을 적용하지 않는다
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={transformedImageUrl(session.speakerPhotoUrl, IMAGE_PRESETS.adminThumb)}
                      alt={`${cleanSessionText(session.speaker) || "연사"} 사진`}
                      title="연사 사진 — 랜딩 세션 카드·상세 팝업과 라이브 아젠다에 표시돼요"
                      className={`h-9 w-9 shrink-0 rounded-full object-cover ${FINISH.hairlineOut}`}
                    />
                  )}
                  {/* 로고 썸네일 — 사진과 같은 이유로 목록에 노출한다. 유형과 무관(휴식에도 붙일 수 있다).
                      원형으로 자르지 않는다 — 로고는 잘리면 글자를 못 읽는다. */}
                  {session.logoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={transformedImageUrl(session.logoUrl, IMAGE_PRESETS.sessionLogo)}
                      alt={`${session.title || "세션"} 로고`}
                      title="로고 — 랜딩 타임테이블·라이브 아젠다에 표시돼요"
                      className={`h-9 w-14 shrink-0 rounded-md bg-white object-contain p-1 ${FINISH.hairlineOut}`}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* 세션이 아닌 행만 유형 배지를 단다(세션은 번호가 이미 유형을 말한다).
                          라벨을 모르는 값이면 배지를 안 그린다 — 예전엔 `?? session.type` 폴백이라
                          표에 없는 값이 영문 원문으로 찍혔다. */}
                      {!isRealSession(session) && sessionTypeLabel(session.type) && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-500 font-semibold">
                          {sessionTypeLabel(session.type)}
                        </span>
                      )}
                      <h4 className="text-sm font-medium">{session.title}</h4>
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
                        {session.startTime} - {session.endTime}
                      </span>
                    </div>
                    {/* cleanSessionText: 레거시 행에 문자열 "null" 이 남아 있어도 회색 "null" 이 안 찍히게 */}
                    {cleanSessionText(session.speaker) && (
                      <p className="text-xs text-muted-foreground mt-1">{cleanSessionText(session.speaker)}</p>
                    )}
                    {cleanSessionText(session.description) && (
                      <p className="text-xs text-muted-foreground mt-1.5">{cleanSessionText(session.description)}</p>
                    )}
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
                      className="p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors"
                      title="삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </motion.button>
                  </div>
                </div>
              )}
            </SessionRow>
          ))}
        </div>
        </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
