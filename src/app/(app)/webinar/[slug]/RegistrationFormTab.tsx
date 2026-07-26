"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type ElementType, type ReactNode, type SetStateAction } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, GripVertical, Smartphone, AlignLeft, Mail, Phone, ListChecks, SquareCheck, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useAutosave } from "@/components/ui/use-autosave";
import { useReportAutosave } from "@/components/ui/autosave-scope";
import { SignupDeadlineField } from "@/components/webinar/WebinarSchedulePicker";
import { kstDateTimeLocalInput, kstDateTimeLocalToIso } from "@/lib/datetime";
import { resolveConsentBody, consentSourceLabel } from "@/lib/consent-template";
import { Switch } from "@/components/ui/switch";
import { FIELD_CLS, FINISH, R } from "@/components/ui/primitives";
import { OptionRows } from "@/components/ui/option-rows";
import { EditableList } from "@/components/ui/editable-list";
import { normalizeRegistrationForm, type WebinarRegistrationField } from "@/lib/webinar-config";
import { buildStkCss } from "@/app/webinar/[slug]/LiveContentStk";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

type FieldType = WebinarRegistrationField["type"];
export type RegistrationField = WebinarRegistrationField;

interface Webinar {
  id: string;
  slug?: string;
  config: Record<string, unknown>;
  theme?: Record<string, string>;
  /** 접수 창 계산의 기준 — 마감 프리셋(시작 시점/하루 전)이 이 값에 상대적이다. */
  liveStartAt: string;
  signupDeadline: string;
  components?: Record<string, unknown> | null;
  /** 약관 전문 템플릿 — 이 웨비나가 비워 두면 상속한다(IA 8단계). */
  workspace?: { privacyBodyTemplate?: string | null; marketingBodyTemplate?: string | null } | null;
}

const inputCls = FIELD_CLS;
// 항목 형식 메타 — 설문 문항 타입 칩과 같은 결(아이콘+라벨)
const REG_TYPE_META: Record<FieldType, { label: string; desc: string; icon: ElementType }> = {
  text: { label: "텍스트", desc: "한 줄 입력", icon: AlignLeft },
  email: { label: "이메일", desc: "이메일 주소", icon: Mail },
  tel: { label: "전화번호", desc: "숫자만", icon: Phone },
  select: { label: "드롭다운", desc: "목록에서 선택", icon: ListChecks },
  checkbox: { label: "체크박스", desc: "동의·확인", icon: SquareCheck },
};
const REG_TYPE_ORDER: FieldType[] = ["text", "email", "tel", "select", "checkbox"];

