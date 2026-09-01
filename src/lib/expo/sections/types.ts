import { toLocalized, type Localized } from "@/lib/collect-form-config";
import { isSafePublicUrl } from "@/lib/expo/destination";
import type { MediaValue } from "@/lib/expo/types";
import { EXPO_V2_RULES, type AudienceId, type CampaignConfig, type DestinationConfig, type FieldIssue } from "@/lib/expo/types";

export interface ExpoImageValue extends MediaValue {
  originalUrl?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  decorative: boolean;
}

export interface ExpoVideoValue {
  kind: "video";
  url: string;
  originalUrl: string;
  mimeType: "video/mp4";
  poster?: ExpoImageValue;
  rightsStatus: "confirmed" | "unconfirmed";
}

export interface ImageCrop {
  fit: "cover" | "contain";
  x: number;
  y: number;
  scale: number;
}

export type CtaVariant = "primary" | "secondary" | "outline" | "solid";

export interface CtaPlacement {
  id: string;
  label: Localized;
  description?: Localized;
  destinationId: string;
  variant: CtaVariant;
  audience: AudienceId;
  campaignIds: string[];
  priority: number;
  fallback: boolean;
  enabled: boolean;
}

export interface CampaignHeroContent {
  eyebrow?: Localized;
  typingLines: Localized[];
  accessibleHeadline: Localized;
  video?: ExpoVideoValue;
  overlay: number;
  typing: { enabled: boolean; speedMs: number; holdMs: number };
  ctas: CtaPlacement[];
}

export interface ExhibitionItem {
  id: string;
  title: Localized;
  description?: Localized;
  symbol?: ExpoImageValue;
  accentToken: string;
  destinationId: string;
  order: number;
  enabled: boolean;
}

export interface ExhibitionGridContent {
  heading: Localized;
  items: ExhibitionItem[];
}

export interface AudienceLink {
  id: string;
  icon?: ExpoImageValue;
  label: Localized;
  destinationId: string;
  campaignIds: string[];
  order: number;
  enabled: boolean;
}

export interface AudienceGroup {
  audience: "exhibitor" | "visitor";
  title: Localized;
  description?: Localized;
  variant: "light" | "dark";
  items: AudienceLink[];
}

export interface AudienceLinksContent {
  groups: AudienceGroup[];
}

export type SpeakerToken = "robotics" | "ai" | "autonomous-manufacturing";

export interface SpeakerCategory {
  id: string;
  label: Localized;
  badgeToken: SpeakerToken;
  gradientToken: SpeakerToken;
  order: number;
  enabled: boolean;
}

export interface Speaker {
  id: string;
  name: Localized;
  company: Localized;
  role: Localized;
  day: 1 | 2 | 3;
  categoryId: string;
  image?: ExpoImageValue;
  crop: ImageCrop;
  profileUrl?: string;
  order: number;
  enabled: boolean;
}

export interface SpeakerCarouselContent {
  heading: Localized;
  description?: Localized;
  categories: SpeakerCategory[];
  speakers: Speaker[];
}

export interface SponsorGroup {
  id: string;
  title: Localized;
  marquee: boolean;
  durationSeconds: number;
  order: number;
}

export interface Sponsor {
  id: string;
  name: string;
  logo?: ExpoImageValue;
  homepageUrl?: string;
  groupId: string;
  order: number;
  enabled: boolean;
}

export interface SponsorMarqueeContent {
  heading?: Localized;
  groups: SponsorGroup[];
  sponsors: Sponsor[];
}

export interface CtaBandContent {
  headline: Localized;
  audience: AudienceId;
  ctas: CtaPlacement[];
}

export const CTA_VARIANTS = ["primary", "secondary", "outline", "solid"] as const;
export const AUDIENCES = ["all", "exhibitor", "visitor"] as const;
export const SPEAKER_TOKENS = ["robotics", "ai", "autonomous-manufacturing"] as const;
export const EXHIBITION_ACCENT_TOKENS = [
  "orange", "blue", "green", "teal", "purple", "red", "yellow", "neutral",
  "robotics", "ai", "autonomous-manufacturing",
] as const;

export const recordOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
export const stringOf = (value: unknown): string => typeof value === "string" ? value : "";
export const isCanonicalId = (value: unknown): value is string =>
  typeof value === "string" && EXPO_V2_RULES.id.test(value);
export const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
  const number = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, number));
};
export const hasLocalizedText = (value: unknown): boolean =>
  Object.values(toLocalized(value)).some((text) => text.trim() !== "");
