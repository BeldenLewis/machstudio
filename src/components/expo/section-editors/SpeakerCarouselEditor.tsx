"use client";

import { FieldSelect } from "@/components/ui/primitives";
import { ExpoMediaUploadField } from "@/components/expo/fields/ExpoMediaUploadField";
import { ImageCropField } from "@/components/expo/fields/ImageCropField";
import { InlineEditableTable } from "@/components/expo/fields/InlineEditableTable";
import { AddButton, LocalizedField, TextField, Toggle, fieldIssues, makeSemanticId } from "@/components/expo/section-editors/shared";
import { SPEAKER_TOKENS, type Speaker, type SpeakerCarouselContent, type SpeakerCategory } from "@/lib/expo/sections/types";
import type { SectionEditorProps } from "@/lib/expo/types";

const DEFAULT_CROP = { fit: "cover", x: 50, y: 50, scale: 1 } as const;

export function SpeakerCarouselEditor(props: SectionEditorProps) {
  const content = props.section.content as unknown as Partial<SpeakerCarouselContent>;
  const categories = Array.isArray(content.categories) ? content.categories : [];
  const speakers = Array.isArray(content.speakers) ? content.speakers : [];
  const patch = (next: Partial<SpeakerCarouselContent>) => props.canEdit && props.onChange({ ...props.section, content: { ...props.section.content, ...next } });
  const patchCategory = (index: number, next: Partial<SpeakerCategory>) => patch({ categories: categories.map((row, rowIndex) => rowIndex === index ? { ...row, ...next } : row) });
  const patchSpeaker = (index: number, next: Partial<Speaker>) => patch({ speakers: speakers.map((row, rowIndex) => rowIndex === index ? { ...row, ...next } : row) });
  return (
    <div data-testid="speaker-carousel-editor" className="min-w-0 space-y-3">
      <LocalizedField label="연사 섹션 제목" value={content.heading} locale={props.locale} disabled={!props.canEdit} onChange={(heading) => patch({ heading })} />
      <LocalizedField label="연사 섹션 설명" value={content.description} locale={props.locale} disabled={!props.canEdit} multiline onChange={(description) => patch({ description })} />
      <InlineEditableTable
        ariaLabel="연사 카테고리"
        rows={categories}
        disabled={!props.canEdit}
        issues={fieldIssues(props.issues, "categories")}
        canDelete={(category) => speakers.some((speaker) => speaker.categoryId === category.id) ? "이 카테고리를 참조하는 연사가 있어요" : true}
        onChange={(rows) => patch({ categories: rows.map((row, order) => ({ ...row, order })) })}
        renderRow={(row, index) => <div className="grid gap-2 sm:grid-cols-4">
          <LocalizedField label={`${index + 1}번 카테고리 이름`} value={row.label} locale={props.locale} disabled={!props.canEdit} onChange={(label) => patchCategory(index, { label })} />
          <label className="text-[11px] text-muted-foreground">배지 토큰<FieldSelect aria-label={`${index + 1}번 카테고리 배지`} value={row.badgeToken} disabled={!props.canEdit} onChange={(event) => patchCategory(index, { badgeToken: event.target.value as SpeakerCategory["badgeToken"] })}>{SPEAKER_TOKENS.map((token) => <option key={token}>{token}</option>)}</FieldSelect></label>
          <label className="text-[11px] text-muted-foreground">그라디언트 토큰<FieldSelect aria-label={`${index + 1}번 카테고리 그라디언트`} value={row.gradientToken} disabled={!props.canEdit} onChange={(event) => patchCategory(index, { gradientToken: event.target.value as SpeakerCategory["gradientToken"] })}>{SPEAKER_TOKENS.map((token) => <option key={token}>{token}</option>)}</FieldSelect></label>
          <Toggle label={`${index + 1}번 카테고리 공개`} checked={row.enabled} disabled={!props.canEdit} onChange={(enabled) => patchCategory(index, { enabled })} />
        </div>}
      />
      <AddButton label="연사 카테고리 추가" disabled={!props.canEdit} onClick={() => patch({ categories: [...categories, { id: makeSemanticId("speaker-category", categories), label: { [props.locale]: "새 카테고리" }, badgeToken: "robotics", gradientToken: "robotics", order: categories.length, enabled: false }] })} />
      <InlineEditableTable
        ariaLabel="연사"
        rows={speakers}
        disabled={!props.canEdit}
        issues={fieldIssues(props.issues, "speakers")}
        onChange={(rows) => patch({ speakers: rows.map((row, order) => ({ ...row, order })) })}
        renderRow={(row, index) => <div className="grid min-w-0 gap-3">
          <div className="grid gap-2 sm:grid-cols-2"><LocalizedField label={`${index + 1}번 연사 이름`} value={row.name} locale={props.locale} disabled={!props.canEdit} onChange={(name) => patchSpeaker(index, { name })} /><LocalizedField label={`${index + 1}번 연사 회사`} value={row.company} locale={props.locale} disabled={!props.canEdit} onChange={(company) => patchSpeaker(index, { company })} /><LocalizedField label={`${index + 1}번 연사 직함`} value={row.role} locale={props.locale} disabled={!props.canEdit} onChange={(role) => patchSpeaker(index, { role })} /><TextField label={`${index + 1}번 연사 프로필 주소`} value={row.profileUrl ?? ""} type="url" disabled={!props.canEdit} onChange={(profileUrl) => patchSpeaker(index, { profileUrl: profileUrl || undefined })} /></div>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2"><label className="text-[11px] text-muted-foreground">카테고리<FieldSelect aria-label={`${index + 1}번 연사 카테고리`} value={row.categoryId} disabled={!props.canEdit} onChange={(event) => patchSpeaker(index, { categoryId: event.target.value })}><option value="">선택</option>{categories.map((category) => <option key={category.id} value={category.id} disabled={!category.enabled}>{category.id}</option>)}</FieldSelect></label><TextField label={`${index + 1}번 연사 일자`} value={row.day} type="number" disabled={!props.canEdit} onChange={(day) => patchSpeaker(index, { day: Math.min(3, Math.max(1, Number(day))) as Speaker["day"] })} /></div>
          <ExpoMediaUploadField siteId={props.siteId} kind="image" label={`${index + 1}번 연사 이미지`} value={row.image} disabled={!props.canEdit} onChange={(next) => patchSpeaker(index, { image: next?.kind === "image" ? next : undefined })} />
          {row.image ? <ImageCropField image={row.image} value={row.crop ?? DEFAULT_CROP} disabled={!props.canEdit} onChange={(crop) => patchSpeaker(index, { crop })} /> : null}
          <Toggle label={`${index + 1}번 연사 공개`} checked={row.enabled} disabled={!props.canEdit} onChange={(enabled) => patchSpeaker(index, { enabled })} />
        </div>}
      />
      <AddButton label="연사 추가" disabled={!props.canEdit} onClick={() => patch({ speakers: [...speakers, { id: makeSemanticId("speaker", speakers), name: { [props.locale]: "새 연사" }, company: {}, role: {}, day: 1, categoryId: categories[0]?.id ?? "", crop: DEFAULT_CROP, order: speakers.length, enabled: false }] })} />
    </div>
  );
}

SpeakerCarouselEditor.displayName = "SpeakerCarouselEditor";
