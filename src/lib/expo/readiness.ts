/**
 * "왜 아직 안 나가는가" 를 **운영자 말로** 만든다.
 *
 * 발행 버튼이 회색인 이유, 스니펫이 안 보이는 이유, 공개 스위치를 켰는데 화면이 빈 이유 —
 * 전부 같은 모델에서 파생시킨다. 화면마다 따로 판단하면 "버튼은 눌리는데 아무 일도 안 일어나는"
 * 상태가 생기고, 그건 비개발자에게 고장으로 읽힌다.
 *
 * 문구를 여기 두는 이유: 이유와 문구가 갈리면 새 사유를 추가할 때 한쪽만 고쳐진다.
 *
 * **용어:** 화면에 나가는 문구는 전부 "구획" 이다. 코드 안에서는 `section` 이지만 편집기가
 * 사용자에게 보여 주는 말은 "구획" 하나뿐이라(카탈로그·카드·토글·개수 경고), 여기서만 "섹션"
 * 이라고 하면 같은 화면에 두 이름이 뜬다.
 */
import { hasContent } from "@/lib/expo/model";
import { normalizeExpoPage } from "@/lib/expo/config";
import { sectionDef } from "@/lib/expo/registry";
import { validatePageDraft } from "@/lib/expo/request";
import { campaignHeroPublishIssues, campaignHeroWarnings } from "@/lib/expo/sections/campaign-hero";
import { exhibitionGridPublishIssues, exhibitionGridWarnings } from "@/lib/expo/sections/exhibition-grid";
import { audienceLinksPublishIssues, audienceLinksWarnings } from "@/lib/expo/sections/audience-links";
import { speakerCarouselPublishIssues, speakerCarouselWarnings } from "@/lib/expo/sections/speaker-carousel";
import { sponsorMarqueePublishIssues, sponsorMarqueeWarnings } from "@/lib/expo/sections/sponsor-marquee";
import { ctaBandPublishIssues, ctaBandWarnings } from "@/lib/expo/sections/cta-band";
import type { ExpoSection, FieldIssue, ValidateContext } from "@/lib/expo/types";

export type ReadinessCode =
  | "no-sections"
  | "no-renderable-section"
  | "empty-enabled-section"
  | "not-published"
  | "draft-ahead-of-published"
  | "section-not-published"
  | "section-embed-off"
  | "section-empty"
  | "no-imweb-url"
  /** 릴리스 승인 전이라 공개 스위치를 켤 수 없다. 끄는 것은 언제나 된다. */
  | "launch-locked-live"
  /** 릴리스 승인 전이라 구획 단독 내보내기를 켤 수 없다. */
  | "launch-locked-embed";

export interface ReadinessIssue {
  code: ReadinessCode;
  /** 해당 섹션이 있으면 — 편집기가 그 카드로 데려간다. */
  sid?: string;
  message: string;
}

const MESSAGES: Record<ReadinessCode, string> = {
  "no-sections": "아직 구획이 없어요. 키비주얼이나 본문부터 추가해 보세요.",
  "no-renderable-section": "내보낼 구획이 없어요 — 켜져 있고 내용이 찬 구획이 하나는 있어야 해요.",
  "empty-enabled-section": "켜져 있는데 내용이 비어 있어요. 이 구획은 화면에 나가지 않아요.",
  "not-published": "아직 발행하지 않았어요. 발행해야 밖으로 나갈 사본이 만들어져요.",
  "draft-ahead-of-published": "발행 뒤에 고친 내용이 있어요. 다시 발행해야 밖에 반영돼요.",
  "section-not-published": "이 구획은 발행본에 없어요. 페이지를 발행하면 코드를 복사할 수 있어요.",
  "section-embed-off": "'이 구획만 따로 내보내기' 가 꺼져 있어요.",
  "section-empty": "내용이 비어 있어 붙여도 아무것도 나오지 않아요.",
  "no-imweb-url": "아임웹 페이지 주소가 없어요. 다른 페이지에서 이 페이지로 링크를 걸 수 없어요.",
  "launch-locked-live": "아직 아임웹 공개가 열리지 않았어요. 준비가 끝나면 이 스위치를 켤 수 있어요.",
  "launch-locked-embed": "아직 아임웹 공개가 열리지 않아 '이 구획만 따로 내보내기' 를 켤 수 없어요. 끄는 것은 언제든 돼요.",
};

