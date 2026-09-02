"use client";

import { Field, FieldSelect, FINISH, R } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/switch";
import { CampaignPicker } from "@/components/expo/fields/CampaignPicker";
import { DestinationPicker } from "@/components/expo/fields/DestinationPicker";
import { InlineEditableTable } from "@/components/expo/fields/InlineEditableTable";
import type { Localized } from "@/lib/collect-form-config";
import type { CtaPlacement } from "@/lib/expo/sections/types";
import type { DestinationAction, FieldIssue, SectionEditorProps } from "@/lib/expo/types";

export function localizedText(value: unknown, locale: string): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const map = value as Record<string, unknown>;
  const candidate = [locale, "ko", "en", ...Object.keys(map)].find((key) => typeof map[key] === "string");
  return candidate ? String(map[candidate]) : "";
}

export function writeLocalized(value: unknown, locale: string, text: string): Localized {
  const map = value && typeof value === "object" && !Array.isArray(value) ? value as Localized : {};
  return { ...map, [locale]: text };
}

export function LocalizedField({ label, value, locale, disabled, multiline, onChange }: {
  label: string; value: unknown; locale: string; disabled?: boolean; multiline?: boolean; onChange(value: Localized): void;
}) {
  const common = { "aria-label": label, value: localizedText(value, locale), disabled, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(writeLocalized(value, locale, event.target.value)) };
  return (
    <label className="block min-w-0 text-[11px] text-muted-foreground">
      {label}
      {multiline
        ? <textarea {...common} rows={3} className="mt-0.5 w-full min-w-0 rounded-md bg-background px-2 py-1.5 text-xs text-foreground disabled:opacity-60" />
        : <Field {...common} />}
    </label>
  );
}

export function TextField({ label, value, disabled, type = "text", onChange }: {
  label: string; value: string | number; disabled?: boolean; type?: "text" | "url" | "number"; onChange(value: string): void;
}) {
  return <label className="block min-w-0 text-[11px] text-muted-foreground">{label}<Field type={type} aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>;
}

export function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange(value: boolean): void }) {
  return <label className="flex min-h-9 items-center gap-2 text-xs"><Switch label={label} checked={checked} disabled={disabled} onChange={onChange} />{label}</label>;
}

export function AddButton({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick(): void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={`min-h-9 px-3 text-xs ${R.control} ${FINISH.control} bg-secondary disabled:opacity-50`}>{label}</button>;
}

export function fieldIssues(issues: readonly FieldIssue[], prefix: string): FieldIssue[] {
  return issues
    .filter((issue) => issue.path === prefix || issue.path.startsWith(`${prefix}.`) || issue.path.startsWith(`${prefix}[`))
    .map((issue) => ({ ...issue, path: issue.path.slice(prefix.length) || "" }));
}

export function makeSemanticId(prefix: string, existing: readonly { id: string }[]): string {
  let serial = existing.length + 1;
  while (existing.some((row) => row.id === `${prefix}-${serial}`)) serial += 1;
  return `${prefix}-${serial}`;
}

export function actionSummary(action: DestinationAction | undefined): string {
  if (!action) return "목적지 없음";
  if (action.type === "anchor") return `앵커 #${action.target || "미지정"}`;
  if (action.type === "imweb-modal") return `아임웹 모달 ${action.modalId || "미지정"}${action.fallbackHref ? ` → ${action.fallbackHref}` : ""}`;
  if (action.type === "download") return `다운로드 ${action.href || "미지정"}`;
  return `${action.newTab ? "새 탭 " : ""}주소 ${action.href || "미지정"}`;
}

export function CtaRows({ props, value, path = "ctas", onChange }: {
  props: SectionEditorProps; value: readonly CtaPlacement[]; path?: string; onChange(rows: CtaPlacement[]): void;
}) {
  const campaigns = props.config.settings?.campaigns ?? [];
  const destinations = props.config.settings?.destinations ?? [];
  const patch = (index: number, next: Partial<CtaPlacement>) => onChange(value.map((row, rowIndex) => rowIndex === index ? { ...row, ...next } : row));
  return (
    <div className="min-w-0 space-y-2">
      <InlineEditableTable
        ariaLabel="CTA"
        rows={value}
        disabled={!props.canEdit}
        issues={fieldIssues(props.issues, path)}
        onChange={onChange}
        renderRow={(row, index) => {
          const destination = destinations.find((item) => item.id === row.destinationId);
          return (
            <div className="grid min-w-0 gap-2">
              <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                <LocalizedField label={`${index + 1}번 CTA 문구`} value={row.label} locale={props.locale} disabled={!props.canEdit} onChange={(label) => patch(index, { label })} />
                <DestinationPicker label={`${index + 1}번 CTA 목적지`} destinations={destinations} value={row.destinationId} disabled={!props.canEdit} onChange={(destinationId) => patch(index, { destinationId })} />
              </div>
              <LocalizedField label={`${index + 1}번 CTA 설명`} value={row.description} locale={props.locale} disabled={!props.canEdit} multiline onChange={(description) => patch(index, { description })} />
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="text-[11px] text-muted-foreground">버튼 모양<FieldSelect aria-label={`${index + 1}번 CTA 모양`} value={row.variant} disabled={!props.canEdit} onChange={(event) => patch(index, { variant: event.target.value as CtaPlacement["variant"] })}><option value="primary">주요</option><option value="secondary">보조</option><option value="outline">윤곽</option><option value="solid">채움</option></FieldSelect></label>
                <label className="text-[11px] text-muted-foreground">대상<FieldSelect aria-label={`${index + 1}번 CTA 대상`} value={row.audience} disabled={!props.canEdit} onChange={(event) => patch(index, { audience: event.target.value as CtaPlacement["audience"] })}><option value="all">모두</option><option value="exhibitor">참가기업</option><option value="visitor">참관객</option></FieldSelect></label>
                <TextField label={`${index + 1}번 CTA 우선순위`} value={row.priority} type="number" disabled={!props.canEdit} onChange={(priority) => patch(index, { priority: Number(priority) })} />
              </div>
              <CampaignPicker label={`${index + 1}번 CTA 캠페인 조건`} campaigns={campaigns} value={row.campaignIds} disabled={!props.canEdit} onChange={(campaignIds) => patch(index, { campaignIds })} />
              <div className="flex flex-wrap gap-3"><Toggle label={`${index + 1}번 CTA 대체 버튼`} checked={row.fallback} disabled={!props.canEdit} onChange={(fallback) => patch(index, { fallback })} /><Toggle label={`${index + 1}번 CTA 공개`} checked={row.enabled} disabled={!props.canEdit} onChange={(enabled) => patch(index, { enabled })} /></div>
              <p className={`${R.surface} ${FINISH.s2} bg-secondary px-2 py-1.5 text-[11px] text-muted-foreground`} aria-label={`${index + 1}번 CTA 해석 요약`}>
                {actionSummary(destination?.action)} · 우선순위 {row.priority} · {row.fallback ? "대체 버튼" : "조건 버튼"} · 대상 {row.audience} · 캠페인 {row.campaignIds.length ? row.campaignIds.join(", ") : "조건 없음"}
              </p>
            </div>
          );
        }}
      />
      <AddButton label="CTA 추가" disabled={!props.canEdit} onClick={() => onChange([...value, {
        id: makeSemanticId("cta", value), label: { [props.locale]: "새 CTA" }, destinationId: "", variant: "primary",
        audience: "all", campaignIds: [], priority: value.length, fallback: value.length === 0, enabled: false,
      }])} />
    </div>
  );
}
