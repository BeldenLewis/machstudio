import type { ExpoSection, FieldIssue, SectionPlugin, ValidateContext } from "@/lib/expo/types";
import {
  contentWarning, hasLocalizedText, imagePublishIssues, imageWarnings, isCanonicalId, isRecord, localizedOf,
  normalizeImage, normalizeOrderedRows, optionalLocalizedOf, publishError, recordOf, structuralError,
  validateBoolean, validateIdList, validateImageShape, validateLocalized, validateNumber, validateRows,
  type AudienceGroup, type AudienceLink, type AudienceLinksContent,
} from "@/lib/expo/sections/types";

function normalizeLinks(value: unknown, publicMode: boolean, seen: Set<string>): AudienceLink[] {
  if (!Array.isArray(value)) return [];
  const links: AudienceLink[] = [];
  for (const raw of value.slice(0, 100)) {
    const link = recordOf(raw);
    if (!isCanonicalId(link.id) || seen.has(link.id)) continue;
    seen.add(link.id);
    const icon = normalizeImage(link.icon, publicMode);
    const campaignIds = Array.isArray(link.campaignIds) ? [...new Set(link.campaignIds.filter(isCanonicalId))].slice(0, 100) : [];
    links.push({
      id: link.id, ...(icon ? { icon } : {}), label: localizedOf(link.label),
      destinationId: isCanonicalId(link.destinationId) ? link.destinationId : "", campaignIds,
      order: typeof link.order === "number" && Number.isFinite(link.order) ? link.order : links.length,
      enabled: link.enabled !== false,
    });
  }
  return normalizeOrderedRows(links);
}

function normalizeGroup(audience: "exhibitor" | "visitor", raw: unknown, publicMode: boolean, seen: Set<string>): AudienceGroup {
  const group = recordOf(raw);
  const description = optionalLocalizedOf(group.description);
  return {
    audience, title: localizedOf(group.title), ...(description ? { description } : {}),
    variant: group.variant === "dark" ? "dark" : "light",
    items: normalizeLinks(group.items, publicMode, seen),
  };
}

function normalizeAudienceLinks(raw: unknown, publicMode: boolean): AudienceLinksContent {
  const content = recordOf(raw);
  const groups = Array.isArray(content.groups) ? content.groups.slice(0, 100) : [];
  const find = (audience: string) => groups.find((rawGroup) => recordOf(rawGroup).audience === audience);
  const seen = new Set<string>();
  return { groups: [
    normalizeGroup("exhibitor", find("exhibitor"), publicMode, seen),
    normalizeGroup("visitor", find("visitor"), publicMode, seen),
  ] };
}