/** 라우트가 릴리스 잠금 사유를 만들 때 쓴다. 문구가 갈라지지 않게 여기서만 만든다. */
export function launchLockIssue(
  code: "launch-locked-live" | "launch-locked-embed", sid?: string,
): ReadinessIssue {
  return issue(code, sid);
}

const issue = (code: ReadinessCode, sid?: string): ReadinessIssue => ({ code, sid, message: MESSAGES[code] });

export interface PageReadinessInput {
  draft: unknown;
  published: unknown;
  publishedAt: Date | string | null;
  updatedAt: Date | string | null;
  imwebUrl: string | null;
}

/**
 * **발행할 수 있는가.** draft 를 본다 — 발행은 draft 를 밖에 내보낼 사본으로 굳히는 일이다.
 */
export function publishErrors(draftRaw: unknown): FieldIssue[] {
  if (draftRaw && typeof draftRaw === "object" && !Array.isArray(draftRaw)
    && Array.isArray((draftRaw as { sections?: unknown }).sections)
    && (draftRaw as { sections: unknown[] }).sections.length === 0) {
    return [{ ...issue("no-sections"), path: "sections", severity: "error" }];
  }
  const strict = validatePageDraft(draftRaw);
  if (!strict.ok) return strict.errors.map((error) => ({ ...error, severity: "error" as const }));

  const config = normalizeExpoPage(draftRaw);
  const { sections } = config;
  if (sections.length === 0) return [{ ...issue("no-sections"), path: "sections", severity: "error" }];

  const campaigns = new Map((config.settings?.campaigns ?? []).map((campaign) => [campaign.id, campaign]));
  const destinations = new Map((config.settings?.destinations ?? []).map((destination) => [destination.id, destination]));

  const out: FieldIssue[] = [];
  for (const [index, s] of sections.entries()) {
    if (s.enabled && !hasContent(s)) {
      out.push({
        ...issue("empty-enabled-section", s.sid),
        path: `sections[${index}].content`,
        severity: "error",
      });
    }
    if (s.enabled) {
      const context: ValidateContext = { config, sectionIndex: index, campaigns, destinations };
      const relative = sectionPublishIssues(s, context);
      out.push(...relative.map((entry) => qualifyPluginIssue(entry, index, s.sid)));
    }
  }
  if (!sections.some((s) => s.enabled && hasContent(s))) {
    out.push({ ...issue("no-renderable-section"), path: "sections", severity: "error" });
  }
  return out;
}

function qualifyPluginIssue(entry: FieldIssue, index: number, sid: string): FieldIssue {
  const base = `sections[${index}]`;
  const clean = entry.path.trim().replace(/^\.+/, "");
  const path = !clean ? `${base}.content`
    : clean === "content" || clean.startsWith("content.") ? `${base}.${clean}`
      : `${base}.content.${clean}`;
  return { ...entry, path, sid };
}

function sectionPublishIssues(section: ExpoSection, context: ValidateContext): FieldIssue[] {
  switch (section.type) {
    case "campaign-hero": return campaignHeroPublishIssues(section, context);
    case "exhibition-grid": return exhibitionGridPublishIssues(section, context);
    case "audience-links": return audienceLinksPublishIssues(section, context);
    case "speaker-carousel": return speakerCarouselPublishIssues(section, context);
    case "sponsor-marquee": return sponsorMarqueePublishIssues(section, context);
    case "cta-band": return ctaBandPublishIssues(section, context);
    default: return [];
  }
}

