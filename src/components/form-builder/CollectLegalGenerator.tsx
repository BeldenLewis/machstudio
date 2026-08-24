"use client";

/**
 * 법률 문구 생성기 — 나라·행사 빈칸만 채우면 개인정보처리방침·마케팅 동의·제3자 제공 동의를
 * 한 번에 만들어 위 '동의' 섹션의 기존 칸에 채워 넣는다.
 *
 * 실시간 자동 반영이 아니다 — 사용자가 확인한 대로, "생성" 을 눌러야 반영되고 그 다음은
 * 손으로 자유롭게 고칠 수 있다. 기존 값이 있으면 덮어쓰기 전에 확인한다(손질을 말없이 날리지 않는다).
 *
 * 조직 정보(회사명·주소·담당 이메일)는 워크스페이스 자산이라 여기서 직접 입력받지 않고
 * `/api/workspace/{id}` 에서 읽어온다 — 행사마다 다시 타이핑하지 않게 하는 게 이 기능의
 * 핵심 목적이라(§legal-templates), 그 값 자체는 워크스페이스 설정(약관 탭)에서 관리한다.
 */
import { useMemo } from "react";
import { AlertTriangle, Sparkles } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { FIELD_CLS, FINISH, R } from "@/components/ui/primitives";
import { ThirdPartiesEditor, useWorkspaceLegalProfile } from "@/components/legal/legal-generator-shared";
import {
  DEFAULT_LOCALE,
  localize,
  toLocalized,
  type CollectFormConfig,
} from "@/lib/collect-form-config";
import {
  LEGAL_COUNTRIES,
  generateConsentDocuments,
  inferDataCategories,
  resolveOrgProfile,
  resolveOrgTokens,
  type OrgProfile,
} from "@/lib/legal-templates";

type Patch = (next: Partial<CollectFormConfig>) => void;

export function CollectLegalGenerator({
  config, patch, workspaceId,
}: { config: CollectFormConfig; patch: Patch; workspaceId: string | undefined }) {
  const confirm = useConfirm();
  const legal = config.legal;

  const { profile: orgProfile, loaded: orgLoaded } = useWorkspaceLegalProfile(workspaceId);
  const org: OrgProfile = useMemo(() => resolveOrgProfile(orgProfile, legal.country), [orgProfile, legal.country]);

  const setLegal = (next: Partial<typeof legal>) => patch({ legal: { ...legal, ...next } });

  const collectedCategories = useMemo(
    () =>
      inferDataCategories(
        config.fields.filter((f) => f.enabled).map((f) => ({ key: f.key, type: f.type, label: localize(f.label, DEFAULT_LOCALE) })),
      ),
    [config.fields],
  );

  const purpose = "pre-registration" as const;

  const preview = useMemo(
    () =>
      generateConsentDocuments({
        country: legal.country,
        purpose,
        org,
        event: {
          eventName: legal.eventName || "[행사명 미입력]",
          eventDates: config.eventInfo.eventDates,
          venue: localize(config.eventInfo.venue, DEFAULT_LOCALE),
          contactEmail: org.privacyContactEmail,
          onSitePhotography: legal.onSitePhotography,
          thirdParties: legal.thirdParties,
          dataRetentionNote: legal.dataRetentionNote,
          effectiveDate: legal.effectiveDate,
          adultsOnly: legal.adultsOnly,
        },
        collectedCategories,
        marketingOffered: config.consent.marketing.enabled,
      }),
    [legal, org, config.eventInfo, config.consent.marketing.enabled, collectedCategories],
  );

  /**
   * 조직명·주소·이메일은 본문에 토큰({{ORG_ADDRESS}} 등)으로 저장된다(§legal-templates/tokens) —
   * 워크스페이스 값이 나중에 바뀌어도 이 문서를 다시 생성할 필요가 없게 하기 위해서다. 다만
   * 미리보기는 사람이 읽는 화면이라 여기서만 지금 값으로 풀어서 보여 준다.
   */
  const resolvedPreviewBody = useMemo(
    () => resolveOrgTokens(preview.privacy.body, org, legal.country === "kr" ? "ko" : "en"),
    [preview.privacy.body, org, legal.country],
  );

  const hasExistingText =
    localize(config.consent.privacy.body, DEFAULT_LOCALE).trim() !== "" ||
    localize(config.consent.marketing.body, DEFAULT_LOCALE).trim() !== "" ||
    localize(config.consent.thirdParty.body, DEFAULT_LOCALE).trim() !== "";

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

    patch({
      consent: {
        privacy: { ...config.consent.privacy, label: toLocalized(preview.privacy.label), body: toLocalized(preview.privacy.body) },
        marketing: preview.marketing
          ? { ...config.consent.marketing, label: toLocalized(preview.marketing.label), body: toLocalized(preview.marketing.body) }
          : config.consent.marketing,
        thirdParty: preview.thirdParty
          ? { ...config.consent.thirdParty, label: toLocalized(preview.thirdParty.label), body: toLocalized(preview.thirdParty.body) }
          : config.consent.thirdParty,
      },
    });
  };

  return (
    <section className={`${R.surface} bg-background p-4 ${FINISH.s2} space-y-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">법률 문구 생성기</h3>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            나라·행사 빈칸만 채우면 위 동의 전문을 자동으로 채워요. 이후 자유롭게 고칠 수 있어요.
          </p>
        </div>
      </div>

      {orgLoaded && !org.legalName.trim() && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-600">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          워크스페이스에 회사 정보가 아직 없어요 — 워크스페이스 설정 › 약관 탭에서 한 번만 입력하면 모든 행사가 재사용해요.
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">나라</span>
          <select
            value={legal.country}
            onChange={(e) => setLegal({ country: e.target.value as typeof legal.country })}
            className={FIELD_CLS}
          >
            {LEGAL_COUNTRIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">행사명</span>
          <input
            value={legal.eventName}
            onChange={(e) => setLegal({ eventName: e.target.value })}
            placeholder="Korea Expo LA 2026"
            className={FIELD_CLS}
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Switch checked={legal.onSitePhotography} onChange={(v) => setLegal({ onSitePhotography: v })} label="현장 촬영·녹화 있음" />
        행사장에서 사진·영상 촬영이 있어요
      </label>

      <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Switch checked={legal.adultsOnly} onChange={(v) => setLegal({ adultsOnly: v })} label="성인(만 19세 이상) 전용 행사" />
        성인 전용이에요 — 꺼두면(기본) 미성년자 참가를 전제로 법정대리인 동의 안내가 들어가요
      </label>

      <ThirdPartiesEditor items={legal.thirdParties} onChange={(next) => setLegal({ thirdParties: next })} />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">보유기간 (선택)</span>
          <input
            value={legal.dataRetentionNote}
            onChange={(e) => setLegal({ dataRetentionNote: e.target.value })}
            placeholder="비우면 나라별 기본 문구"
            className={FIELD_CLS}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">시행일 (선택)</span>
          <input
            type="date"
            value={legal.effectiveDate}
            onChange={(e) => setLegal({ effectiveDate: e.target.value })}
            className={FIELD_CLS}
          />
        </label>
      </div>

      <details className="rounded-lg bg-secondary/40 p-2">
        <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground">미리보기</summary>
        <div className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-background p-2 text-[11px] leading-relaxed shadow-sm">
          {resolvedPreviewBody}
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
        회사명·주소·담당 이메일은 워크스페이스 설정 값을 실시간으로 따라가요 — 나중에 그 값만 바뀌어도
        여기서 다시 생성할 필요 없이 자동으로 반영돼요.
      </p>
    </section>
  );
}
