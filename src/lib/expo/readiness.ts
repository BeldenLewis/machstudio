/**
 * "왜 아직 안 나가는가" 를 **운영자 말로** 만든다.
 *
 * 발행 버튼이 회색인 이유, 스니펫이 안 보이는 이유, 공개 스위치를 켰는데 화면이 빈 이유 —
 * 전부 같은 모델에서 파생시킨다. 화면마다 따로 판단하면 "버튼은 눌리는데 아무 일도 안 일어나는"
 * 상태가 생기고, 그건 비개발자에게 고장으로 읽힌다.
 *
 * 문구를 여기 두는 이유: 이유와 문구가 갈리면 새 사유를 추가할 때 한쪽만 고쳐진다.
 */
import { hasContent } from "@/lib/expo/model";
import { normalizeExpoPage } from "@/lib/expo/config";
import { sectionDef } from "@/lib/expo/registry";
import type { ExpoSection } from "@/lib/expo/types";

export type ReadinessCode =
  | "no-sections"
  | "no-renderable-section"
  | "empty-enabled-section"
  | "not-published"
  | "draft-ahead-of-published"
  | "section-not-published"
  | "section-embed-off"
  | "section-empty"
  | "no-imweb-url";

export interface ReadinessIssue {
  code: ReadinessCode;
  /** 해당 섹션이 있으면 — 편집기가 그 카드로 데려간다. */
  sid?: string;
  message: string;
}

const MESSAGES: Record<ReadinessCode, string> = {
  "no-sections": "아직 섹션이 없어요. 키비주얼이나 본문부터 추가해 보세요.",
  "no-renderable-section": "내보낼 섹션이 없어요 — 켜져 있고 내용이 찬 섹션이 하나는 있어야 해요.",
  "empty-enabled-section": "켜져 있는데 내용이 비어 있어요. 이 섹션은 화면에 나가지 않아요.",
  "not-published": "아직 발행하지 않았어요. 발행해야 밖으로 나갈 사본이 만들어져요.",
  "draft-ahead-of-published": "발행 뒤에 고친 내용이 있어요. 다시 발행해야 밖에 반영돼요.",
  "section-not-published": "이 섹션은 발행본에 없어요. 페이지를 발행하면 코드를 복사할 수 있어요.",
  "section-embed-off": "이 섹션의 '따로 붙이기' 가 꺼져 있어요.",
  "section-empty": "내용이 비어 있어 붙여도 아무것도 나오지 않아요.",
  "no-imweb-url": "아임웹 페이지 주소가 없어요. 다른 페이지에서 이 페이지로 링크를 걸 수 없어요.",
};

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
export function publishIssues(draftRaw: unknown): ReadinessIssue[] {
  const { sections } = normalizeExpoPage(draftRaw);
  if (sections.length === 0) return [issue("no-sections")];

  const out: ReadinessIssue[] = [];
  for (const s of sections) {
    if (s.enabled && !hasContent(s)) out.push(issue("empty-enabled-section", s.sid));
  }
  if (!sections.some((s) => s.enabled && hasContent(s))) out.push(issue("no-renderable-section"));
  return out;
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
  const publish = publishIssues(input.draft);
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
