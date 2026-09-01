"use client";

import { FieldSelect, FINISH, R } from "@/components/ui/primitives";
import { ExpoMediaUploadField } from "@/components/expo/fields/ExpoMediaUploadField";
import { CampaignPicker } from "@/components/expo/fields/CampaignPicker";
import { DestinationPicker } from "@/components/expo/fields/DestinationPicker";
import { InlineEditableTable } from "@/components/expo/fields/InlineEditableTable";
import { AddButton, LocalizedField, Toggle, fieldIssues, makeSemanticId } from "@/components/expo/section-editors/shared";
import type { AudienceGroup, AudienceLink, AudienceLinksContent } from "@/lib/expo/sections/types";
import type { SectionEditorProps } from "@/lib/expo/types";

export function AudienceLinksEditor(props: SectionEditorProps) {
  const content = props.section.content as unknown as Partial<AudienceLinksContent>;
  const groups = Array.isArray(content.groups) ? content.groups : [];
  const patch = (nextGroups: AudienceGroup[]) => props.canEdit && props.onChange({ ...props.section, content: { ...props.section.content, groups: nextGroups } });
  const patchGroup = (index: number, next: Partial<AudienceGroup>) => patch(groups.map((group, groupIndex) => groupIndex === index ? { ...group, ...next } : group));
  return (
    <div data-testid="audience-links-editor" className="min-w-0 space-y-3">
      {groups.map((group, groupIndex) => {
        const items = Array.isArray(group.items) ? group.items : [];
        const patchRow = (index: number, next: Partial<AudienceLink>) => patchGroup(groupIndex, { items: items.map((row, rowIndex) => rowIndex === index ? { ...row, ...next } : row) });
        return (
          <fieldset key={group.audience} disabled={!props.canEdit} className={`${R.surface} ${FINISH.s2} min-w-0 space-y-2 bg-secondary/40 p-3`}>
            <legend className="px-1 text-xs font-semibold">{group.audience === "exhibitor" ? "참가기업" : "참관객"}</legend>
            <div className="grid gap-2 sm:grid-cols-2"><LocalizedField label={`${group.audience} 그룹 제목`} value={group.title} locale={props.locale} disabled={!props.canEdit} onChange={(title) => patchGroup(groupIndex, { title })} /><LocalizedField label={`${group.audience} 그룹 설명`} value={group.description} locale={props.locale} disabled={!props.canEdit} onChange={(description) => patchGroup(groupIndex, { description })} /></div>
            <label className="text-[11px] text-muted-foreground">그룹 배경<FieldSelect aria-label={`${group.audience} 그룹 배경`} value={group.variant} disabled={!props.canEdit} onChange={(event) => patchGroup(groupIndex, { variant: event.target.value as AudienceGroup["variant"] })}><option value="light">밝게</option><option value="dark">어둡게</option></FieldSelect></label>
            <InlineEditableTable
              ariaLabel={`${group.audience} 링크`}
              rows={items}
              disabled={!props.canEdit}
              issues={fieldIssues(props.issues, `groups[${groupIndex}].items`)}
              onChange={(rows) => patchGroup(groupIndex, { items: rows.map((row, order) => ({ ...row, order })) })}
              renderRow={(row, index) => <div className="grid min-w-0 gap-2">
                <LocalizedField label={`${index + 1}번 링크 문구`} value={row.label} locale={props.locale} disabled={!props.canEdit} onChange={(label) => patchRow(index, { label })} />
                <ExpoMediaUploadField siteId={props.siteId} kind="image" label={`${index + 1}번 링크 아이콘`} fieldPath={`groups[${groupIndex}].items[${index}].icon.url`} value={row.icon} disabled={!props.canEdit} onChange={(next) => patchRow(index, { icon: next?.kind === "image" ? next : undefined })} />
                <DestinationPicker label={`${index + 1}번 링크 목적지`} destinations={props.config.settings?.destinations ?? []} value={row.destinationId} disabled={!props.canEdit} onChange={(destinationId) => patchRow(index, { destinationId })} />
                <CampaignPicker label={`${index + 1}번 링크 캠페인`} campaigns={props.config.settings?.campaigns ?? []} value={row.campaignIds} disabled={!props.canEdit} onChange={(campaignIds) => patchRow(index, { campaignIds })} />
                <Toggle label={`${index + 1}번 링크 공개`} checked={row.enabled} disabled={!props.canEdit} onChange={(enabled) => patchRow(index, { enabled })} />
              </div>}
            />
            <AddButton label={`${group.audience === "exhibitor" ? "참가기업" : "참관객"} 링크 추가`} disabled={!props.canEdit} onClick={() => patchGroup(groupIndex, { items: [...items, { id: makeSemanticId(`${group.audience}-link`, items), label: { [props.locale]: "새 링크" }, destinationId: "", campaignIds: [], order: items.length, enabled: false }] })} />
          </fieldset>
        );
      })}
      {groups.length < 2 ? <AddButton label="기본 대상 그룹 복원" disabled={!props.canEdit} onClick={() => patch([
        groups.find((group) => group.audience === "exhibitor") ?? { audience: "exhibitor", title: { [props.locale]: "참가기업" }, variant: "light", items: [] },
        groups.find((group) => group.audience === "visitor") ?? { audience: "visitor", title: { [props.locale]: "참관객" }, variant: "dark", items: [] },
      ])} /> : null}
    </div>
  );
}

AudienceLinksEditor.displayName = "AudienceLinksEditor";
