"use client";

import type { ComponentType } from "react";
import { AudienceLinksEditor } from "@/components/expo/section-editors/AudienceLinksEditor";
import { CampaignHeroEditor } from "@/components/expo/section-editors/CampaignHeroEditor";
import { CtaBandEditor } from "@/components/expo/section-editors/CtaBandEditor";
import { ExhibitionGridEditor } from "@/components/expo/section-editors/ExhibitionGridEditor";
import { SpeakerCarouselEditor } from "@/components/expo/section-editors/SpeakerCarouselEditor";
import { SponsorMarqueeEditor } from "@/components/expo/section-editors/SponsorMarqueeEditor";
import type { SectionEditorProps } from "@/lib/expo/types";

const SECTION_EDITORS: Readonly<Record<string, ComponentType<SectionEditorProps>>> = Object.freeze({
  "campaign-hero": CampaignHeroEditor,
  "exhibition-grid": ExhibitionGridEditor,
  "audience-links": AudienceLinksEditor,
  "speaker-carousel": SpeakerCarouselEditor,
  "sponsor-marquee": SponsorMarqueeEditor,
  "cta-band": CtaBandEditor,
});

export function sectionEditorFor(type: string): ComponentType<SectionEditorProps> | null {
  return SECTION_EDITORS[type] ?? null;
}

/** Stable dispatcher for React's static-component rule; the lookup remains separately inspectable. */
export function RegisteredSectionEditor(props: SectionEditorProps) {
  if (props.section.type === "campaign-hero") return <CampaignHeroEditor {...props} />;
  if (props.section.type === "exhibition-grid") return <ExhibitionGridEditor {...props} />;
  if (props.section.type === "audience-links") return <AudienceLinksEditor {...props} />;
  if (props.section.type === "speaker-carousel") return <SpeakerCarouselEditor {...props} />;
  if (props.section.type === "sponsor-marquee") return <SponsorMarqueeEditor {...props} />;
  if (props.section.type === "cta-band") return <CtaBandEditor {...props} />;
  return null;
}
