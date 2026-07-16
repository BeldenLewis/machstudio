"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { motion, Reorder, useDragControls } from "framer-motion";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { useAutosave } from "@/components/ui/use-autosave";
import { AutosaveIndicator } from "@/components/ui/autosave-indicator";
import { Switch } from "@/components/ui/switch";
import { normalizeRegistrationForm, type WebinarRegistrationField } from "@/lib/webinar-config";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

type FieldType = WebinarRegistrationField["type"];
export type RegistrationField = WebinarRegistrationField;

const TYPE_LABELS: Record<FieldType, string> = {
  text: "텍스트",
  email: "이메일",
  tel: "전화번호",
  select: "드롭다운",
  checkbox: "체크박스",
};

interface Webinar {
  id: string;
  config: Record<string, unknown>;
}

const inputCls = "w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors disabled:opacity-40";
// 한 줄 인라인 편집 그리드 — 그립 | 라벨 | 타입 | 입력 예시 | 필수 | 표시 | 삭제
const ROW_GRID = "grid grid-cols-[24px_minmax(0,1.1fr)_104px_minmax(0,1.3fr)_36px_36px_24px] gap-2 items-center";

// 필드 한 줄 — 라벨·타입·placeholder·필수·표시 전부 행 안에서 바로 편집 (펼침 없음).
function FieldRow({
  field,
  setFields,
  onRemove,
}: {
  field: RegistrationField;
  setFields: Dispatch<SetStateAction<RegistrationField[]>>;
  onRemove: () => void;
}) {
  const dragControls = useDragControls();
  const patch = (next: Partial<RegistrationField>) =>
    setFields((fields) => fields.map((item) => (item.id === field.id ? { ...item, ...next } : item)));

  const isName = field.system && field.key === "name";
  const typeLocked = field.system && ["name", "phone", "email"].includes(field.key);

  return (
    <Reorder.Item
      value={field}
      dragListener={false}
      dragControls={dragControls}
      layout
      className={`rounded-xl border border-border bg-background px-2 py-2 ${field.enabled ? "" : "opacity-55"}`}
    >
      <div className={ROW_GRID}>
        <button
          type="button"
          aria-label="순서 변경"
          onPointerDown={(e) => { e.preventDefault(); dragControls.start(e); }}
          className="p-1 rounded-md text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none transition-colors justify-self-center"
        >
          <GripVertical className="w-4 h-4" />
        </button>

        <input value={field.label} onChange={(e) => patch({ label: e.target.value })} aria-label="라벨" className={inputCls} />

        <select
          value={field.type}
          onChange={(e) => patch({ type: e.target.value as FieldType })}
          disabled={typeLocked}
          aria-label="타입"
          className={inputCls}
        >
          {(Object.keys(TYPE_LABELS) as FieldType[]).map((t) => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>

        <input
          value={field.placeholder ?? ""}
          onChange={(e) => patch({ placeholder: e.target.value })}
          disabled={field.type === "checkbox" || field.type === "select"}
          placeholder={field.type === "tel" ? "01012345678" : field.type === "checkbox" || field.type === "select" ? "—" : "입력 예시"}
          aria-label="입력 예시"
          className={inputCls}
        />

        <Switch checked={field.required} onChange={(v) => patch({ required: v })} disabled={isName} label={`${field.label} 필수`} />
        <Switch checked={field.enabled} onChange={(v) => patch({ enabled: v })} disabled={isName} label={`${field.label} 표시`} />

        {field.system ? (
          <span />
        ) : (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`${field.label} 삭제`}
            className="p-1 rounded-md text-muted-foreground/50 hover:text-red-500 transition-colors justify-self-center"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {field.type === "select" && (
        <div className="mt-2 ml-8 mr-1">
          <textarea
            rows={2}
            value={(field.options ?? []).join("\n")}
            onChange={(e) => patch({ options: e.target.value.split("\n").map((v) => v.trim()).filter(Boolean) })}
            placeholder={"드롭다운 옵션 — 한 줄에 하나씩"}
            className={`${inputCls} resize-none`}
          />
        </div>
      )}
    </Reorder.Item>
  );
}

function RegistrationFormPreview({
  fields,
  privacyText,
  marketingText,
  privacyBody,
  marketingBody,
  privacyDefaultChecked,
  marketingDefaultChecked,
  submitLabel,
}: {
  fields: RegistrationField[];
  privacyText: string;
  marketingText: string;
  privacyBody: string;
  marketingBody: string;
  privacyDefaultChecked: boolean;
  marketingDefaultChecked: boolean;
  submitLabel: string;
}) {
  const visibleFields = fields.filter((field) => field.enabled);

  return (
    <aside className="sticky top-6 rounded-2xl border border-border bg-secondary/20 p-4 space-y-4">
      <div>
        <p className="text-sm font-semibold">미리보기</p>
        <p className="text-xs text-muted-foreground mt-1">배너 모달과 라이브 페이지 등록 폼에 적용됩니다.</p>
      </div>
      <div className="rounded-2xl border border-border bg-background p-5 space-y-3 shadow-sm">
        <div>
          <h4 className="text-base font-semibold">사전 등록</h4>
          <p className="text-xs text-muted-foreground mt-1">웨비나 참여 정보를 입력해주세요.</p>
        </div>
        <div className="space-y-3">
          {visibleFields.map((field) => {
            if (field.type === "checkbox") {
              return (
                <label key={field.id} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" className="mt-0.5 accent-violet-500" />
                  <span>{field.label}{field.required ? " *" : ""}</span>
                </label>
              );
            }

            return (
              <div key={field.id}>
                <label className="text-xs text-muted-foreground mb-1 block">
                  {field.label}{field.required ? " *" : ""}
                </label>
                {field.type === "select" ? (
                  <select className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none">
                    <option>선택해주세요</option>
                    {(field.options ?? []).map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type}
                    placeholder={field.placeholder}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none"
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="space-y-2 pt-1">
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            {/* key 로 강제 리마운트 — defaultChecked 는 uncontrolled 라 prop 변경만으로는 재반영되지 않음 */}
            <input key={`p-${privacyDefaultChecked}`} type="checkbox" defaultChecked={privacyDefaultChecked} className="mt-0.5 accent-violet-500" />
            <span className={privacyBody ? "underline underline-offset-2 decoration-from-font" : ""}>{privacyText}</span>
          </label>
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input key={`m-${marketingDefaultChecked}`} type="checkbox" defaultChecked={marketingDefaultChecked} className="mt-0.5 accent-violet-500" />
            <span className={marketingBody ? "underline underline-offset-2 decoration-from-font" : ""}>{marketingText}</span>
          </label>
        </div>
        <button className="w-full py-2.5 rounded-xl bg-violet-500 text-white text-sm font-medium">
          {submitLabel}
        </button>
      </div>
    </aside>
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
  const [submitLabel, setSubmitLabel] = useState(initial.submitLabel);

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
        body: JSON.stringify({
          config: {
            ...(webinar.config ?? {}),
            registrationForm: {
              fields,
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
    { fields, privacyText, marketingText, privacyBody, marketingBody, privacyDefaultChecked, marketingDefaultChecked, submitLabel },
    save,
  );

  const hasTel = fields.some((f) => f.enabled && f.type === "tel");

  return (
    <div className="p-4 sm:p-6 lg:p-8 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
      <div className="space-y-6 min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">입력 항목</h3>
            <p className="text-sm text-muted-foreground mt-1">
              모든 값은 행에서 바로 수정돼요. 왼쪽 그립(⠿)을 끌면 순서가 바뀝니다.
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

        <div className="overflow-x-auto">
          <div className="min-w-[560px] space-y-1.5">
            <div className={`${ROW_GRID} px-2 text-[11px] font-medium text-muted-foreground/70`}>
              <span />
              <span>라벨</span>
              <span>타입</span>
              <span>입력 예시</span>
              <span className="text-center">필수</span>
              <span className="text-center">표시</span>
              <span />
            </div>
            <Reorder.Group axis="y" values={fields} onReorder={setFields} className="space-y-1.5">
              {fields.map((field) => (
                <FieldRow
                  key={field.id}
                  field={field}
                  setFields={setFields}
                  onRemove={() => setFields((prev) => prev.filter((item) => item.id !== field.id))}
                />
              ))}
            </Reorder.Group>
          </div>
        </div>
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
              <textarea
                rows={4}
                value={privacyBody}
                onChange={(e) => setPrivacyBody(e.target.value)}
                placeholder="약관 전문 — 입력하면 폼에서 문구를 눌렀을 때 팝업으로 보여요. 비워두면 팝업 없음."
                className={`${inputCls} mt-2 resize-y`}
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground mt-2 select-none">
                <Switch checked={privacyDefaultChecked} onChange={setPrivacyDefaultChecked} label="개인정보 동의 기본 체크" />
                폼 진입 시 기본으로 체크해두기
              </label>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">마케팅 동의 문구</label>
              <input value={marketingText} onChange={(e) => setMarketingText(e.target.value)} className={inputCls} />
              <textarea
                rows={4}
                value={marketingBody}
                onChange={(e) => setMarketingBody(e.target.value)}
                placeholder="약관 전문 — 입력하면 폼에서 문구를 눌렀을 때 팝업으로 보여요. 비워두면 팝업 없음."
                className={`${inputCls} mt-2 resize-y`}
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

        <AutosaveIndicator state={saveState} onRetry={retry} />
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
      />
    </div>
  );
}
