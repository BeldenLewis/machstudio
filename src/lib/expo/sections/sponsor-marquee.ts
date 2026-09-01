import { isSafePublicUrl } from "@/lib/expo/destination";
import type { ExpoSection, FieldIssue, SectionPlugin, ValidateContext } from "@/lib/expo/types";
import {
  clamp, contentWarning, hasLocalizedText, imagePublishIssues, imageWarnings, isCanonicalId, isRecord,
  localizedOf, normalizeImage, normalizeOrderedRows, optionalLocalizedOf, publishError, recordOf, structuralError,
  validateBoolean, validateImageShape, validateLocalized, validateNumber, validateRows,
  type Sponsor, type SponsorGroup, type SponsorMarqueeContent,
} from "@/lib/expo/sections/types";

function normalizeSponsorMarquee(raw: unknown, publicMode: boolean): SponsorMarqueeContent {
  const content = recordOf(raw);
  const seenGroups = new Set<string>();
  const groups: SponsorGroup[] = [];
  if (Array.isArray(content.groups)) {
    for (const rawGroup of content.groups.slice(0, 100)) {
      const group = recordOf(rawGroup);
      if (!isCanonicalId(group.id) || seenGroups.has(group.id)) continue;
      seenGroups.add(group.id);
      groups.push({
        id: group.id, title: localizedOf(group.title), marquee: group.marquee !== false,
        durationSeconds: clamp(group.durationSeconds, 8, 120, 30),
        order: typeof group.order === "number" && Number.isFinite(group.order) ? group.order : groups.length,
      });
    }
  }
  const seenSponsors = new Set<string>();
  const sponsors: Sponsor[] = [];
  if (Array.isArray(content.sponsors)) {
    for (const rawSponsor of content.sponsors.slice(0, 100)) {
      const sponsor = recordOf(rawSponsor);
      if (!isCanonicalId(sponsor.id) || seenSponsors.has(sponsor.id)) continue;
      seenSponsors.add(sponsor.id);
      const logo = normalizeImage(sponsor.logo, publicMode);
      const homepageUrl = typeof sponsor.homepageUrl === "string" && sponsor.homepageUrl.trim()
        && (!publicMode || isSafePublicUrl(sponsor.homepageUrl.trim())) ? sponsor.homepageUrl.trim() : undefined;
      sponsors.push({
        id: sponsor.id, name: typeof sponsor.name === "string" ? sponsor.name.trim().slice(0, 500) : "",
        ...(logo ? { logo } : {}), ...(homepageUrl ? { homepageUrl } : {}),
        groupId: isCanonicalId(sponsor.groupId) ? sponsor.groupId : "",
        order: typeof sponsor.order === "number" && Number.isFinite(sponsor.order) ? sponsor.order : sponsors.length,
        enabled: sponsor.enabled !== false,
      });
    }
  }
  let orderedGroups = normalizeOrderedRows(groups);
  let orderedSponsors = normalizeOrderedRows(sponsors);
  if (publicMode) {
    const groupIds = new Set(orderedGroups.map((group) => group.id));
    orderedSponsors = orderedSponsors.filter((sponsor) => sponsor.enabled && groupIds.has(sponsor.groupId));
    const occupied = new Set(orderedSponsors.map((sponsor) => sponsor.groupId));
    orderedGroups = orderedGroups.filter((group) => occupied.has(group.id));
    orderedGroups = normalizeOrderedRows(orderedGroups);
    orderedSponsors = normalizeOrderedRows(orderedSponsors);
  }
  const heading = optionalLocalizedOf(content.heading);
  return { ...(heading ? { heading } : {}), groups: orderedGroups, sponsors: orderedSponsors };
}

