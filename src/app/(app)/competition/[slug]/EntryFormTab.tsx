"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlignLeft, ImageIcon, ListChecks, ListPlus, Mail, Phone, Plus, SquareCheck, Trash2, Video,
} from "lucide-react";
import { toast } from "sonner";
import { NOTICE_LANGUAGES } from "@/lib/notice/config";
import { FIELD_CLS, FINISH, R } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/switch";
import type { CompetitionFieldType, CompetitionFormField } from "@/lib/competition-config";
import { CompetitionLegalGenerator } from "./CompetitionLegalGenerator";
import { ConsentBodyField, useWorkspaceLegalProfile } from "@/components/legal/legal-generator-shared";
import { resolveOrgProfile } from "@/lib/legal-templates";
import FormPreview from "./FormPreview";
import type { CompetitionDetail } from "./page";

const CONSENT_KIND_META = {
  privacy: { label: "개인정보 수집·이용 (필수)", noun: "개인정보" },
  marketing: { label: "마케팅 수신 (선택)", noun: "마케팅" },
  thirdParty: { label: "제3자 제공 (선택)", noun: "제3자 제공" },
} as const;

interface Props {
  competition: CompetitionDetail;
  patch: (body: Record<string, unknown>, successMessage?: string) => Promise<boolean>;
  /** 법률 문구 생성기가 워크스페이스 조직 정보를 읽어올 때만 쓴다 — 없으면 그 패널만 비활성. */
  workspaceId?: string;
}

const TYPE_META: Record<CompetitionFieldType, { label: string; icon: typeof AlignLeft }> = {
  text: { label: "텍스트", icon: AlignLeft },
  email: { label: "이메일", icon: Mail },
  tel: { label: "전화번호", icon: Phone },
  select: { label: "드롭다운", icon: ListChecks },
  multiple: { label: "복수 선택", icon: ListPlus },
  checkbox: { label: "체크박스", icon: SquareCheck },
  image: { label: "이미지", icon: ImageIcon },
  youtube: { label: "YouTube", icon: Video },
};

const TYPE_ORDER: CompetitionFieldType[] = ["text", "email", "tel", "select", "multiple", "checkbox", "image", "youtube"];
const CHOICE_TYPES: CompetitionFieldType[] = ["select", "multiple"];

