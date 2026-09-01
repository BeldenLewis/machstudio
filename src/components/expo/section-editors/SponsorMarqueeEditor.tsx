"use client";

import { ExpoMediaUploadField } from "@/components/expo/fields/ExpoMediaUploadField";
import { InlineEditableTable } from "@/components/expo/fields/InlineEditableTable";
import { FieldSelect } from "@/components/ui/primitives";
import { AddButton, LocalizedField, TextField, Toggle, fieldIssues, makeSemanticId } from "@/components/expo/section-editors/shared";
import type { Sponsor, SponsorGroup, SponsorMarqueeContent } from "@/lib/expo/sections/types";
import type { SectionEditorProps } from "@/lib/expo/types";

export function SponsorMarqueeEditor(props: SectionEditorProps) {
  const content = props.section.content as unknown as Partial<SponsorMarqueeContent>;
  const groups = Array.isArray(content.groups) ? content.groups : [];
  const sponsors = Array.isArray(content.sponsors) ? content.sponsors : [];
  const patch = (next: Partial<SponsorMarqueeContent>) => props.canEdit && props.onChange({ ...props.section, content: { ...props.section.content, ...next } });
  const patchGroup = (index: number, next: Partial<SponsorGroup>) => patch({ groups: groups.map((row, rowIndex) => rowIndex === index ? { ...row, ...next } : row) });
  const patchSponsor = (index: number, next: Partial<Sponsor>) => patch({ sponsors: sponsors.map((row, rowIndex) => rowIndex === index ? { ...row, ...next } : row) });
  return (
    <div data-testid="sponsor-marquee-editor" className="min-w-0 space-y-3">
      <LocalizedField label="후원사 섹션 제목" value={content.heading} locale={props.locale} disabled={!props.canEdit} onChange={(heading) => patch({ heading })} />
      <InlineEditableTable
        ariaLabel="후원사 그룹"
        rows={groups}
        disabled={!props.canEdit}
        issues={fieldIssues(props.issues, "groups")}
        canDelete={(group) => sponsors.some((sponsor) => sponsor.groupId === group.id) ? "이 그룹을 참조하는 후원사가 있어요" : true}
        onChange={(rows) => patch({ groups: rows.map((row, order) => ({ ...row, order })) })}
        renderRow={(row, index) => <div className="grid gap-2 sm:grid-cols-3">
          <LocalizedField label={`${index + 1}번 후원사 그룹 이름`} value={row.title} locale={props.locale} disabled={!props.canEdit} onChange={(title) => patchGroup(index, { title })} />
          <TextField label={`${index + 1}번 후원사 흐름 시간`} value={row.durationSeconds} type="number" disabled={!props.canEdit} onChange={(durationSeconds) => patchGroup(index, { durationSeconds: Number(durationSeconds) })} />
          <Toggle label={`${index + 1}번 후원사 흐르기`} checked={row.marquee} disabled={!props.canEdit} onChange={(marquee) => patchGroup(index, { marquee })} />
        </div>}
      />
      <AddButton label="후원사 그룹 추가" disabled={!props.canEdit} onClick={() => patch({ groups: [...groups, { id: makeSemanticId("sponsor-group", groups), title: { [props.locale]: "새 그룹" }, marquee: false, durationSeconds: 30, order: groups.length }] })} />
      <InlineEditableTable
        ariaLabel="후원사"
        rows={sponsors}
        disabled={!props.canEdit}
        issues={fieldIssues(props.issues, "sponsors")}
        onChange={(rows) => patch({ sponsors: rows.map((row, order) => ({ ...row, order })) })}
        renderRow={(row, index) => <div className="grid min-w-0 gap-2">
          <div className="grid gap-2 sm:grid-cols-2"><TextField label={`${index + 1}번 후원사 이름`} value={row.name} disabled={!props.canEdit} onChange={(name) => patchSponsor(index, { name })} /><TextField label={`${index + 1}번 후원사 홈페이지`} value={row.homepageUrl ?? ""} type="url" disabled={!props.canEdit} onChange={(homepageUrl) => patchSponsor(index, { homepageUrl: homepageUrl || undefined })} /></div>
          <ExpoMediaUploadField siteId={props.siteId} kind="image" label={`${index + 1}번 후원사 로고`} value={row.logo} disabled={!props.canEdit} onChange={(next) => patchSponsor(index, { logo: next?.kind === "image" ? next : undefined })} />
          <label className="text-[11px] text-muted-foreground">후원사 그룹<FieldSelect aria-label={`${index + 1}번 후원사 그룹`} value={row.groupId} disabled={!props.canEdit} onChange={(event) => patchSponsor(index, { groupId: event.target.value })}><option value="">선택</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.id}</option>)}</FieldSelect></label>
          <Toggle label={`${index + 1}번 후원사 공개`} checked={row.enabled} disabled={!props.canEdit} onChange={(enabled) => patchSponsor(index, { enabled })} />
        </div>}
      />
      <AddButton label="후원사 추가" disabled={!props.canEdit} onClick={() => patch({ sponsors: [...sponsors, { id: makeSemanticId("sponsor", sponsors), name: "새 후원사", groupId: groups[0]?.id ?? "", order: sponsors.length, enabled: false }] })} />
    </div>
  );
}

SponsorMarqueeEditor.displayName = "SponsorMarqueeEditor";