function validateSponsorMarquee(section: ExpoSection): FieldIssue[] {
  if (!isRecord(section.content)) return [structuralError("", "invalid-shape", "후원사 내용의 모양이 올바르지 않아요")];
  const issues: FieldIssue[] = [];
  validateLocalized(section.content.heading, "heading", issues);
  validateRows(section.content.groups, "groups", issues, (group, path, out) => {
    validateLocalized(group.title, `${path}.title`, out);
    validateBoolean(group.marquee, `${path}.marquee`, out);
    validateNumber(group.durationSeconds, `${path}.durationSeconds`, out);
    validateNumber(group.order, `${path}.order`, out);
  });
  validateRows(section.content.sponsors, "sponsors", issues, (sponsor, path, out) => {
    if (sponsor.name !== undefined && typeof sponsor.name !== "string") out.push(structuralError(`${path}.name`, "invalid-shape", "후원사 이름의 모양이 올바르지 않아요"));
    else if (typeof sponsor.name === "string" && sponsor.name.length > 500) out.push(structuralError(`${path}.name`, "too-long", "후원사 이름은 500자까지 넣을 수 있어요"));
    validateImageShape(sponsor.logo, `${path}.logo`, out);
    if (sponsor.homepageUrl !== undefined && typeof sponsor.homepageUrl !== "string") out.push(structuralError(`${path}.homepageUrl`, "invalid-shape", "홈페이지 주소의 모양이 올바르지 않아요"));
    if (sponsor.groupId !== undefined && !isCanonicalId(sponsor.groupId)) out.push(structuralError(`${path}.groupId`, "invalid-shape", "그룹 식별자가 올바르지 않아요"));
    validateNumber(sponsor.order, `${path}.order`, out);
    validateBoolean(sponsor.enabled, `${path}.enabled`, out);
  });
  return issues;
}

export function sponsorMarqueePublishIssues(section: ExpoSection, _context: ValidateContext): FieldIssue[] {
  const content = normalizeSponsorMarquee(section.content, false);
  const issues: FieldIssue[] = [];
  const groups = new Set(content.groups.map((group) => group.id));
  content.groups.forEach((group, index) => { if (!hasLocalizedText(group.title)) issues.push(publishError(`groups[${index}].title`, "required-text", "후원사 그룹 제목이 필요해요")); });
  content.sponsors.forEach((sponsor, index) => {
    if (!sponsor.enabled) return;
    const path = `sponsors[${index}]`;
    if (!sponsor.name) issues.push(publishError(`${path}.name`, "required-text", "후원사 이름이 필요해요"));
    if (!groups.has(sponsor.groupId)) issues.push(publishError(`${path}.groupId`, "invalid-group-reference", "유효한 후원사 그룹을 연결해 주세요"));
    issues.push(...imagePublishIssues(sponsor.logo, `${path}.logo`, true));
    if (sponsor.homepageUrl && !isSafePublicUrl(sponsor.homepageUrl)) issues.push(publishError(`${path}.homepageUrl`, "invalid-url", "공개 HTTPS 홈페이지 주소만 사용할 수 있어요"));
  });
  return issues;
}

export function sponsorMarqueeWarnings(section: ExpoSection): FieldIssue[] {
  const content = normalizeSponsorMarquee(section.content, false);
  const issues: FieldIssue[] = [];
  content.sponsors.forEach((sponsor, index) => { if (sponsor.enabled) issues.push(...imageWarnings(sponsor.logo, `sponsors[${index}].logo`)); });
  if (!content.sponsors.some((sponsor) => sponsor.enabled)) issues.push(contentWarning("sponsors", "empty-optional-section", "공개할 후원사가 없어요"));
  return issues;
}

export const sponsorMarqueePlugin: SectionPlugin = {
  type: "sponsor-marquee", label: "STK 후원사", variants: [{ id: "default", label: "기본" }], slots: [], multi: false,
  design: { bg: ["light", "dark"] },
  normalize(content, context) { return normalizeSponsorMarquee(content, context.mode === "public") as unknown as Record<string, unknown>; },
  validate: validateSponsorMarquee,
  hasContent(section) {
    const content = normalizeSponsorMarquee(section.content, false);
    const groups = new Set(content.groups.map((group) => group.id));
    return content.sponsors.some((sponsor) => sponsor.enabled && groups.has(sponsor.groupId) && Boolean(sponsor.name));
  },
};

export const SPONSOR_MARQUEE_PLUGIN = sponsorMarqueePlugin;