export default function EntryFormTab({ competition, patch, workspaceId }: Props) {
  const [form, setForm] = useState(competition.config.form);
  /**
   * 문구 언어는 **대회 전체 설정**(기본정보 탭)이다 — 여기서 따로 고르지 않는다.
   * 예전엔 여기서도 고를 수 있었는데, 그 값을 공고 탭이 아니라 **여기 저장이 최종적으로
   * 반영**하는 구조였다(신청 폼 탭 save 가 top-level config.language 를 쓴다) — 그래서
   * 공고 탭의 언어 버튼은 눌러도 반영되지 않는 죽은 컨트롤이었다. 기본정보로 하나로 모은다.
   */
  const language = competition.config.language;
  const [legal, setLegal] = useState(competition.config.legal);
  const [saving, setSaving] = useState(false);

  // 동의 전문 편집 칸이 {{ORG_ADDRESS}} 같은 조직 토큰을 실제 값으로 풀어 보여주는 데 쓴다.
  const { profile: orgProfile } = useWorkspaceLegalProfile(workspaceId);
  const org = useMemo(() => resolveOrgProfile(orgProfile, legal.country), [orgProfile, legal.country]);
  const legalLocale = legal.country === "kr" ? "ko" : "en";

  const update = (next: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...next }));
  const updateField = (id: string, next: Partial<CompetitionFormField>) =>
    setForm((prev) => ({ ...prev, fields: prev.fields.map((f) => (f.id === id ? { ...f, ...next } : f)) }));

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= form.fields.length) return;
    const fields = [...form.fields];
    [fields[index], fields[target]] = [fields[target], fields[index]];
    update({ fields });
  };

  const addField = () => {
    const id = `f-${Date.now().toString(36)}`;
    update({
      fields: [
        ...form.fields,
        { id, key: `custom_${form.fields.length + 1}`, label: "새 항목", type: "text", placeholder: "", required: false, enabled: true, options: [], system: false },
      ],
    });
  };

  const save = async () => {
    // 키 중복은 제출 데이터를 덮어쓴다 — 저장 전에 막는다.
    const keys = form.fields.map((f) => f.key.trim()).filter(Boolean);
    if (new Set(keys).size !== keys.length) {
      toast.error("항목 키가 중복됐어요. 각 항목의 키는 서로 달라야 해요.");
      return;
    }
    if (keys.length !== form.fields.length) {
      toast.error("키가 비어 있는 항목이 있어요.");
      return;
    }
    setSaving(true);
    try {
      await patch({ config: { ...competition.config, form, legal } }, "신청 폼을 저장했어요");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
      <section className={`bg-background p-5 ${R.panel} ${FINISH.s1}`}>
        <h2 className="text-sm font-semibold">폼 안내</h2>

        {/*
          **시스템이 넣는 문구의 언어.** 대회 전체 설정(기본정보 탭)이라 여기서는 읽기만 한다 —
          이유는 위 language 선언부 주석 참고.
        */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium">문구 언어</span>
          <span className={`px-2.5 py-1 text-[11px] font-medium ${R.control} bg-secondary text-foreground`}>
            {NOTICE_LANGUAGES.find((l) => l.value === language)?.label ?? language}
          </span>
          <span className="text-[11px] text-muted-foreground">
            파일 크기·영상 공개 설정 안내, 버튼·오류 문구가 바뀌어요 · <b>기본정보 탭</b>에서 바꿀 수 있어요
          </span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">폼 제목</span>
            <input value={form.title} onChange={(e) => update({ title: e.target.value })} className={FIELD_CLS} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">제출 버튼 문구</span>
            <input value={form.submitLabel} onChange={(e) => update({ submitLabel: e.target.value })} className={FIELD_CLS} />
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-medium text-muted-foreground">안내 문구</span>
            <input value={form.description} onChange={(e) => update({ description: e.target.value })} className={FIELD_CLS} />
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-medium text-muted-foreground">제출 완료 문구</span>
            <input value={form.successMessage} onChange={(e) => update({ successMessage: e.target.value })} className={FIELD_CLS} />
          </label>
        </div>
      </section>

      <section className={`bg-background p-5 ${R.panel} ${FINISH.s1}`}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">신청 항목</h2>
          <span className="text-[11px] text-muted-foreground">{form.fields.length}개</span>
        </div>

        <div className="mt-4 space-y-2">
          {form.fields.map((field, index) => {
            const Icon = TYPE_META[field.type]?.icon ?? AlignLeft;
            return (
              <div key={field.id} className={`bg-secondary/20 p-3 ${R.surface} ${FINISH.s2}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex flex-col">
                    <button onClick={() => move(index, -1)} disabled={index === 0} className="text-muted-foreground disabled:opacity-30" aria-label="위로">▴</button>
                    <button onClick={() => move(index, 1)} disabled={index === form.fields.length - 1} className="text-muted-foreground disabled:opacity-30" aria-label="아래로">▾</button>
                  </div>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-violet-500/10 text-violet-500">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <input
                    value={field.label}
                    onChange={(e) => updateField(field.id, { label: e.target.value })}
                    placeholder="항목 이름"
                    className={`${FIELD_CLS} h-8 w-40`}
                  />
                  <input
                    value={field.key}
                    onChange={(e) => updateField(field.id, { key: e.target.value })}
                    placeholder="key"
                    disabled={field.system}
                    className={`${FIELD_CLS} h-8 w-28 font-mono text-xs disabled:opacity-60`}
                    title={field.system ? "기본 항목의 키는 바꿀 수 없어요" : "저장 데이터의 키"}
                  />
                  <select
                    value={field.type}
                    onChange={(e) => updateField(field.id, { type: e.target.value as CompetitionFieldType })}
                    disabled={field.system}
                    className={`${FIELD_CLS} h-8 w-28 disabled:opacity-60`}
                  >
                    {TYPE_ORDER.map((t) => (
                      <option key={t} value={t}>{TYPE_META[t].label}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) => updateField(field.id, { required: e.target.checked })}
                    />
                    필수
                  </label>
                  <Switch checked={field.enabled} onChange={(v) => updateField(field.id, { enabled: v })} label="항목 사용" />
                  {!field.system && (
                    <button
                      onClick={() => update({ fields: form.fields.filter((f) => f.id !== field.id) })}
                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                      aria-label="항목 삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {CHOICE_TYPES.includes(field.type) && (
                  <div className="mt-2 space-y-1.5 pl-9">
                    {field.options.map((option, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <input
                          value={option}
                          onChange={(e) => {
                            const options = [...field.options];
                            options[i] = e.target.value;
                            updateField(field.id, { options });
                          }}
                          className={`${FIELD_CLS} h-8`}
                        />
                        <button
                          onClick={() => updateField(field.id, { options: field.options.filter((_, idx) => idx !== i) })}
                          className="rounded p-1 text-muted-foreground hover:text-red-500"
                          aria-label="선택지 삭제"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => updateField(field.id, { options: [...field.options, ""] })}
                      className={`flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground ${R.control}`}
                    >
                      <ListPlus className="h-3 w-3" /> 선택지 추가
                    </button>
                  </div>
                )}

                {field.type === "image" && (
                  <div className="mt-2 flex items-center gap-2 pl-9 text-[11px] text-muted-foreground">
                    <span>최대 장수</span>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={field.maxFiles ?? 3}
                      onChange={(e) => updateField(field.id, { maxFiles: Math.max(1, Number(e.target.value) || 1) })}
                      className={`${FIELD_CLS} h-8 w-16`}
                    />
                    <span>· 장당 4MB 이하 (요청 본문 상한 때문에 1장씩 올라가요)</span>
                  </div>
                )}
                {field.type === "youtube" && (
                  <p className="mt-2 pl-9 text-[11px] text-muted-foreground">
                    제출 시 링크에서 영상 ID만 저장해요. 비공개 영상은 재생되지 않아 신청자에게 안내가 나갑니다.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={addField}
          className={`mt-3 flex items-center gap-1 bg-secondary px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground ${R.control}`}
        >
          <Plus className="h-3 w-3" /> 항목 추가
        </button>
      </section>

      <section className={`bg-background p-5 ${R.panel} ${FINISH.s1}`}>
        <h2 className="text-sm font-semibold">동의</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          기본 체크는 꺼 두는 것을 권해요 — EU·한국에서는 사전 체크를 유효한 동의로 보지 않습니다.
        </p>
        <div className="mt-4 space-y-4">
          {(["privacy", "marketing", "thirdParty"] as const).map((kind) => {
            const textKey = kind === "privacy" ? "privacyText" : kind === "marketing" ? "marketingText" : "thirdPartyText";
            const bodyKey = kind === "privacy" ? "privacyBody" : kind === "marketing" ? "marketingBody" : "thirdPartyBody";
            const checkedKey = kind === "privacy" ? "privacyDefaultChecked" : kind === "marketing" ? "marketingDefaultChecked" : "thirdPartyDefaultChecked";
            const meta = CONSENT_KIND_META[kind];
            // privacy·marketing 은 항상 폼에 뜬다(끌 수 없다). 제3자 제공만 대회마다 있고 없고가
            // 갈려서 사용 스위치가 따로 있다 — 모든 대회가 협찬사와 정보를 나누는 게 아니다.
            if (kind === "thirdParty" && !form.thirdPartyEnabled) {
              return (
                <div key={kind} className="flex items-center justify-between gap-2 rounded-lg bg-secondary/30 p-2">
                  <span className="text-xs font-medium text-muted-foreground">{meta.label} — 사용 안 함</span>
                  <Switch checked={form.thirdPartyEnabled} onChange={(v) => update({ thirdPartyEnabled: v })} label="제3자 제공 동의 사용" />
                </div>
              );
            }
            return (
              <div key={kind} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">{meta.label}</span>
                  <div className="flex items-center gap-3">
                    {kind === "thirdParty" && (
                      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        사용
                        <Switch checked={form.thirdPartyEnabled} onChange={(v) => update({ thirdPartyEnabled: v })} label="제3자 제공 동의 사용" />
                      </label>
                    )}
                    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      기본 체크
                      <Switch checked={form[checkedKey]} onChange={(v) => update({ [checkedKey]: v } as Partial<typeof form>)} label="기본 체크" />
                    </label>
                  </div>
                </div>
                <input
                  value={form[textKey]}
                  onChange={(e) => update({ [textKey]: e.target.value } as Partial<typeof form>)}
                  className={FIELD_CLS}
                />
                <ConsentBodyField
                  value={form[bodyKey]}
                  org={org}
                  locale={legalLocale}
                  onSave={(next) => update({ [bodyKey]: next } as Partial<typeof form>)}
                  placeholder="약관 전문 (입력하면 문구를 눌러 팝업으로 볼 수 있어요)"
                  ariaLabel={`${kind} 전문`}
                  rows={3}
                  className={`${FIELD_CLS} h-auto resize-y py-2`}
                />
              </div>
            );
          })}
        </div>
      </section>

      <CompetitionLegalGenerator
        form={form}
        legal={legal}
        onFormChange={(next) => update(next)}
        onLegalChange={(next) => setLegal((prev) => ({ ...prev, ...next }))}
        workspaceId={workspaceId}
      />

      <div className="flex justify-end">
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={save}
          disabled={saving}
          className={`bg-violet-500 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-violet-600 disabled:opacity-50 ${R.control}`}
        >
          {saving ? "저장 중..." : "저장"}
        </motion.button>
      </div>
      </div>

      {/* 편집 중인 값(form)을 그대로 넘긴다 — 저장 전에도 바뀌는 게 보여야 미리보기다. */}
      <div className="xl:sticky xl:top-6 xl:self-start">
        <FormPreview config={{ ...competition.config, form, language, legal }} theme={competition.theme} />
      </div>
    </div>
  );
}