function useRegPopover() {
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

function RegTypeMenu({ current, onPick }: { current: FieldType; onPick: (t: FieldType) => void }) {
  return (
    <div className={`absolute left-0 top-full z-30 mt-1.5 w-56 bg-popover p-1.5 ${R.surface} ${FINISH.overlay}`}>
      <p className="px-2 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">항목 형식</p>
      {REG_TYPE_ORDER.map((t) => {
        const meta = REG_TYPE_META[t];
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

// 필드 카드 — 설문 문항 카드(QuestionRow)와 동일한 결: 헤더에 타입 칩, 본문에 라벨·옵션.
function FieldCard({
  field,
  setFields,
  handle,
  removeButton,
}: {
  field: RegistrationField;
  setFields: Dispatch<SetStateAction<RegistrationField[]>>;
  /** 골격이 만든 드래그 핸들 — dnd-kit 배선(포인터+방향키)이 이미 붙어 있다. */
  handle: ReactNode | null;
  /** 골격이 만든 삭제 컨트롤. removable 이 false 면 null 을 준다(기본 필드). */
  removeButton: (opts?: { label?: string; onClick?: () => void }) => ReactNode | null;
}) {
  const typePop = useRegPopover();
  const patch = (next: Partial<RegistrationField>) =>
    setFields((fields) => fields.map((item) => (item.id === field.id ? { ...item, ...next } : item)));

  const isName = field.system && field.key === "name";
  const typeLocked = field.system && ["name", "phone", "email"].includes(field.key);
  const meta = REG_TYPE_META[field.type];
  const TypeIcon = meta.icon;

  const options = field.options ?? [];

  const changeType = (t: FieldType) => {
    typePop.setOpen(false);
    if (t === field.type) return;
    const next: Partial<RegistrationField> = { type: t };
    if (t === "select" && options.filter(Boolean).length === 0) next.options = ["", ""];
    patch(next);
  };

  return (
    /**
     * framer Reorder → 골격(EditableList/dnd-kit). layout 프롭이 없어진 게 핵심이다 —
     * framer 가 layout 이나 y 를 애니메이션하는 순간 transform 문자열의 저자가 되고,
     * dnd-kit 이 넘긴 transform 은 버려진다(SessionsTab 에서 실측한 그 조합). 끌어도
     * 행이 따라오지 않고 놓으면 순서만 바뀌어서 눈에 잘 띄지 않는 종류의 고장이다.
     *
     * 함께 얻는 것: 방향키 재정렬(원래 0곳), 삭제 되돌리기(원래 즉시 소실 — 옵션까지
     * 설정해 둔 필드가 한 번의 오클릭으로 사라졌다).
     */
    <div className={`${R.surface} bg-secondary ${FINISH.s2} transition-colors focus-within:bg-secondary/70 ${field.enabled ? "" : "opacity-60"}`}>
      <div>
        <div className="flex items-center gap-1 px-2 pt-2">
          {handle}

          <div className="relative" ref={typePop.ref}>
            <button
              type="button"
              onClick={() => !typeLocked && typePop.setOpen((v) => !v)}
              aria-haspopup={typeLocked ? undefined : "menu"}
              aria-expanded={typeLocked ? undefined : typePop.open}
              disabled={typeLocked}
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-background px-2 py-1.5 text-xs font-semibold shadow-sm transition-shadow hover:shadow disabled:cursor-default disabled:opacity-90"
            >
              <span className="grid h-5 w-5 place-items-center rounded-lg bg-violet-500/10 text-violet-500"><TypeIcon className="h-3 w-3" /></span>
              {meta.label}
              {!typeLocked && <ChevronDown className="h-3 w-3 text-muted-foreground/60" />}
            </button>
            {typePop.open && !typeLocked && <RegTypeMenu current={field.type} onPick={changeType} />}
          </div>

          {field.system && <span className="ml-1.5 shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">기본</span>}
          <span className="flex-1" />
          <label className={`flex shrink-0 select-none items-center gap-1 text-[11px] ${field.required ? "font-semibold text-amber-600" : "text-muted-foreground"}`}>
            필수<Switch checked={field.required} onChange={(v) => patch({ required: v })} disabled={isName} label={`${field.label} 필수`} />
          </label>
          <label className="flex shrink-0 select-none items-center gap-1 text-[11px] text-muted-foreground">
            표시<Switch checked={field.enabled} onChange={(v) => patch({ enabled: v })} disabled={isName} label={`${field.label} 표시`} />
          </label>
          {/* 기본 필드는 removable=false 라 골격이 null 을 준다 — 빈 자리는 우리가 그려
              헤더 정렬을 유지한다(bare 모드에서 레이아웃은 호출자 책임). */}
          {removeButton({ label: `${field.label || "필드"} 삭제` }) ?? <span className="w-8 shrink-0" />}
        </div>

        <div className="px-3 pb-3 pl-[42px] pt-1">
          <input
            value={field.label}
            onChange={(e) => patch({ label: e.target.value })}
            aria-label="항목 이름"
            placeholder="항목 이름을 입력하세요"
            className="w-full bg-transparent pb-2 text-[14px] font-semibold tracking-tight outline-none placeholder:font-normal placeholder:text-muted-foreground/50"
          />

          {(field.type === "text" || field.type === "email" || field.type === "tel") && (
            <div className="flex items-center gap-2 rounded-lg bg-background px-2.5 shadow-sm">
              <input
                value={field.placeholder ?? ""}
                onChange={(e) => patch({ placeholder: e.target.value })}
                placeholder={field.type === "tel" ? "입력 예시 (예: 01012345678)" : "입력 예시 — 응답 칸에 회색으로 (선택)"}
                aria-label="입력 예시"
                className="min-w-0 flex-1 bg-transparent py-2 text-[13px] outline-none placeholder:text-muted-foreground/40"
              />
            </div>
          )}

          {field.type === "checkbox" && (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <SquareCheck className="h-3 w-3 shrink-0" />동의·확인용 체크박스예요.
            </p>
          )}

          {field.type === "select" && (
            <div className="space-y-1.5">
              {/**
               * 공용 OptionRows 로 이관 — 설문 탭의 선택지 코드와 사실상 같은 코드였다.
               * 이관으로 얻는 것: 드래그·키보드 재정렬. 선택지 순서는 공개 폼 <select> 의
               * option 순서인데, 여기서 순서를 바꾸는 방법이 **문구를 다시 타이핑하는 것**뿐이었다.
               * 함께 없어진 것: 이 파일이 들고 있던 pendingFocus + data-opt-idx 쿼리 기반
               * 포커스 이동(골격의 autoFocusNewRow·removeNow({focus}) 가 대신한다).
               */}
              <OptionRows
                listId={`reg-field-${field.id}`}
                value={options}
                onChange={(next) => patch({ options: next })}
                ownerLabel="필드"
                ownerTitle={field.label}
              />
              {options.filter(Boolean).length === 0 && field.enabled && (
                <p className="text-[11px] text-amber-600">옵션이 없으면 등록 폼에 표시되지 않아요{field.required ? " — 필수 항목이라 등록도 막혀요" : ""}.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 등록 폼 미리보기 — 설문 미리보기와 같은 폰 프레임 + STK 테마(웨비나 색). 실제 등록 화면과 결을 맞춘다.
const REG_PREVIEW_CSS = `
.stk-live.regprev { background:var(--card-2); padding:20px 14px 28px; min-height:100%; }
.stk-live.regprev .rp-head { text-align:center; margin-bottom:16px; padding:0 4px; }
.stk-live.regprev .rp-kick { font-size:10px; font-weight:750; letter-spacing:.14em; text-transform:uppercase; color:var(--key); margin:0 0 6px; }
.stk-live.regprev .rp-title { font-size:18px; font-weight:820; letter-spacing:-.02em; color:var(--text); margin:0; word-break:keep-all; }
.stk-live.regprev .rp-desc { font-size:12px; line-height:1.6; color:var(--muted); margin:7px 0 0; word-break:keep-all; }
.stk-live.regprev .rp-card { background:var(--card); border-radius:16px; box-shadow:var(--card-shadow); padding:18px 15px; display:flex; flex-direction:column; gap:13px; }
.stk-live.regprev .rp-label { display:block; font-size:12px; font-weight:650; color:var(--text); margin:0 0 5px; word-break:keep-all; }
.stk-live.regprev .rp-label .rq { color:var(--key); margin-left:2px; }
.stk-live.regprev .rp-input { width:100%; padding:10px 12px; border-radius:10px; border:1.5px solid var(--line-md); background:var(--card-2); color:var(--text); font:inherit; font-size:13px; }
.stk-live.regprev .rp-input.ph { color:var(--sub); }
.stk-live.regprev .rp-consent { display:flex; align-items:flex-start; gap:8px; font-size:11.5px; line-height:1.5; color:var(--muted); }
.stk-live.regprev .rp-check { width:16px; height:16px; border-radius:5px; box-shadow:inset 0 0 0 1.5px var(--line-md); flex-shrink:0; margin-top:1px; display:grid; place-items:center; color:transparent; font-size:11px; font-weight:900; }
.stk-live.regprev .rp-check.on { background:var(--key); box-shadow:none; color:var(--on-key); }
.stk-live.regprev .rp-link { text-decoration:underline; text-underline-offset:2px; }
.stk-live.regprev .rp-submit { width:100%; height:46px; border-radius:12px; background:var(--key); color:var(--on-key); font:inherit; font-size:14px; font-weight:800; border:0; margin-top:3px; box-shadow:var(--btn-shadow-key); }
.stk-live.regprev .rp-empty { text-align:center; font-size:12px; color:var(--muted); padding:8px 0; }
`;

function RegistrationFormPreview({
  fields,
  privacyText,
  marketingText,
  privacyBody,
  marketingBody,
  privacyDefaultChecked,
  marketingDefaultChecked,
  submitLabel,
  theme,
  slug,
}: {
  fields: RegistrationField[];
  privacyText: string;
  marketingText: string;
  privacyBody: string;
  marketingBody: string;
  privacyDefaultChecked: boolean;
  marketingDefaultChecked: boolean;
  submitLabel: string;
  theme: { accent: string; text: string; surface: string };
  slug?: string;
}) {
  // 공개 폼과 같은 기준 — 빈 선택지 행(편집 중)은 없는 것으로 취급
  const visibleFields = fields.filter(
    (field) => field.enabled && !(field.type === "select" && (field.options ?? []).filter((o) => o.trim()).length === 0),
  );
  const css = useMemo(() => buildStkCss(theme.accent, theme.text, theme.surface) + REG_PREVIEW_CSS, [theme.accent, theme.text, theme.surface]);

  return (
    <div className="mx-auto w-full max-w-[440px] 2xl:sticky 2xl:top-4">
      <div className="mb-2 flex items-center gap-1.5 px-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
        <Smartphone className="h-3 w-3" />등록 화면 미리보기
        <span className="ml-auto inline-flex items-center gap-1.5 text-emerald-500">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" />실시간
        </span>
      </div>
      <div className="overflow-hidden rounded-[24px] shadow-xl">
        <div className="flex h-8 items-center justify-center bg-secondary/70 px-3">
          <span className="truncate font-mono text-[10px] text-muted-foreground/80">…/webinar/{slug ?? "…"} · 사전 등록</span>
        </div>
        <div className="relative max-h-[min(760px,calc(100vh-230px))] overflow-y-auto overscroll-contain">
          <style dangerouslySetInnerHTML={{ __html: css }} />
          <div className="stk-live regprev">
            <div className="rp-head">
              <p className="rp-kick">WEBINAR</p>
              <h4 className="rp-title">사전 등록</h4>
              <p className="rp-desc">웨비나 참여 정보를 입력해주세요.</p>
            </div>
            <div className="rp-card">
              {visibleFields.length === 0 && <p className="rp-empty">표시할 항목이 없어요.</p>}
              {visibleFields.map((field) => {
                if (field.type === "checkbox") {
                  return (
                    <label key={field.id} className="rp-consent">
                      <span className="rp-check" />
                      <span>{field.label}{field.required ? " *" : ""}</span>
                    </label>
                  );
                }
                return (
                  <div key={field.id}>
                    <label className="rp-label">{field.label}{field.required && <span className="rq">*</span>}</label>
                    {field.type === "select" ? (
                      <div className="rp-input ph">{(field.options ?? []).find((o) => o.trim()) ?? "선택해주세요"}</div>
                    ) : (
                      <div className="rp-input ph">{field.placeholder || (field.type === "email" ? "you@example.com" : field.type === "tel" ? "01012345678" : "입력해주세요")}</div>
                    )}
                  </div>
                );
              })}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label className="rp-consent">
                  <span className={`rp-check ${privacyDefaultChecked ? "on" : ""}`}>✓</span>
                  <span className={privacyBody ? "rp-link" : ""}>{privacyText}</span>
                </label>
                <label className="rp-consent">
                  <span className={`rp-check ${marketingDefaultChecked ? "on" : ""}`}>✓</span>
                  <span className={marketingBody ? "rp-link" : ""}>{marketingText}</span>
                </label>
              </div>
              <button type="button" className="rp-submit">{submitLabel}</button>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-2 px-1 text-center text-[11px] text-muted-foreground/70">배너 모달·라이브 페이지 등록 폼에 이대로 적용돼요.</p>
    </div>
  );
}

/**
 * 약관 전문 — 상속 요약 + 덮어쓰기.
 *
 * 예전엔 라벨 없는 큰 textarea 두 개가 **고빈도로 만지는 필드 빌더와 같은 스크롤**에 섞여
 * 있었고, 웨비나마다 같은 전문을 다시 붙여넣어야 했다. 이제 워크스페이스 템플릿이 기본이고
 * 이 웨비나만 다르게 할 때 펼쳐서 덮어쓴다(AGENTS: 저빈도 긴 세부는 가까운 확장으로).
 */
function ConsentBodyField({
  label, value, onChange, template,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  template?: string | null;
}) {
  const resolved = resolveConsentBody(value, template);
  const overriding = resolved.source === "webinar";
  const [open, setOpen] = useState(overriding);

  return (
    <div className="mt-2 space-y-1.5 rounded-xl bg-secondary/25 p-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[11px] text-muted-foreground">전문</span>
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
          resolved.source === "webinar" ? "bg-violet-500/10 text-violet-600 dark:text-violet-400"
          : resolved.source === "workspace" ? "bg-secondary text-muted-foreground"
          : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
        }`}>
          {consentSourceLabel(resolved.source)}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="ml-auto text-[11px] font-medium text-violet-500 transition-colors hover:text-violet-600"
        >
          {open ? "접기" : overriding ? "전문 보기·수정" : "이 웨비나만 다르게"}
        </button>
      </div>

      {!open && (
        <p className="line-clamp-2 whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground/80">
          {resolved.body || "전문이 없어요 — 동의 문구를 눌러도 팝업이 뜨지 않아요."}
        </p>
      )}

      {open && (
        <>
          <textarea
            rows={5}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={`${label} 약관 전문 (이 웨비나 전용)`}
            placeholder={template ? "비워 두면 워크스페이스 공통 전문을 씁니다." : "약관 전문 — 워크스페이스 설정 › 약관에 넣어 두면 모든 웨비나가 물려받아요."}
            className={`${FIELD_CLS} resize-y leading-relaxed`}
          />
          {overriding && template && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="text-[11px] text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
            >
              워크스페이스 공통으로 되돌리기
            </button>
          )}
          {!template && (
            <p className="text-[11px] leading-relaxed text-muted-foreground/70">
              같은 전문을 웨비나마다 붙여넣고 있다면 워크스페이스 설정 › 약관에 한 번만 넣어 두세요.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function RegistrationFormTab({ webinar, onSilentUpdate }: { webinar: Webinar; onSilentUpdate: () => void }) {
  const initial = normalizeRegistrationForm(webinar.config ?? {}, { includeDisabled: true });
  const [fields, setFields] = useState<RegistrationField[]>(initial.fields);
  const [privacyText, setPrivacyText] = useState(initial.privacyText);
  const [marketingText, setMarketingText] = useState(initial.marketingText);
  const [privacyBody, setPrivacyBody] = useState(initial.privacyBody);
  const [marketingBody, setMarketingBody] = useState(initial.marketingBody);
  const [privacyDefaultChecked, setPrivacyDefaultChecked] = useState(initial.privacyDefaultChecked);
  const [marketingDefaultChecked, setMarketingDefaultChecked] = useState(initial.marketingDefaultChecked);

  /**
   * 접수 창 — 언제까지, 그리고 라이브 중에도 받는가. IA 3단계에서 '기본 정보' 에서 옮겨 왔다.
   * 둘 다 접수 정책인데 마감은 일정 카드 안, 라이브 중 정책은 그 밖에 있어서 **모순 조합을
   * 경고할 자리가 없었다.** 한 블록으로 모으니 그 자리가 생긴다.
   */
  const liveStartLocal = kstDateTimeLocalInput(webinar.liveStartAt);
  const [deadline, setDeadline] = useState(() => kstDateTimeLocalInput(webinar.signupDeadline));
  const liveRegOf = (c: Record<string, unknown> | null | undefined) =>
    c?.allowLiveRegistration === false ? "closed" : c?.allowLiveRegistration === true ? "open" : "auto";
  const [liveReg, setLiveReg] = useState<"auto" | "open" | "closed">(() => liveRegOf(webinar.components));
  const [submitLabel, setSubmitLabel] = useState(initial.submitLabel);

  const previewTheme = useMemo(() => ({
    accent: webinar.theme?.accentColor || "#6D28D9",
    text: webinar.theme?.textColor || "#141320",
    surface: webinar.theme?.surfaceColor || "#FFFFFF",
  }), [webinar.theme]);

  const addCustomField = () => {
    const id = crypto.randomUUID();
    setFields((prev) => [
      ...prev,
      {
        id,
        key: `custom_${id.slice(0, 8)}`,
        label: "새 필드",
        type: "text",
        placeholder: "",
        required: false,
        enabled: true,
        options: [],
        system: false,
      },
    ]);
  };

  // 자동저장 — 필드(순서 포함)·동의 문구 변경 시 디바운스 후 PATCH(config.registrationForm).
  const save = async () => {
    try {
      const res = await fetch(`/api/webinars/${webinar.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        keepalive: true, // 페이지 이탈 중 flush 도 서버에 도달하도록
        // 이 탭이 소유한 registrationForm 키만 보낸다(서버가 config 를 키 단위로 병합).
        body: JSON.stringify({
          // 접수 창은 이 탭이 소유한다(기본 정보 탭은 더 이상 보내지 않는다).
          // auto 는 null 로 저장해 "마감일까지" 기존 동작을 유지한다.
          signupDeadline: kstDateTimeLocalToIso(deadline),
          components: { allowLiveRegistration: liveReg === "closed" ? false : liveReg === "open" ? true : null },
          config: {
            registrationForm: {
              // 편집 중 빈 선택지 행은 로컬에만 두고 저장에서는 정리 — 공개 폼에 빈 옵션이 새지 않게
              fields: fields.map((f) => ({ ...f, options: (f.options ?? []).map((o) => o.trim()).filter(Boolean) })),
              privacyText: privacyText.trim() || initial.privacyText,
              marketingText: marketingText.trim() || initial.marketingText,
              privacyBody: privacyBody.trim(),
              marketingBody: marketingBody.trim(),
              privacyDefaultChecked,
              marketingDefaultChecked,
              submitLabel: submitLabel.trim() || initial.submitLabel,
            },
          },
        }),
      });
      if (!res.ok) { toast.error("자동 저장 실패 — 잠시 후 다시 시도돼요", { id: "autosave-error" }); return false; }
      onSilentUpdate();
      return true;
    } catch { return false; }
  };
  const { state: saveState, retry } = useAutosave(
    { fields, privacyText, marketingText, privacyBody, marketingBody, privacyDefaultChecked, marketingDefaultChecked, submitLabel, deadline, liveReg },
    save,
  );
  // 표시는 껍데기 한 곳에서 그린다(만들기 화면당 1개) — 저장 경로는 그대로 각자.
  useReportAutosave(saveState, retry);

  /**
   * 접수 창의 두 값이 서로를 무의미하게 만드는 조합만 짚는다(에러가 아니라 안내).
   * 서버 규칙은 "마감 ≤ 종료" 뿐이라 이 조합들은 저장은 되지만 운영자 의도와 어긋난다.
   */
  const intakeConflict =
    liveReg === "open" && deadline === liveStartLocal
      ? "마감을 ‘라이브 시작 시점’ 으로 두고 ‘계속 받기’ 를 골랐어요 — 마감 시각이 사실상 의미가 없어져요."
      : liveReg === "closed" && deadline > liveStartLocal
        ? "마감이 라이브 시작보다 뒤인데 ‘시작 시 마감’ 이에요 — 설정한 마감 시각에는 도달하지 못해요."
        : null;

  const hasTel = fields.some((f) => f.enabled && f.type === "tel");

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] space-y-6 2xl:grid 2xl:grid-cols-[minmax(0,1fr)_440px] 2xl:gap-8 2xl:space-y-0 2xl:items-start">
      <div className="space-y-6 min-w-0">
        {/* 접수 창 — 무엇을 받는지(아래)보다 상위 결정이라 위에 둔다. 두 줄이라 아래를 밀어내지 않는다. */}
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">접수 창</h3>
            <p className="mt-1 text-sm text-muted-foreground">언제까지 받고, 라이브가 시작된 뒤에도 받을지 정해요.</p>
          </div>
          <div className="space-y-3 rounded-2xl bg-secondary/20 p-4">
            <SignupDeadlineField liveStartAt={liveStartLocal} value={deadline} onChange={setDeadline} />

            <div className="space-y-1.5 pt-1">
              <span className="text-xs font-medium">라이브 중 사전등록</span>
              <div className="flex flex-wrap gap-1.5">
                {([
                  { v: "auto", label: "마감일까지" },
                  { v: "open", label: "계속 받기" },
                  { v: "closed", label: "시작 시 마감" },
                ] as const).map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    aria-pressed={liveReg === opt.v}
                    onClick={() => setLiveReg(opt.v)}
                    className={`rounded-lg px-3 py-2 text-xs font-medium shadow-sm transition-colors ${
                      liveReg === opt.v ? "bg-violet-500 text-white" : "bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <span className="block text-[11px] leading-relaxed text-muted-foreground/70">
                {liveReg === "auto" ? "설정한 마감 시각이 지나면 접수를 닫아요."
                  : liveReg === "open" ? "마감이 지나도 라이브 중 들어온 사람이 등록할 수 있어요 — 입장 확인 화면에 사전등록 버튼이 보여요."
                  : "라이브가 시작되면 바로 접수를 닫아요. 입장 확인 화면에 사전등록 버튼이 보이지 않아요."}
              </span>
            </div>

            {/* 두 값이 서로를 무의미하게 만드는 조합 — 예전엔 두 컨트롤이 다른 화면에 있어 경고할 자리가 없었다. */}
            {intakeConflict && (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
                {intakeConflict}
              </p>
            )}
          </div>
        </section>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">입력 항목</h3>
            <p className="text-sm text-muted-foreground mt-1">
              카드에서 바로 수정돼요. 왼쪽 그립(⠿)을 끌면 순서가 바뀝니다.
            </p>
          </div>
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.96 }}
            transition={spring}
            onClick={addCustomField}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-500 text-white text-xs font-medium hover:bg-violet-600 transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />필드 추가
          </motion.button>
        </div>

        <EditableList<RegistrationField>
          listId="reg-fields"
          itemNoun="필드"
          items={fields}
          onChange={setFields}
          rowKey={(f) => f.id}
          reorderable
          rowChrome="bare"
          // 기본 필드(이름·연락처·이메일)는 지울 수 없다 — 골격이 삭제 컨트롤 자리에 null 을 준다.
          removable={(f) => !f.system}
          // 추가 버튼은 이 섹션 헤더에 이미 있다(유형을 먼저 고르는 흐름) — 골격은 그리지 않는다.
          renderAdd={() => null}
          renderRow={({ item, handle, removeButton }) => (
            <FieldCard field={item} setFields={setFields} handle={handle} removeButton={removeButton} />
          )}
        />
        {hasTel && (
          <p className="text-[11px] text-muted-foreground/70 -mt-3">전화번호 필드는 하이픈(-) 없이 숫자만 입력받아요.</p>
        )}

        <section className="space-y-3 pt-4 border-t border-border">
          <div>
            <h3 className="text-sm font-semibold">동의 문구 · 버튼</h3>
            <p className="text-xs text-muted-foreground mt-1">폼 하단의 동의 체크박스와 제출 버튼 문구예요.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">개인정보 동의 문구</label>
              <input value={privacyText} onChange={(e) => setPrivacyText(e.target.value)} className={inputCls} />
              <ConsentBodyField
                label="개인정보 수집·이용"
                value={privacyBody}
                onChange={setPrivacyBody}
                template={webinar.workspace?.privacyBodyTemplate}
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground mt-2 select-none">
                <Switch checked={privacyDefaultChecked} onChange={setPrivacyDefaultChecked} label="개인정보 동의 기본 체크" />
                폼 진입 시 기본으로 체크해두기
              </label>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">마케팅 동의 문구</label>
              <input value={marketingText} onChange={(e) => setMarketingText(e.target.value)} className={inputCls} />
              <ConsentBodyField
                label="마케팅 정보 수신"
                value={marketingBody}
                onChange={setMarketingBody}
                template={webinar.workspace?.marketingBodyTemplate}
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground mt-2 select-none">
                <Switch checked={marketingDefaultChecked} onChange={setMarketingDefaultChecked} label="마케팅 동의 기본 체크" />
                폼 진입 시 기본으로 체크해두기
              </label>
              {marketingDefaultChecked && (
                <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-1 leading-relaxed">
                  마케팅 정보 수신은 선택 동의 항목이에요. 국가·업종에 따라 사전 체크가 관련 법령(예: 정보통신망법)에 저촉될 수 있으니 적용 전 확인해주세요.
                </p>
              )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">제출 버튼 문구</label>
              <input value={submitLabel} onChange={(e) => setSubmitLabel(e.target.value)} className={inputCls} />
            </div>
          </div>
        </section>
      </div>

      <RegistrationFormPreview
        fields={fields}
        privacyText={privacyText}
        marketingText={marketingText}
        privacyBody={privacyBody}
        marketingBody={marketingBody}
        privacyDefaultChecked={privacyDefaultChecked}
        marketingDefaultChecked={marketingDefaultChecked}
        submitLabel={submitLabel}
        theme={previewTheme}
        slug={webinar.slug}
      />
    </div>
  );
}
