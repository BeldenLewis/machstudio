"use client";

import { FieldSelect } from "@/components/ui/primitives";
import { CtaRows, LocalizedField } from "@/components/expo/section-editors/shared";
import type { CtaBandContent } from "@/lib/expo/sections/types";
import type { SectionEditorProps } from "@/lib/expo/types";

export function CtaBandEditor(props: SectionEditorProps) {
  const content = props.section.content as unknown as Partial<CtaBandContent>;
  const patch = (next: Partial<CtaBandContent>) => props.canEdit && props.onChange({ ...props.section, content: { ...props.section.content, ...next } });
  return (
    <div data-testid="cta-band-editor" className="min-w-0 space-y-3">
      <LocalizedField label="최종 CTA 헤드라인" value={content.headline} locale={props.locale} disabled={!props.canEdit} multiline onChange={(headline) => patch({ headline })} />
      <label className="block text-[11px] text-muted-foreground">구획 대상<FieldSelect aria-label="최종 CTA 대상" value={content.audience ?? "all"} disabled={!props.canEdit} onChange={(event) => patch({ audience: event.target.value as CtaBandContent["audience"] })}><option value="all">모두</option><option value="exhibitor">참가기업</option><option value="visitor">참관객</option></FieldSelect></label>
      <CtaRows props={props} value={content.ctas ?? []} onChange={(ctas) => patch({ ctas })} />
    </div>
  );
}

CtaBandEditor.displayName = "CtaBandEditor";