export const localizedOf = (value: unknown): Localized => toLocalized(value);
export const optionalLocalizedOf = (value: unknown): Localized | undefined => {
  const localized = localizedOf(value);
  return Object.keys(localized).length > 0 ? localized : undefined;
};

export const structuralError = (path: string, code: string, message: string): FieldIssue => ({
  path, code, message, severity: "error",
});
export const publishError = structuralError;
export const contentWarning = (path: string, code: string, message: string): FieldIssue => ({
  path, code, message, severity: "warning",
});

export function validateLocalized(value: unknown, path: string, issues: FieldIssue[]): void {
  if (value === undefined || value === null) return;
  if (typeof value === "string") {
    if (value.length > 500) issues.push(structuralError(path, "too-long", "문구는 500자까지 넣을 수 있어요"));
    return;
  }
  if (!isRecord(value) || Object.values(value).some((item) => typeof item !== "string")) {
    issues.push(structuralError(path, "invalid-shape", "다국어 문구의 모양이 올바르지 않아요"));
    return;
  }
  for (const [locale, text] of Object.entries(value)) {
    if (typeof text === "string" && text.length > 500) issues.push(structuralError(`${path}.${locale}`, "too-long", "문구는 500자까지 넣을 수 있어요"));
  }
}

export function validateBoolean(value: unknown, path: string, issues: FieldIssue[]): void {
  if (value !== undefined && typeof value !== "boolean") issues.push(structuralError(path, "invalid-shape", "켜짐 설정의 모양이 올바르지 않아요"));
}

export function validateNumber(value: unknown, path: string, issues: FieldIssue[]): void {
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) {
    issues.push(structuralError(path, "invalid-shape", "숫자 값의 모양이 올바르지 않아요"));
  }
}

export function validateIdList(value: unknown, path: string, issues: FieldIssue[]): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    issues.push(structuralError(path, "invalid-shape", "식별자 목록의 모양이 올바르지 않아요"));
    return;
  }
  if (value.length > EXPO_V2_RULES.maxRows) issues.push(structuralError(path, "too-many", `목록은 ${EXPO_V2_RULES.maxRows}개까지 넣을 수 있어요`));
  const seen = new Set<string>();
  value.forEach((id, index) => {
    if (!isCanonicalId(id)) issues.push(structuralError(`${path}[${index}]`, "invalid-shape", "식별자가 올바르지 않아요"));
    else if (seen.has(id)) issues.push(structuralError(`${path}[${index}]`, "duplicate-id", "같은 식별자가 두 번 있어요"));
    else seen.add(id);
  });
}

export function validateRows(
  value: unknown,
  path: string,
  issues: FieldIssue[],
  validateRow: (row: Record<string, unknown>, path: string, issues: FieldIssue[]) => void,
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    issues.push(structuralError(path, "invalid-shape", "목록 모양이 올바르지 않아요"));
    return;
  }
  if (value.length > EXPO_V2_RULES.maxRows) issues.push(structuralError(path, "too-many", `목록은 ${EXPO_V2_RULES.maxRows}개까지 넣을 수 있어요`));
  const seen = new Set<string>();
  value.forEach((raw, index) => {
    const rowPath = `${path}[${index}]`;
    if (!isRecord(raw)) {
      issues.push(structuralError(rowPath, "invalid-shape", "행의 모양이 올바르지 않아요"));
      return;
    }
    if (!isCanonicalId(raw.id)) issues.push(structuralError(`${rowPath}.id`, "invalid-shape", "식별자가 올바르지 않아요"));
    else if (seen.has(raw.id)) issues.push(structuralError(`${rowPath}.id`, "duplicate-id", "같은 식별자가 두 번 있어요"));
    else seen.add(raw.id);
    validateRow(raw, rowPath, issues);
  });
}

export function validateImageShape(value: unknown, path: string, issues: FieldIssue[]): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    issues.push(structuralError(path, "invalid-shape", "이미지 모양이 올바르지 않아요"));
    return;
  }
  if (value.kind !== undefined && value.kind !== "image") issues.push(structuralError(`${path}.kind`, "invalid-shape", "이미지 종류가 올바르지 않아요"));
  for (const key of ["url", "originalUrl", "mimeType", "alt"] as const) {
    if (value[key] !== undefined && typeof value[key] !== "string") issues.push(structuralError(`${path}.${key}`, "invalid-shape", "이미지 값의 모양이 올바르지 않아요"));
  }
  if (typeof value.alt === "string" && value.alt.length > 500) {
    issues.push(structuralError(`${path}.alt`, "too-long", "이미지 설명은 500자까지 넣을 수 있어요"));
  }
  for (const key of ["width", "height"] as const) validateNumber(value[key], `${path}.${key}`, issues);
  validateBoolean(value.decorative, `${path}.decorative`, issues);
}

