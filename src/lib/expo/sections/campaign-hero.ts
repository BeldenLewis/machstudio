import { isSafePublicUrl } from "@/lib/expo/destination";
import type { ExpoSection, FieldIssue, SectionPlugin, ValidateContext } from "@/lib/expo/types";
import {
  clamp, contentWarning, ctaPublishIssues, ctaWarnings, hasLocalizedText, imagePublishIssues, imageWarnings,
  isRecord, localizedOf, normalizeCtas, normalizeVideo, optionalLocalizedOf, publishError, recordOf,
  structuralError, validateBoolean, validateCtas, validateLocalized, validateNumber, validateVideoShape,
  type CampaignHeroContent, type ExpoVideoValue,
} from "@/lib/expo/sections/types";

type NormalizedCampaignHero = Omit<CampaignHeroContent, "video"> & {
  video?: ExpoVideoValue | Record<string, unknown>;
};

function normalizeIncompleteVideo(raw: unknown): Record<string, unknown> | undefined {
  if (!isRecord(raw)) return undefined;
  const out: Record<string, unknown> = {};
  if (raw.kind === "video") out.kind = "video";
  for (const key of ["url", "originalUrl", "mimeType", "rightsStatus"] as const) {
    if (typeof raw[key] === "string") out[key] = raw[key];
  }
  const poster = recordOf(raw.poster);
  if (Object.keys(poster).length > 0) out.poster = poster;
  return out;
}

function normalizeCampaignHero(raw: unknown, publicMode: boolean): NormalizedCampaignHero {
  const content = recordOf(raw);
  const typingLines = Array.isArray(content.typingLines)
    ? content.typingLines.slice(0, 100).map(localizedOf).filter(hasLocalizedText)
    : [];
  const typing = recordOf(content.typing);
  const eyebrow = optionalLocalizedOf(content.eyebrow);
  const video = normalizeVideo(content.video, publicMode)
    ?? (!publicMode ? normalizeIncompleteVideo(content.video) : undefined);
  return {
    ...(eyebrow ? { eyebrow } : {}),
    typingLines,
    accessibleHeadline: typingLines[0] ?? {},
    ...(video ? { video } : {}),
    overlay: clamp(content.overlay, 0, 0.9, 0.45),
    typing: {
      enabled: typing.enabled !== false,
      speedMs: clamp(typing.speedMs, 20, 300, 70),
      holdMs: clamp(typing.holdMs, 500, 10_000, 2_000),
    },
    ctas: normalizeCtas(content.ctas),
  };
}

function validateCampaignHero(section: ExpoSection): FieldIssue[] {
  if (!isRecord(section.content)) return [structuralError("", "invalid-shape", "히어로 내용의 모양이 올바르지 않아요")];
  const content = section.content;
  const issues: FieldIssue[] = [];
  validateLocalized(content.eyebrow, "eyebrow", issues);
  if (content.typingLines !== undefined) {
    if (!Array.isArray(content.typingLines)) issues.push(structuralError("typingLines", "invalid-shape", "타이핑 문구 목록의 모양이 올바르지 않아요"));
    else {
      if (content.typingLines.length > 100) issues.push(structuralError("typingLines", "too-many", "타이핑 문구는 100개까지 넣을 수 있어요"));
      content.typingLines.forEach((line, index) => validateLocalized(line, `typingLines[${index}]`, issues));
    }
  }
  validateLocalized(content.accessibleHeadline, "accessibleHeadline", issues);
  validateVideoShape(content.video, "video", issues);
  validateNumber(content.overlay, "overlay", issues);
  if (content.typing !== undefined) {
    if (!isRecord(content.typing)) issues.push(structuralError("typing", "invalid-shape", "타이핑 설정의 모양이 올바르지 않아요"));
    else {
      validateBoolean(content.typing.enabled, "typing.enabled", issues);
      validateNumber(content.typing.speedMs, "typing.speedMs", issues);
      validateNumber(content.typing.holdMs, "typing.holdMs", issues);
    }
  }
  validateCtas(content.ctas, "ctas", issues);
  return issues;
}

export function campaignHeroPublishIssues(section: ExpoSection, context: ValidateContext): FieldIssue[] {
  const content = normalizeCampaignHero(section.content, false);
  const issues: FieldIssue[] = [];
  if (!hasLocalizedText(content.accessibleHeadline)) issues.push(publishError("typingLines", "required-text", "히어로 문구가 하나 이상 필요해요"));
  const video = normalizeVideo(content.video, false);
  if (content.video !== undefined && !video) {
    issues.push(publishError("video", "invalid-hero-video", "Hero 영상의 MP4 정보가 완전하지 않아요"));
  } else if (video) {
    if (!isSafePublicUrl(video.url)) issues.push(publishError("video.url", "invalid-url", "공개 HTTPS 영상 주소만 사용할 수 있어요"));
    if (!isSafePublicUrl(video.originalUrl)) issues.push(publishError("video.originalUrl", "invalid-url", "공개 HTTPS 원본 영상 주소만 사용할 수 있어요"));
    issues.push(...imagePublishIssues(video.poster, "video.poster"));
  }
  issues.push(...ctaPublishIssues(content.ctas, "ctas", context));
  return issues;
}

export function campaignHeroWarnings(section: ExpoSection): FieldIssue[] {
  const content = normalizeCampaignHero(section.content, false);
  const issues = [...ctaWarnings(content.ctas, "ctas")];
  const video = recordOf(content.video);
  if (video.rightsStatus === "unconfirmed") {
    issues.push(contentWarning("video.rightsStatus", "unconfirmed-video-rights", "영상 사용 권리를 아직 확인하지 않았어요"));
  }
  issues.push(...imageWarnings(normalizeVideo(content.video, false)?.poster, "video.poster"));
  return issues;
}

export const campaignHeroPlugin: SectionPlugin = {
  type: "campaign-hero",
  label: "STK 캠페인 히어로",
  variants: [{ id: "default", label: "기본" }],
  slots: [],
  multi: false,
  pinnedFirst: true,
  design: { bg: ["dark", "light"], align: ["left", "center"] },
  normalize(content, context) {
    return normalizeCampaignHero(content, context.mode === "public") as unknown as Record<string, unknown>;
  },
  validate: validateCampaignHero,
  hasContent(section) {
    return hasLocalizedText(normalizeCampaignHero(section.content, false).accessibleHeadline);
  },
};

export const CAMPAIGN_HERO_PLUGIN = campaignHeroPlugin;