function validateAudienceLinks(section: ExpoSection): FieldIssue[] {
  if (!isRecord(section.content)) return [structuralError("", "invalid-shape", "대상 링크 내용의 모양이 올바르지 않아요")];
  const issues: FieldIssue[] = [];
  const groups = section.content.groups;
  if (groups === undefined) return issues;
  if (!Array.isArray(groups)) return [structuralError("groups", "invalid-shape", "대상 그룹 목록의 모양이 올바르지 않아요")];
  if (groups.length > 100) issues.push(structuralError("groups", "too-many", "대상 그룹은 100개까지 넣을 수 있어요"));
  const seenAudiences = new Set<string>();
  const linkOwner = new Map<string, number>();
  groups.forEach((rawGroup, groupIndex) => {
    const path = `groups[${groupIndex}]`;
    if (!isRecord(rawGroup)) { issues.push(structuralError(path, "invalid-shape", "대상 그룹의 모양이 올바르지 않아요")); return; }
    if (rawGroup.audience !== undefined && rawGroup.audience !== "exhibitor" && rawGroup.audience !== "visitor") issues.push(structuralError(`${path}.audience`, "invalid-shape", "대상 그룹이 올바르지 않아요"));
    else if (typeof rawGroup.audience === "string" && seenAudiences.has(rawGroup.audience)) issues.push(structuralError(`${path}.audience`, "duplicate-id", "같은 대상 그룹이 두 번 있어요"));
    else if (typeof rawGroup.audience === "string") seenAudiences.add(rawGroup.audience);
    validateLocalized(rawGroup.title, `${path}.title`, issues);
    validateLocalized(rawGroup.description, `${path}.description`, issues);
    if (rawGroup.variant !== undefined && rawGroup.variant !== "light" && rawGroup.variant !== "dark") issues.push(structuralError(`${path}.variant`, "invalid-token", "그룹 변형이 올바르지 않아요"));
    validateRows(rawGroup.items, `${path}.items`, issues, (link, linkPath, out) => {
      if (isCanonicalId(link.id)) {
        const owner = linkOwner.get(link.id);
        if (owner !== undefined && owner !== groupIndex) out.push(structuralError(`${linkPath}.id`, "duplicate-id", "같은 식별자가 두 번 있어요"));
        else if (owner === undefined) linkOwner.set(link.id, groupIndex);
      }
      validateImageShape(link.icon, `${linkPath}.icon`, out);
      validateLocalized(link.label, `${linkPath}.label`, out);
      if (link.destinationId !== undefined && !isCanonicalId(link.destinationId)) out.push(structuralError(`${linkPath}.destinationId`, "invalid-shape", "목적지 식별자가 올바르지 않아요"));
      validateIdList(link.campaignIds, `${linkPath}.campaignIds`, out);
      validateNumber(link.order, `${linkPath}.order`, out);
      validateBoolean(link.enabled, `${linkPath}.enabled`, out);
    });
  });
  return issues;
}

export function audienceLinksPublishIssues(section: ExpoSection, context: ValidateContext): FieldIssue[] {
  const content = normalizeAudienceLinks(section.content, false);
  const issues: FieldIssue[] = [];
  content.groups.forEach((group, groupIndex) => {
    if (!hasLocalizedText(group.title)) issues.push(publishError(`groups[${groupIndex}].title`, "required-text", "그룹 제목이 필요해요"));
    group.items.forEach((link, linkIndex) => {
      if (!link.enabled) return;
      const path = `groups[${groupIndex}].items[${linkIndex}]`;
      if (!hasLocalizedText(link.label)) issues.push(publishError(`${path}.label`, "required-text", "링크 문구가 필요해요"));
      if (!context.destinations.get(link.destinationId)?.enabled) issues.push(publishError(`${path}.destinationId`, "invalid-destination-reference", "활성 목적지를 연결해 주세요"));
      link.campaignIds.forEach((id, index) => { if (!context.campaigns.get(id)?.enabled) issues.push(publishError(`${path}.campaignIds[${index}]`, "invalid-campaign-reference", "활성 캠페인을 연결해 주세요")); });
      issues.push(...imagePublishIssues(link.icon, `${path}.icon`));
    });
  });
  return issues;
}

export function audienceLinksWarnings(section: ExpoSection): FieldIssue[] {
  const content = normalizeAudienceLinks(section.content, false);
  const issues: FieldIssue[] = [];
  content.groups.forEach((group, groupIndex) => group.items.forEach((link, linkIndex) => {
    if (link.enabled) issues.push(...imageWarnings(link.icon, `groups[${groupIndex}].items[${linkIndex}].icon`));
  }));
  if (!content.groups.some((group) => group.items.some((item) => item.enabled))) issues.push(contentWarning("groups", "empty-optional-section", "공개할 대상 링크가 없어요"));
  return issues;
}

export const audienceLinksPlugin: SectionPlugin = {
  type: "audience-links", label: "STK 대상별 링크", variants: [{ id: "default", label: "기본" }], slots: [], multi: false,
  design: { bg: ["light", "dark"] },
  normalize(content, context) { return normalizeAudienceLinks(content, context.mode === "public") as unknown as Record<string, unknown>; },
  validate: validateAudienceLinks,
  hasContent(section) { return normalizeAudienceLinks(section.content, false).groups.some((group) => group.items.some((link) => link.enabled && hasLocalizedText(link.label))); },
};

export const AUDIENCE_LINKS_PLUGIN = audienceLinksPlugin;