export function normalizeImage(value: unknown, publicMode = false): ExpoImageValue | undefined {
  const image = recordOf(value);
  if (image.kind !== "image") return undefined;
  const url = stringOf(image.url).trim();
  if (!url || (publicMode && !isSafePublicUrl(url))) return undefined;
  const originalUrl = stringOf(image.originalUrl).trim();
  const mimeType = stringOf(image.mimeType).trim();
  const alt = stringOf(image.alt).trim();
  const width = typeof image.width === "number" && Number.isFinite(image.width) && image.width > 0 ? image.width : undefined;
  const height = typeof image.height === "number" && Number.isFinite(image.height) && image.height > 0 ? image.height : undefined;
  return {
    kind: "image", url,
    ...(originalUrl && (!publicMode || isSafePublicUrl(originalUrl)) ? { originalUrl } : {}),
    ...(mimeType ? { mimeType } : {}), ...(alt ? { alt } : {}), ...(width ? { width } : {}), ...(height ? { height } : {}),
    decorative: image.decorative === true,
  };
}

export function validateVideoShape(value: unknown, path: string, issues: FieldIssue[]): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    issues.push(structuralError(path, "invalid-shape", "영상 모양이 올바르지 않아요"));
    return;
  }
  if (value.kind !== undefined && value.kind !== "video") issues.push(structuralError(`${path}.kind`, "invalid-shape", "영상 종류가 올바르지 않아요"));
  for (const key of ["url", "originalUrl"] as const) {
    if (value[key] !== undefined && typeof value[key] !== "string") issues.push(structuralError(`${path}.${key}`, "invalid-shape", "영상 주소의 모양이 올바르지 않아요"));
  }
  if (value.mimeType !== undefined && value.mimeType !== "video/mp4") issues.push(structuralError(`${path}.mimeType`, "invalid-token", "MP4 영상만 사용할 수 있어요"));
  if (value.rightsStatus !== undefined && value.rightsStatus !== "confirmed" && value.rightsStatus !== "unconfirmed") {
    issues.push(structuralError(`${path}.rightsStatus`, "invalid-token", "영상 권리 상태가 올바르지 않아요"));
  }
  validateImageShape(value.poster, `${path}.poster`, issues);
}

export function normalizeVideo(value: unknown, publicMode = false): ExpoVideoValue | undefined {
  const video = recordOf(value);
  if (video.kind !== "video") return undefined;
  const url = stringOf(video.url).trim();
  const originalUrl = stringOf(video.originalUrl).trim();
  if (!url || !originalUrl || video.mimeType !== "video/mp4"
    || (video.rightsStatus !== "confirmed" && video.rightsStatus !== "unconfirmed")
    || (publicMode && (!isSafePublicUrl(url) || !isSafePublicUrl(originalUrl)))) return undefined;
  const poster = normalizeImage(video.poster, publicMode);
  return { kind: "video", url, originalUrl, mimeType: "video/mp4", ...(poster ? { poster } : {}), rightsStatus: video.rightsStatus };
}

export function normalizeCrop(value: unknown): ImageCrop {
  const crop = recordOf(value);
  return {
    fit: crop.fit === "contain" ? "contain" : "cover",
    x: clamp(crop.x, 0, 100, 50), y: clamp(crop.y, 0, 100, 50), scale: clamp(crop.scale, 0.5, 2, 1),
  };
}

export function normalizeOrderedRows<T extends { id: string; order: number }>(rows: T[]): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => a.row.order - b.row.order || a.index - b.index)
    .map(({ row }, order) => ({ ...row, order }));
}

export function normalizeCtas(value: unknown): CtaPlacement[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const rows: CtaPlacement[] = [];
  for (const raw of value.slice(0, EXPO_V2_RULES.maxRows)) {
    const row = recordOf(raw);
    if (!isCanonicalId(row.id) || seen.has(row.id)) continue;
    seen.add(row.id);
    const campaignIds = Array.isArray(row.campaignIds)
      ? [...new Set(row.campaignIds.filter(isCanonicalId))].slice(0, EXPO_V2_RULES.maxRows)
      : [];
    const description = optionalLocalizedOf(row.description);
    rows.push({
      id: row.id, label: localizedOf(row.label), ...(description ? { description } : {}),
      destinationId: isCanonicalId(row.destinationId) ? row.destinationId : "",
      variant: (CTA_VARIANTS as readonly unknown[]).includes(row.variant) ? row.variant as CtaVariant : "primary",
      audience: (AUDIENCES as readonly unknown[]).includes(row.audience) ? row.audience as AudienceId : "all",
      campaignIds, priority: clamp(row.priority, -10_000, 10_000, rows.length),
      fallback: row.fallback === true, enabled: row.enabled !== false,
    });
  }
  return rows;
}

