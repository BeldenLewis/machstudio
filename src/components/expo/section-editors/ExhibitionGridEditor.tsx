"use client";

import { FieldSelect } from "@/components/ui/primitives";
import { ExpoMediaUploadField } from "@/components/expo/fields/ExpoMediaUploadField";
import { DestinationPicker } from "@/components/expo/fields/DestinationPicker";
import { InlineEditableTable } from "@/components/expo/fields/InlineEditableTable";
import { AddButton, LocalizedField, Toggle, fieldIssues, makeSemanticId } from "@/components/expo/section-editors/shared";
import { EXHIBITION_ACCENT_TOKENS, type ExhibitionGridContent, type ExhibitionItem } from "@/lib/expo/sections/types";
import type { SectionEditorProps } from "@/lib/expo/types";

export function ExhibitionGridEditor(props: SectionEditorProps) {
  const content = props.section.content as unknown as Partial<ExhibitionGridContent>;
  const items = Array.isArray(content.items) ? content.items : [];
  const patch = (next: Partial<ExhibitionGridContent>) => props.canEdit && props.onChange({ ...props.section, content: { ...props.section.content, ...next } });
  const patchRow = (index: number, next: Partial<ExhibitionItem>) => patch({ items: items.map((row, rowIndex) => rowIndex === index ? { ...row, ...next } : row) });
  return (
    <div data-testid="exhibition-grid-editor" className="min-w-0 space-y-3">
      <LocalizedField label="하위 전시 제목" value={content.heading} locale={props.locale} disabled={!props.canEdit} onChange={(heading) => patch({ heading })} />
      <InlineEditableTable
        ariaLabel="하위 전시"
        rows={items}
        disabled={!props.canEdit}
        issues={fieldIssues(props.issues, "items")}
        onChange={(rows) => patch({ items: rows.map((row, order) => ({ ...row, order })) })}
        renderRow={(row, index) => <div className="grid min-w-0 gap-2">
          <div className="grid min-w-0 gap-2 sm:grid-cols-2"><LocalizedField label={`${index + 1}번 하위 전시 이름`} value={row.title} locale={props.locale} disabled={!props.canEdit} onChange={(title) => patchRow(index, { title })} /><LocalizedField label={`${index + 1}번 하위 전시 설명`} value={row.description} locale={props.locale} disabled={!props.canEdit} onChange={(description) => patchRow(index, { description })} /></div>
          <ExpoMediaUploadField siteId={props.siteId} kind="image" label={`${index + 1}번 하위 전시 심볼`} fieldPath={`[${index}].symbol.url`} value={row.symbol} disabled={!props.canEdit} onChange={(next) => patchRow(index, { symbol: next?.kind === "image" ? next : undefined })} />
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-[11px] text-muted-foreground">강조색<FieldSelect aria-label={`${index + 1}번 하위 전시 강조색`} value={row.accentToken} disabled={!props.canEdit} onChange={(event) => patchRow(index, { accentToken: event.target.value })}>{EXHIBITION_ACCENT_TOKENS.map((token) => <option key={token} value={token}>{token}</option>)}</FieldSelect></label>
            <DestinationPicker label={`${index + 1}번 하위 전시 목적지`} destinations={props.config.settings?.destinations ?? []} value={row.destinationId} disabled={!props.canEdit} onChange={(destinationId) => patchRow(index, { destinationId })} />
          </div>
          <Toggle label={`${index + 1}번 하위 전시 공개`} checked={row.enabled} disabled={!props.canEdit} onChange={(enabled) => patchRow(index, { enabled })} />
        </div>}
      />
      <AddButton label="하위 전시 추가" disabled={!props.canEdit} onClick={() => patch({ items: [...items, { id: makeSemanticId("exhibition", items), title: { [props.locale]: "새 하위 전시" }, accentToken: "orange", destinationId: "", order: items.length, enabled: false }] })} />
    </div>
  );
}

ExhibitionGridEditor.displayName = "ExhibitionGridEditor";
