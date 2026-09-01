import { isSafePublicUrl } from "@/lib/expo/destination";
import type { ExpoSection, FieldIssue, SectionPlugin, ValidateContext } from "@/lib/expo/types";
import {
  SPEAKER_TOKENS, contentWarning, hasLocalizedText, imagePublishIssues, imageWarnings, isCanonicalId, isRecord,
  localizedOf, normalizeCrop, normalizeImage, normalizeOrderedRows, optionalLocalizedOf, publishError, recordOf,
  structuralError, validateBoolean, validateImageShape, validateLocalized, validateNumber, validateRows,
  type Speaker, type SpeakerCarouselContent, type SpeakerCategory, type SpeakerToken,
} from "@/lib/expo/sections/types";

function normalizeSpeakerCarousel(raw: unknown, publicMode: boolean): SpeakerCarouselContent {
  const content = recordOf(raw);
  const seenCategories = new Set<string>();
  const categories: SpeakerCategory[] = [];
  if (Array.isArray(content.categories)) {
    for (const rawCategory of content.categories.slice(0, 100)) {
      const category = recordOf(rawCategory);
      if (!isCanonicalId(category.id) || seenCategories.has(category.id)) continue;
      seenCategories.add(category.id);
      categories.push({
        id: category.id, label: localizedOf(category.label),
        badgeToken: (SPEAKER_TOKENS as readonly unknown[]).includes(category.badgeToken) ? category.badgeToken as SpeakerToken : "robotics",
        gradientToken: (SPEAKER_TOKENS as readonly unknown[]).includes(category.gradientToken) ? category.gradientToken as SpeakerToken : "robotics",
        order: typeof category.order === "number" && Number.isFinite(category.order) ? category.order : categories.length,
        enabled: category.enabled !== false,
      });
    }
  }

  const seenSpeakers = new Set<string>();
  const speakers: Speaker[] = [];
  if (Array.isArray(content.speakers)) {
    for (const rawSpeaker of content.speakers.slice(0, 100)) {
      const speaker = recordOf(rawSpeaker);
      if (!isCanonicalId(speaker.id) || seenSpeakers.has(speaker.id)) continue;
      seenSpeakers.add(speaker.id);
      const image = normalizeImage(speaker.image, publicMode);
      const profileUrl = typeof speaker.profileUrl === "string" && speaker.profileUrl.trim()
        && (!publicMode || isSafePublicUrl(speaker.profileUrl.trim())) ? speaker.profileUrl.trim() : undefined;
      speakers.push({
        id: speaker.id, name: localizedOf(speaker.name), company: localizedOf(speaker.company), role: localizedOf(speaker.role),
        day: speaker.day === 2 || speaker.day === 3 ? speaker.day : 1,
        categoryId: isCanonicalId(speaker.categoryId) ? speaker.categoryId : "",
        ...(image ? { image } : {}), crop: normalizeCrop(speaker.crop), ...(profileUrl ? { profileUrl } : {}),
        order: typeof speaker.order === "number" && Number.isFinite(speaker.order) ? speaker.order : speakers.length,
        enabled: speaker.enabled !== false,
      });
    }
  }

  let orderedCategories = normalizeOrderedRows(categories);
  let orderedSpeakers = normalizeOrderedRows(speakers);
  if (publicMode) {
    const categoryIds = new Set(orderedCategories.filter((category) => category.enabled).map((category) => category.id));
    orderedSpeakers = orderedSpeakers.filter((speaker) => speaker.enabled && categoryIds.has(speaker.categoryId));
    const occupied = new Set(orderedSpeakers.map((speaker) => speaker.categoryId));
    orderedCategories = orderedCategories.filter((category) => category.enabled && occupied.has(category.id));
    orderedCategories = normalizeOrderedRows(orderedCategories);
    orderedSpeakers = normalizeOrderedRows(orderedSpeakers);
  }
  const description = optionalLocalizedOf(content.description);
  return { heading: localizedOf(content.heading), ...(description ? { description } : {}), categories: orderedCategories, speakers: orderedSpeakers };
}