export function validateCtas(value: unknown, path: string, issues: FieldIssue[]): void {
  validateRows(value, path, issues, (row, rowPath, out) => {
    validateLocalized(row.label, `${rowPath}.label`, out);
    validateLocalized(row.description, `${rowPath}.description`, out);
    if (row.destinationId !== undefined && !isCanonicalId(row.destinationId)) out.push(structuralError(`${rowPath}.destinationId`, "invalid-shape", "목적지 식별자가 올바르지 않아요"));
    if (row.variant !== undefined && !(CTA_VARIANTS as readonly unknown[]).includes(row.variant)) out.push(structuralError(`${rowPath}.variant`, "invalid-token", "버튼 변형이 올바르지 않아요"));
    if (row.audience !== undefined && !(AUDIENCES as readonly unknown[]).includes(row.audience)) out.push(structuralError(`${rowPath}.audience`, "invalid-shape", "대상 그룹이 올바르지 않아요"));
    validateIdList(row.campaignIds, `${rowPath}.campaignIds`, out);
    validateNumber(row.priority, `${rowPath}.priority`, out);
    validateBoolean(row.fallback, `${rowPath}.fallback`, out);
    validateBoolean(row.enabled, `${rowPath}.enabled`, out);
  });
}

export interface ReferenceContext {
  campaigns: ReadonlyMap<string, CampaignConfig>;
  destinations: ReadonlyMap<string, DestinationConfig>;
}

export function imagePublishIssues(image: ExpoImageValue | undefined, path: string, required = false): FieldIssue[] {
  if (!image) return required ? [publishError(path, "missing-required-image", "공개할 이미지가 필요해요")] : [];
  const issues: FieldIssue[] = [];
  if (!isSafePublicUrl(image.url)) issues.push(publishError(`${path}.url`, "invalid-url", "공개 HTTPS 이미지 주소만 사용할 수 있어요"));
  if (image.originalUrl && !isSafePublicUrl(image.originalUrl)) issues.push(publishError(`${path}.originalUrl`, "invalid-url", "공개 HTTPS 이미지 주소만 사용할 수 있어요"));
  if (!stringOf(image.alt).trim() && image.decorative !== true) issues.push(publishError(`${path}.alt`, "missing-image-alt", "이미지 설명을 넣거나 장식용으로 표시해 주세요"));
  return issues;
}

export function imageWarnings(image: ExpoImageValue | undefined, path: string): FieldIssue[] {
  return image?.decorative === true && !stringOf(image.alt).trim()
    ? [contentWarning(`${path}.alt`, "decorative-empty-alt", "장식용 이미지는 빈 대체 텍스트로 공개돼요")]
    : [];
}

export function ctaPublishIssues(ctas: readonly CtaPlacement[], path: string, context: ReferenceContext): FieldIssue[] {
  const issues: FieldIssue[] = [];
  ctas.forEach((cta, index) => {
    if (!cta.enabled) return;
    const rowPath = `${path}[${index}]`;
    if (!hasLocalizedText(cta.label)) issues.push(publishError(`${rowPath}.label`, "required-text", "버튼 문구가 필요해요"));
    const destination = context.destinations.get(cta.destinationId);
    if (!destination?.enabled) issues.push(publishError(`${rowPath}.destinationId`, "invalid-destination-reference", "활성 목적지를 연결해 주세요"));
    cta.campaignIds.forEach((id, campaignIndex) => {
      if (!context.campaigns.get(id)?.enabled) issues.push(publishError(`${rowPath}.campaignIds[${campaignIndex}]`, "invalid-campaign-reference", "활성 캠페인을 연결해 주세요"));
    });
  });
  return issues;
}

export function ctaWarnings(ctas: readonly CtaPlacement[], path: string): FieldIssue[] {
  return ctas.some((cta) => cta.enabled && cta.fallback) ? []
    : [contentWarning(path, "no-fallback-cta", "활성 캠페인이 없을 때 보여 줄 대체 버튼이 없어요")];
}
