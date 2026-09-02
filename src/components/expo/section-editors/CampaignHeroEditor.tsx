"use client";

import { Field, FieldSelect } from "@/components/ui/primitives";
import { ExpoMediaUploadField } from "@/components/expo/fields/ExpoMediaUploadField";
import { InlineEditableTable } from "@/components/expo/fields/InlineEditableTable";
import { AddButton, CtaRows, LocalizedField, TextField, Toggle, fieldIssues, localizedText, writeLocalized } from "@/components/expo/section-editors/shared";
import type { CampaignHeroContent, ExpoVideoValue } from "@/lib/expo/sections/types";
import type { SectionEditorProps } from "@/lib/expo/types";

export function CampaignHeroEditor(props: SectionEditorProps) {
  const content = props.section.content as unknown as Partial<CampaignHeroContent>;
  const lines = Array.isArray(content.typingLines) ? content.typingLines : [];
  const video = content.video?.kind === "video" ? content.video : undefined;
  const patch = (next: Partial<CampaignHeroContent>) => props.canEdit && props.onChange({ ...props.section, content: { ...props.section.content, ...next } });
  const lineRows = lines.map((value, index) => ({ id: `typing-line-${index}`, value }));
  return (
    <div data-testid="campaign-hero-editor" className="min-w-0 space-y-3">
      <LocalizedField label="히어로 윗줄" value={content.eyebrow} locale={props.locale} disabled={!props.canEdit} onChange={(eyebrow) => patch({ eyebrow })} />
      <InlineEditableTable
        ariaLabel="히어로 타이핑 문구"
        rows={lineRows}
        disabled={!props.canEdit}
        issues={fieldIssues(props.issues, "typingLines")}
        onChange={(rows) => patch({ typingLines: rows.map((row) => row.value), accessibleHeadline: rows[0]?.value ?? {} })}
        renderRow={(row, index) => <Field aria-label={`${index + 1}번 타이핑 문구`} value={localizedText(row.value, props.locale)} disabled={!props.canEdit} onChange={(event) => {
          const next = [...lines];
          next[index] = writeLocalized(row.value, props.locale, event.target.value);
          patch({ typingLines: next, accessibleHeadline: next[0] ?? {} });
        }} />}
      />
      <AddButton label="타이핑 문구 추가" disabled={!props.canEdit} onClick={() => patch({ typingLines: [...lines, { [props.locale]: "새 문구" }] })} />
      <LocalizedField label="접근 가능한 헤드라인" value={content.accessibleHeadline} locale={props.locale} disabled={!props.canEdit} onChange={(accessibleHeadline) => patch({ accessibleHeadline })} />
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Hero 영상</p>
        <ExpoMediaUploadField
          siteId={props.siteId}
          kind="video"
          value={video}
          disabled={!props.canEdit}
          fieldPath="video.url"
          issues={props.issues.filter((issue) => issue.path === "video" || issue.path.startsWith("video."))}
          onChange={(next) => patch({ video: next?.kind === "video" ? next : undefined })}
        />
        <label className="block text-[11px] text-muted-foreground">
          영상 사용 권리
          <FieldSelect
            aria-label="Hero 영상 사용 권리"
            value={video?.rightsStatus ?? "unconfirmed"}
            disabled={!props.canEdit || !video}
            onChange={(event) => video && patch({ video: { ...video, rightsStatus: event.target.value as ExpoVideoValue["rightsStatus"] } })}
          >
            <option value="unconfirmed">아직 확인하지 않음</option><option value="confirmed">사용 권리 확인함</option>
          </FieldSelect>
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <TextField label="영상 어둡기" value={content.overlay ?? 0.45} type="number" disabled={!props.canEdit} onChange={(overlay) => patch({ overlay: Number(overlay) })} />
        <TextField label="타이핑 속도(ms)" value={content.typing?.speedMs ?? 70} type="number" disabled={!props.canEdit} onChange={(speedMs) => patch({ typing: { enabled: content.typing?.enabled !== false, speedMs: Number(speedMs), holdMs: content.typing?.holdMs ?? 2000 } })} />
        <TextField label="문구 유지(ms)" value={content.typing?.holdMs ?? 2000} type="number" disabled={!props.canEdit} onChange={(holdMs) => patch({ typing: { enabled: content.typing?.enabled !== false, speedMs: content.typing?.speedMs ?? 70, holdMs: Number(holdMs) } })} />
      </div>
      <Toggle label="타이핑 효과" checked={content.typing?.enabled !== false} disabled={!props.canEdit} onChange={(enabled) => patch({ typing: { enabled, speedMs: content.typing?.speedMs ?? 70, holdMs: content.typing?.holdMs ?? 2000 } })} />
      <CtaRows props={props} value={content.ctas ?? []} onChange={(ctas) => patch({ ctas })} />
    </div>
  );
}

CampaignHeroEditor.displayName = "CampaignHeroEditor";
