"use client";

/**
 * 법률 문구 생성기 — 사전등록 쪽(CollectLegalGenerator)과 같은 개념이지만 Competition 은
 * ① 문구가 Localized 가 아니라 평문 하나(대회 전체가 한 언어)이고 ② 구조화된 개최일·장소
 * 필드가 없어(공고 블록은 자유 서술) eventName·eventDates·venue 를 여기서 따로 받는다.
 */
import { useMemo } from "react";
import { AlertTriangle, Sparkles } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { FIELD_CLS, FINISH, R } from "@/components/ui/primitives";
import { ThirdPartiesEditor, useWorkspaceLegalProfile } from "@/components/legal/legal-generator-shared";
import type { CompetitionConfig } from "@/lib/competition-config";
import {
  LEGAL_COUNTRIES,
  generateConsentDocuments,
  inferDataCategories,
  resolveOrgProfile,
  type OrgProfile,
} from "@/lib/legal-templates";

type Form = CompetitionConfig["form"];
type Legal = CompetitionConfig["legal"];

export function CompetitionLegalGenerator({
  form,
  legal,
  onFormChange,
  onLegalChange,
  workspaceId,
}: {
  form: Form;
  legal: Legal;
  onFormChange: (next: Partial<Form>) => void;
  onLegalChange: (next: Partial<Legal>) => void;
  workspaceId: string | undefined;
}) {
  const confirm = useConfirm();

  const { profile: orgProfile, loaded: orgLoaded } = useWorkspaceLegalProfile(workspaceId);
  const org: OrgProfile = useMemo(() => resolveOrgProfile(orgProfile, legal.country), [orgProfile, legal.country]);

  const collectedCategories = useMemo(
    () => inferDataCategories(form.fields.filter((f) => f.enabled).map((f) => ({ key: f.key, type: f.type, label: f.label }))),
    [form.fields],
  );

  const preview = useMemo(
    () =>
      generateConsentDocuments({
        country: legal.country,
        purpose: "competition-entry",
        org,
        event: {
          eventName: legal.eventName || "[행사명 미입력]",
          eventDates: legal.eventDates,
          venue: legal.venue,
          contactEmail: org.privacyContactEmail,
          onSitePhotography: legal.onSitePhotography,
          thirdParties: legal.thirdParties,
          dataRetentionNote: legal.dataRetentionNote,
          effectiveDate: legal.effectiveDate,
        },
        collectedCategories,
        // 마케팅 체크박스는 privacy 와 같이 항상 렌더된다(대회 신청 폼에 사용 여부 스위치가 없다).
        marketingOffered: true,
      }),
    [legal, org, collectedCategories],
  );

  const hasExistingText = form.privacyBody.trim() !== "" || form.marketingBody.trim() !== "" || form.thirdPartyBody.trim() !== "";

  const handleGenerate = async () => {
    if (hasExistingText) {
      const ok = await confirm({
        title: "기존 약관 전문을 덮어쓸까요?",
        description: "동의 섹션에 이미 적혀 있는 전문이 생성된 문구로 교체돼요. 직접 고친 내용이 있다면 사라집니다.",
        confirmLabel: "덮어쓰고 생성",
        cancelLabel: "취소",
        tone: "danger",
      });
      if (!ok) return;
    }

    onFormChange({
      privacyText: preview.privacy.label,
      privacyBody: preview.privacy.body,
      ...(preview.marketing ? { marketingText: preview.marketing.label, marketingBody: preview.marketing.body } : {}),
      ...(preview.thirdParty
        ? { thirdPartyEnabled: true, thirdPartyText: preview.thirdParty.label, thirdPartyBody: preview.thirdParty.body }
        : { thirdPartyEnabled: false }),
    });
  };

  return (
    <section className={`bg-background p-5 ${R.panel} ${FINISH.s1} space-y-3`}>
      <div>
        <h3 className="text-sm font-semibold">법률 문구 생성기</h3>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          나라·행사 빈칸만 채우면 위 동의 전문을 자동으로 채워요. 이후 자유롭게 고칠 수 있어요.
        </p>
      </div>

      {orgLoaded && !org.legalName.trim() && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-600">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          워크스페이스에 회사 정보가 아직 없어요 — 워크스페이스 설정 › 약관 탭에서 한 번만 입력하면 모든 대회가 재사용해요.
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">나라</span>
          <select value={legal.country} onChange={(e) => onLegalChange({ country: e.target.value as Legal["country"] })} className={FIELD_CLS}>
            {LEGAL_COUNTRIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">대회명</span>
          <input
            value={legal.eventName}
            onChange={(e) => onLegalChange({ eventName: e.target.value })}
            placeholder="K-POP Dance Battle"
            className={FIELD_CLS}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">개최일</span>
          <input
            value={legal.eventDates.join(", ")}
            onChange={(e) => onLegalChange({ eventDates: e.target.value.split(",").map((d) => d.trim()).filter(Boolean) })}
            placeholder="2026-10-22, 2026-10-23"
            className={FIELD_CLS}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">장소</span>
          <input value={legal.venue} onChange={(e) => onLegalChange({ venue: e.target.value })} placeholder="Magic Box, Los Angeles" className={FIELD_CLS} />
        </label>
      </div>

      <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Switch checked={legal.onSitePhotography} onChange={(v) => onLegalChange({ onSitePhotography: v })} label="현장 촬영·녹화 있음" />
        행사장에서 사진·영상 촬영이 있어요
      </label>

      <ThirdPartiesEditor items={legal.thirdParties} onChange={(next) => onLegalChange({ thirdParties: next })} />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">보유기간 (선택)</span>
          <input
            value={legal.dataRetentionNote}
            onChange={(e) => onLegalChange({ dataRetentionNote: e.target.value })}
            placeholder="비우면 나라별 기본 문구"
            className={FIELD_CLS}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">시행일 (선택)</span>
          <input type="date" value={legal.effectiveDate} onChange={(e) => onLegalChange({ effectiveDate: e.target.value })} className={FIELD_CLS} />
        </label>
      </div>

      <details className="rounded-lg bg-secondary/40 p-2">
        <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground">미리보기</summary>
        <div className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-background p-2 text-[11px] leading-relaxed shadow-sm">
          {preview.privacy.body}
        </div>
      </details>

      <button
        type="button"
        onClick={handleGenerate}
        className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-[12px] font-semibold text-background shadow-sm transition hover:opacity-90"
      >
        <Sparkles className="h-3.5 w-3.5" />
        문서 생성
      </button>
      <p className="text-[11px] leading-snug text-muted-foreground/70">
        법률 자문을 대체하지 않아요 — 생성된 문구는 실제 배포 전에 법무 검토를 받으세요.
      </p>
    </section>
  );
}