function validateSpeakerCarousel(section: ExpoSection): FieldIssue[] {
  if (!isRecord(section.content)) return [structuralError("", "invalid-shape", "연사 내용의 모양이 올바르지 않아요")];
  const issues: FieldIssue[] = [];
  validateLocalized(section.content.heading, "heading", issues);
  validateLocalized(section.content.description, "description", issues);
  validateRows(section.content.categories, "categories", issues, (category, path, out) => {
    validateLocalized(category.label, `${path}.label`, out);
    if (category.badgeToken !== undefined && !(SPEAKER_TOKENS as readonly unknown[]).includes(category.badgeToken)) out.push(structuralError(`${path}.badgeToken`, "invalid-token", "배지 토큰이 올바르지 않아요"));
    if (category.gradientToken !== undefined && !(SPEAKER_TOKENS as readonly unknown[]).includes(category.gradientToken)) out.push(structuralError(`${path}.gradientToken`, "invalid-token", "그라데이션 토큰이 올바르지 않아요"));
    validateNumber(category.order, `${path}.order`, out);
    validateBoolean(category.enabled, `${path}.enabled`, out);
  });
  validateRows(section.content.speakers, "speakers", issues, (speaker, path, out) => {
    validateLocalized(speaker.name, `${path}.name`, out);
    validateLocalized(speaker.company, `${path}.company`, out);
    validateLocalized(speaker.role, `${path}.role`, out);
    if (speaker.day !== undefined && speaker.day !== 1 && speaker.day !== 2 && speaker.day !== 3) out.push(structuralError(`${path}.day`, "invalid-shape", "연사 Day가 올바르지 않아요"));
    if (speaker.categoryId !== undefined && !isCanonicalId(speaker.categoryId)) out.push(structuralError(`${path}.categoryId`, "invalid-shape", "카테고리 식별자가 올바르지 않아요"));
    validateImageShape(speaker.image, `${path}.image`, out);
    if (speaker.crop !== undefined) {
      if (!isRecord(speaker.crop)) out.push(structuralError(`${path}.crop`, "invalid-shape", "이미지 자르기 값이 올바르지 않아요"));
      else {
        if (speaker.crop.fit !== undefined && speaker.crop.fit !== "cover" && speaker.crop.fit !== "contain") out.push(structuralError(`${path}.crop.fit`, "invalid-token", "이미지 맞춤 값이 올바르지 않아요"));
        validateNumber(speaker.crop.x, `${path}.crop.x`, out);
        validateNumber(speaker.crop.y, `${path}.crop.y`, out);
        validateNumber(speaker.crop.scale, `${path}.crop.scale`, out);
      }
    }
    if (speaker.profileUrl !== undefined && typeof speaker.profileUrl !== "string") out.push(structuralError(`${path}.profileUrl`, "invalid-shape", "프로필 주소의 모양이 올바르지 않아요"));
    validateNumber(speaker.order, `${path}.order`, out);
    validateBoolean(speaker.enabled, `${path}.enabled`, out);
  });
  return issues;
}

export function speakerCarouselPublishIssues(section: ExpoSection, _context: ValidateContext): FieldIssue[] {
  const content = normalizeSpeakerCarousel(section.content, false);
  const issues: FieldIssue[] = [];
  if (!hasLocalizedText(content.heading)) issues.push(publishError("heading", "required-text", "연사 구획 제목이 필요해요"));
  const categories = new Map(content.categories.map((category) => [category.id, category]));
  content.categories.forEach((category, index) => {
    if (category.enabled && !hasLocalizedText(category.label)) issues.push(publishError(`categories[${index}].label`, "required-text", "카테고리 이름이 필요해요"));
  });
  content.speakers.forEach((speaker, index) => {
    if (!speaker.enabled) return;
    const path = `speakers[${index}]`;
    for (const key of ["name", "company", "role"] as const) {
      if (!hasLocalizedText(speaker[key])) issues.push(publishError(`${path}.${key}`, "required-text", "공개 연사 정보가 필요해요"));
    }
    if (!categories.get(speaker.categoryId)?.enabled) issues.push(publishError(`${path}.categoryId`, "invalid-category-reference", "활성 카테고리로 옮긴 뒤 공개해 주세요"));
    issues.push(...imagePublishIssues(speaker.image, `${path}.image`, true));
    if (speaker.profileUrl && !isSafePublicUrl(speaker.profileUrl)) issues.push(publishError(`${path}.profileUrl`, "invalid-url", "공개 HTTPS 프로필 주소만 사용할 수 있어요"));
  });
  return issues;
}

export function speakerCarouselWarnings(section: ExpoSection): FieldIssue[] {
  const content = normalizeSpeakerCarousel(section.content, false);
  const issues: FieldIssue[] = [];
  content.speakers.forEach((speaker, index) => { if (speaker.enabled) issues.push(...imageWarnings(speaker.image, `speakers[${index}].image`)); });
  if (!content.speakers.some((speaker) => speaker.enabled)) issues.push(contentWarning("speakers", "empty-optional-section", "공개할 연사가 없어요"));
  return issues;
}

export const speakerCarouselPlugin: SectionPlugin = {
  type: "speaker-carousel", label: "STK 연사", variants: [{ id: "default", label: "기본" }], slots: [], multi: false,
  design: { bg: ["dark", "light"] },
  normalize(content, context) { return normalizeSpeakerCarousel(content, context.mode === "public") as unknown as Record<string, unknown>; },
  validate: validateSpeakerCarousel,
  hasContent(section) {
    const content = normalizeSpeakerCarousel(section.content, false);
    const valid = new Set(content.categories.filter((category) => category.enabled).map((category) => category.id));
    return content.speakers.some((speaker) => speaker.enabled && valid.has(speaker.categoryId));
  },
};

export const SPEAKER_CAROUSEL_PLUGIN = speakerCarouselPlugin;
