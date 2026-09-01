import type { ExpoSection, FieldIssue, SectionPlugin, ValidateContext } from "@/lib/expo/types";
import {
  EXHIBITION_ACCENT_TOKENS, contentWarning, hasLocalizedText, imagePublishIssues, imageWarnings, isCanonicalId,
  isRecord, localizedOf, normalizeImage, normalizeOrderedRows, optionalLocalizedOf, publishError, recordOf,
  structuralError, validateBoolean, validateImageShape, validateLocalized, validateNumber, validateRows,
  type ExhibitionGridContent, type ExhibitionItem,
} from "@/lib/expo/sections/types";

function normalizeExhibitionGrid(raw: unknown, publicMode: boolean): ExhibitionGridContent {
  const content = recordOf(raw);
  const seen = new Set<string>();
  const items: ExhibitionItem[] = [];
  if (Array.isArray(content.items)) {
    for (const rawItem of content.items.slice(0, 100)) {
      const item = recordOf(rawItem);
      if (!isCanonicalId(item.id) || seen.has(item.id)) continue;
      seen.add(item.id);
      const description = optionalLocalizedOf(item.description);
      const symbol = normalizeImage(item.symbol, publicMode);
      items.push({
        id: item.id, title: localizedOf(item.title), ...(description ? { description } : {}), ...(symbol ? { symbol } : {}),
        accentToken: (EXHIBITION_ACCENT_TOKENS as readonly unknown[]).includes(item.accentToken) ? String(item.accentToken) : "orange",
        destinationId: isCanonicalId(item.destinationId) ? item.destinationId : "",
        order: typeof item.order === "number" && Number.isFinite(item.order) ? item.order : items.length,
        enabled: item.enabled !== false,
      });
    }
  }
  return { heading: localizedOf(content.heading), items: normalizeOrderedRows(items) };
}

function validateExhibitionGrid(section: ExpoSection): FieldIssue[] {
  if (!isRecord(section.content)) return [structuralError("", "invalid-shape", "하위 전시 내용의 모양이 올바르지 않아요")];
  const issues: FieldIssue[] = [];
  validateLocalized(section.content.heading, "heading", issues);
  validateRows(section.content.items, "items", issues, (item, path, out) => {
    validateLocalized(item.title, `${path}.title`, out);
    validateLocalized(item.description, `${path}.description`, out);
    validateImageShape(item.symbol, `${path}.symbol`, out);
    if (item.accentToken !== undefined && !(EXHIBITION_ACCENT_TOKENS as readonly unknown[]).includes(item.accentToken)) out.push(structuralError(`${path}.accentToken`, "invalid-token", "강조색 토큰이 올바르지 않아요"));
    if (item.destinationId !== undefined && !isCanonicalId(item.destinationId)) out.push(structuralError(`${path}.destinationId`, "invalid-shape", "목적지 식별자가 올바르지 않아요"));
    validateNumber(item.order, `${path}.order`, out);
    validateBoolean(item.enabled, `${path}.enabled`, out);
  });
  return issues;
}

export function exhibitionItemCount(content: ExhibitionGridContent, validDestinationIds?: ReadonlySet<string>): number {
  return content.items.filter((item) => item.enabled && hasLocalizedText(item.title) && isCanonicalId(item.destinationId)
    && (!validDestinationIds || validDestinationIds.has(item.destinationId))).length;
}

export function exhibitionGridPublishIssues(section: ExpoSection, context: ValidateContext): FieldIssue[] {
  const content = normalizeExhibitionGrid(section.content, false);
  const issues: FieldIssue[] = [];
  if (!hasLocalizedText(content.heading)) issues.push(publishError("heading", "required-text", "구획 제목이 필요해요"));
  content.items.forEach((item, index) => {
    if (!item.enabled) return;
    if (!hasLocalizedText(item.title)) issues.push(publishError(`items[${index}].title`, "required-text", "하위 전시 이름이 필요해요"));
    if (!context.destinations.get(item.destinationId)?.enabled) issues.push(publishError(`items[${index}].destinationId`, "invalid-destination-reference", "활성 목적지를 연결해 주세요"));
    issues.push(...imagePublishIssues(item.symbol, `items[${index}].symbol`));
  });
  return issues;
}

export function exhibitionGridWarnings(section: ExpoSection): FieldIssue[] {
  const content = normalizeExhibitionGrid(section.content, false);
  const issues: FieldIssue[] = [];
  content.items.forEach((item, index) => { if (item.enabled) issues.push(...imageWarnings(item.symbol, `items[${index}].symbol`)); });
  if (content.items.filter((item) => item.enabled).length === 0) issues.push(contentWarning("items", "empty-optional-section", "공개할 하위 전시가 없어요"));
  return issues;
}

export const exhibitionGridPlugin: SectionPlugin = {
  type: "exhibition-grid", label: "STK 하위 전시", variants: [{ id: "default", label: "기본" }], slots: [], multi: false,
  design: { bg: ["light", "dark"] },
  normalize(content, context) { return normalizeExhibitionGrid(content, context.mode === "public") as unknown as Record<string, unknown>; },
  validate: validateExhibitionGrid,
  hasContent(section) { return normalizeExhibitionGrid(section.content, false).items.some((item) => item.enabled && hasLocalizedText(item.title)); },
};

export const EXHIBITION_GRID_PLUGIN = exhibitionGridPlugin;
