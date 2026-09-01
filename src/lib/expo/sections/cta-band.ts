import type { ExpoSection, FieldIssue, SectionPlugin, ValidateContext } from "@/lib/expo/types";
import {
  AUDIENCES, contentWarning, ctaPublishIssues, ctaWarnings, hasLocalizedText, isRecord, localizedOf,
  normalizeCtas, publishError, recordOf, structuralError, validateCtas, validateLocalized,
  type CtaBandContent,
} from "@/lib/expo/sections/types";

function normalizeCtaBand(raw: unknown): CtaBandContent {
  const content = recordOf(raw);
  return {
    headline: localizedOf(content.headline),
    audience: (AUDIENCES as readonly unknown[]).includes(content.audience) ? content.audience as CtaBandContent["audience"] : "all",
    ctas: normalizeCtas(content.ctas),
  };
}

function validateCtaBand(section: ExpoSection): FieldIssue[] {
  if (!isRecord(section.content)) return [structuralError("", "invalid-shape", "CTA 내용의 모양이 올바르지 않아요")];
  const issues: FieldIssue[] = [];
  validateLocalized(section.content.headline, "headline", issues);
  if (section.content.audience !== undefined && !(AUDIENCES as readonly unknown[]).includes(section.content.audience)) issues.push(structuralError("audience", "invalid-shape", "대상 그룹이 올바르지 않아요"));
  validateCtas(section.content.ctas, "ctas", issues);
  return issues;
}

export function ctaBandPublishIssues(section: ExpoSection, context: ValidateContext): FieldIssue[] {
  const content = normalizeCtaBand(section.content);
  return [
    ...(!hasLocalizedText(content.headline) ? [publishError("headline", "required-text", "CTA 헤드라인이 필요해요")] : []),
    ...ctaPublishIssues(content.ctas, "ctas", context),
  ];
}

export function ctaBandWarnings(section: ExpoSection): FieldIssue[] {
  const content = normalizeCtaBand(section.content);
  const issues = [...ctaWarnings(content.ctas, "ctas")];
  if (!content.ctas.some((cta) => cta.enabled)) issues.push(contentWarning("", "empty-optional-section", "공개할 CTA가 없어요"));
  return issues;
}

export const ctaBandPlugin: SectionPlugin = {
  type: "cta-band", label: "STK 최종 CTA", variants: [{ id: "default", label: "기본" }], slots: [], multi: false,
  design: { bg: ["dark", "light"] },
  normalize(content) { return normalizeCtaBand(content) as unknown as Record<string, unknown>; },
  validate: validateCtaBand,
  hasContent(section) {
    const content = normalizeCtaBand(section.content);
    return hasLocalizedText(content.headline) && content.ctas.some((cta) => cta.enabled);
  },
};

export const CTA_BAND_PLUGIN = ctaBandPlugin;