function sectionWarnings(section: ExpoSection): FieldIssue[] {
  switch (section.type) {
    case "campaign-hero": return campaignHeroWarnings(section);
    case "exhibition-grid": return exhibitionGridWarnings(section);
    case "audience-links": return audienceLinksWarnings(section);
    case "speaker-carousel": return speakerCarouselWarnings(section);
    case "sponsor-marquee": return sponsorMarqueeWarnings(section);
    case "cta-band": return ctaBandWarnings(section);
    default: return [];
  }
}

/** 콘텐츠 품질 안내. 이 배열은 발행 트랜잭션의 거절 분기로 전달하지 않는다. */
export function contentWarnings(configRaw: unknown): FieldIssue[] {
  const config = normalizeExpoPage(configRaw);
  return config.sections.flatMap((section, index) =>
    sectionWarnings(section).map((entry) => qualifyPluginIssue(entry, index, section.sid)));
}

/**
 * **공개 스위치를 켜도 되는가.** published 를 본다 — 스위치는 발행본을 내보내는 것이지
 * 편집 중인 것을 내보내는 게 아니다.
 */
export function liveIssues(publishedRaw: unknown): ReadinessIssue[] {
  if (!publishedRaw) return [issue("not-published")];
  const { sections } = normalizeExpoPage(publishedRaw);
  if (!sections.some((s) => s.enabled && hasContent(s))) return [issue("no-renderable-section")];
  return [];
}

/**
 * **이 섹션의 코드를 복사할 수 있는가.**
 *
 * 페이지 공개 여부를 보지 않는다 — 부분 이행은 "페이지는 아직인데 이 섹션만 먼저" 다.
 * 대신 발행본에 있어야 하고, 따로 붙이기가 켜져 있어야 하고, 내용이 있어야 한다.
 */
export function sectionSnippetIssues(publishedRaw: unknown, sid: string): ReadinessIssue[] {
  if (!publishedRaw) return [issue("not-published", sid)];
  const found = normalizeExpoPage(publishedRaw).sections.find((s) => s.sid === sid);
  if (!found) return [issue("section-not-published", sid)];

  const out: ReadinessIssue[] = [];
  if (!found.embedEnabled) out.push(issue("section-embed-off", sid));
  if (!hasContent(found)) out.push(issue("section-empty", sid));
  return out;
}

/**
 * 발행 뒤에 또 고쳤는가 — "발행했는데 왜 그대로예요?" 를 화면에서 먼저 말해 준다.
 * 시각 비교라 초 단위 오차에 민감하지 않게 1초 여유를 둔다.
 */
export function hasUnpublishedChanges(input: Pick<PageReadinessInput, "publishedAt" | "updatedAt">): boolean {
  if (!input.publishedAt) return false;
  if (!input.updatedAt) return false;
  const published = new Date(input.publishedAt).getTime();
  const updated = new Date(input.updatedAt).getTime();
  if (Number.isNaN(published) || Number.isNaN(updated)) return false;
  return updated - published > 1000;
}

/** 페이지 카드 한 장이 보여줄 것 전부. */
export function pageReadiness(input: PageReadinessInput) {
  const publish = publishErrors(input.draft);
  const live = liveIssues(input.published);
  const stale = hasUnpublishedChanges(input);
  const extra: ReadinessIssue[] = [];
  if (stale) extra.push(issue("draft-ahead-of-published"));
  if (!input.imwebUrl) extra.push(issue("no-imweb-url"));

  return {
    canPublish: publish.length === 0,
    canGoLive: live.length === 0,
    publishIssues: publish,
    liveIssues: live,
    notes: extra,
  };
}

/** 편집기가 섹션 카드에 붙이는 한 줄 — 켜져 있는데 안 나가는 경우를 미리 알린다. */
export function sectionNotice(section: ExpoSection): string | null {
  if (!sectionDef(section.type)) return null;
  if (section.enabled && !hasContent(section)) return MESSAGES["empty-enabled-section"];
  return null;
}

export { MESSAGES as EXPO_READINESS_MESSAGES };
