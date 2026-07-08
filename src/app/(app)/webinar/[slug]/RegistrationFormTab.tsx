"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { motion } from "framer-motion";
import { GripVertical, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

type FieldType = "text" | "email" | "tel" | "select" | "checkbox";

export interface RegistrationField {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  required: boolean;
  enabled: boolean;
  options?: string[];
  system?: boolean;
}

interface RegistrationFormConfig {
  fields: RegistrationField[];
  privacyText: string;
  marketingText: string;
  submitLabel: string;
}

interface Webinar {
  id: string;
  config: Record<string, unknown>;
}

const defaultFields: RegistrationField[] = [
  { id: "name", key: "name", label: "이름", type: "text", placeholder: "홍길동", required: true, enabled: true, system: true },
  { id: "phone", key: "phone", label: "연락처", type: "tel", placeholder: "010-0000-0000", required: false, enabled: true, system: true },
  { id: "email", key: "email", label: "이메일", type: "email", placeholder: "hong@example.com", required: false, enabled: true, system: true },
  { id: "company", key: "company", label: "회사명", type: "text", placeholder: "", required: false, enabled: true, system: true },
  { id: "department", key: "department", label: "부서", type: "text", placeholder: "", required: false, enabled: true, system: true },
  { id: "jobTitle", key: "jobTitle", label: "직함", type: "text", placeholder: "", required: false, enabled: true, system: true },
  { id: "industry", key: "industry", label: "업종", type: "text", placeholder: "", required: false, enabled: true, system: true },
];

function normalizeRegistrationForm(config: Record<string, unknown>): RegistrationFormConfig {
  const raw = config.registrationForm as Partial<RegistrationFormConfig> | undefined;
  const savedFields = Array.isArray(raw?.fields) ? raw.fields : [];
  const merged = defaultFields.map((field) => ({
    ...field,
    ...savedFields.find((item) => item && item.key === field.key),
    id: field.id,
    key: field.key,
    system: true,
  }));
  const customFields = savedFields
    .filter((item) => item && !defaultFields.some((field) => field.key === item.key))
    .map((item) => ({
      id: String(item.id ?? item.key ?? crypto.randomUUID()),
      key: String(item.key ?? `custom_${crypto.randomUUID().slice(0, 8)}`),
      label: String(item.label ?? "커스텀 필드"),
      type: (["text", "email", "tel", "select", "checkbox"].includes(String(item.type)) ? item.type : "text") as FieldType,
      placeholder: String(item.placeholder ?? ""),
      required: Boolean(item.required),
      enabled: item.enabled !== false,
      options: Array.isArray(item.options) ? item.options.map(String) : [],
      system: false,
    }));

  return {
    fields: [...merged, ...customFields],
    privacyText: raw?.privacyText ?? "[필수] 개인정보 수집 및 이용에 동의합니다",
    marketingText: raw?.marketingText ?? "[선택] 마케팅 정보 수신에 동의합니다",
    submitLabel: raw?.submitLabel ?? "사전 등록하기",
  };
}

function FieldEditor({
  field,
  setFields,
  onRemove,
}: {
  field: RegistrationField;
  setFields: Dispatch<SetStateAction<RegistrationField[]>>;
  onRemove: () => void;
}) {
  const patch = (next: Partial<RegistrationField>) => {
    setFields((fields) => fields.map((item) => item.id === field.id ? { ...item, ...next } : item));
  };

  return (
    <div className={`p-4 rounded-2xl border ${field.enabled ? "border-border bg-background" : "border-border bg-secondary/30 opacity-70"}`}>
      <div className="flex items-start gap-3">
        <GripVertical className="w-4 h-4 text-muted-foreground/40 mt-2 shrink-0" />
        <div className="flex-1 min-w-0 space-y-3">
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 sm:col-span-4">
              <label className="text-xs text-muted-foreground mb-1 block">라벨</label>
              <input
                value={field.label}
                onChange={(e) => patch({ label: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors"
              />
            </div>
            <div className="col-span-12 sm:col-span-3">
              <label className="text-xs text-muted-foreground mb-1 block">타입</label>
              <select
                value={field.type}
                onChange={(e) => patch({ type: e.target.value as FieldType })}
                disabled={field.system && ["name", "phone", "email"].includes(field.key)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 disabled:opacity-50"
              >
                <option value="text">텍스트</option>
                <option value="email">이메일</option>
                <option value="tel">전화번호</option>
                <option value="select">드롭다운</option>
                <option value="checkbox">체크박스</option>
              </select>
            </div>
            <div className="col-span-12 sm:col-span-5">
              <label className="text-xs text-muted-foreground mb-1 block">placeholder</label>
              <input
                value={field.placeholder ?? ""}
                onChange={(e) => patch({ placeholder: e.target.value })}
                disabled={field.type === "checkbox"}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 disabled:opacity-50"
              />
            </div>
          </div>

          {field.type === "select" && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">드롭다운 옵션 (줄바꿈으로 구분)</label>
              <textarea
                rows={3}
                value={(field.options ?? []).join("\n")}
                onChange={(e) => patch({ options: e.target.value.split("\n").map((v) => v.trim()).filter(Boolean) })}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm resize-none focus:outline-none focus:border-violet-400"
              />
            </div>
          )}

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={field.enabled}
                onChange={(e) => patch({ enabled: e.target.checked })}
                disabled={field.key === "name"}
                className="accent-violet-500"
              />
              표시
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => patch({ required: e.target.checked })}
                disabled={field.key === "name"}
                className="accent-violet-500"
              />
              필수
            </label>
          </div>
        </div>

        {!field.system && (
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.92 }}
            transition={spring}
            onClick={onRemove}
            className="p-1.5 rounded-lg hover:bg-red-500/10 hover:text-red-500 text-muted-foreground transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </motion.button>
        )}
      </div>
    </div>
  );
}

function RegistrationFormPreview({
  fields,
  privacyText,
  marketingText,
  submitLabel,
}: {
  fields: RegistrationField[];
  privacyText: string;
  marketingText: string;
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
                    <option>{field.placeholder || "선택해주세요"}</option>
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
            <input type="checkbox" defaultChecked className="mt-0.5 accent-violet-500" />
            <span>{privacyText}</span>
          </label>
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input type="checkbox" className="mt-0.5 accent-violet-500" />
            <span>{marketingText}</span>
          </label>
        </div>
        <button className="w-full py-2.5 rounded-xl bg-violet-500 text-white text-sm font-medium">
          {submitLabel}
        </button>
      </div>
    </aside>
  );
}

export default function RegistrationFormTab({ webinar, onUpdate }: { webinar: Webinar; onUpdate: () => void }) {
  const initial = normalizeRegistrationForm(webinar.config ?? {});
  const [fields, setFields] = useState<RegistrationField[]>(initial.fields);
  const [privacyText, setPrivacyText] = useState(initial.privacyText);
  const [marketingText, setMarketingText] = useState(initial.marketingText);
  const [submitLabel, setSubmitLabel] = useState(initial.submitLabel);
  const [isSaving, setIsSaving] = useState(false);

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

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/webinars/${webinar.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            ...(webinar.config ?? {}),
            registrationForm: {
              fields,
              privacyText: privacyText.trim() || initial.privacyText,
              marketingText: marketingText.trim() || initial.marketingText,
              submitLabel: submitLabel.trim() || initial.submitLabel,
            },
          },
        }),
      });
      if (!res.ok) { toast.error("등록 폼 저장 실패"); return; }
      toast.success("등록 폼이 저장됐어요");
      onUpdate();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
      <div className="space-y-6 min-w-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">등록 폼</h3>
          <p className="text-sm text-muted-foreground mt-1">
            배너 사전등록 모달과 라이브 페이지 등록 폼이 이 설정을 사용합니다.
          </p>
        </div>
        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.96 }}
          transition={spring}
          onClick={addCustomField}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-500 text-white text-xs font-medium hover:bg-violet-600 transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />커스텀 필드
        </motion.button>
      </div>

      <div className="space-y-2">
        {fields.map((field) => (
          <FieldEditor
            key={field.id}
            field={field}
            setFields={setFields}
            onRemove={() => setFields((prev) => prev.filter((item) => item.id !== field.id))}
          />
        ))}
      </div>

      <section className="space-y-3 pt-4 border-t border-border">
        <h3 className="text-sm font-semibold">동의 문구 / 버튼</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">개인정보 동의 문구</label>
            <input
              value={privacyText}
              onChange={(e) => setPrivacyText(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">마케팅 동의 문구</label>
            <input
              value={marketingText}
              onChange={(e) => setMarketingText(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">제출 버튼 문구</label>
            <input
              value={submitLabel}
              onChange={(e) => setSubmitLabel(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors"
            />
          </div>
        </div>
      </section>

      <motion.button
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.97 }}
        transition={spring}
        onClick={handleSave}
        disabled={isSaving}
        className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors disabled:opacity-40"
      >
        <Save className="w-4 h-4" />
        {isSaving ? "저장 중..." : "등록 폼 저장"}
      </motion.button>
      </div>

      <RegistrationFormPreview
        fields={fields}
        privacyText={privacyText}
        marketingText={marketingText}
        submitLabel={submitLabel}
      />
    </div>
  );
}
