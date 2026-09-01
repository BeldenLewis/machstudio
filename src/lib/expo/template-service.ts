/**
 * 템플릿 저장·복제의 **순서와 체크리스트** — DB 와 Storage 를 모른 채 둔다.
 *
 * ── 왜 순서가 규칙이 되나 ─────────────────────────────────────────────
 * 이 작업은 두 저장소를 건드린다(Storage 복사 + DB 한 트랜잭션). 둘 중 하나만 성공하면
 * **DB 에는 있는데 이미지가 없는 템플릿**이나 **아무도 안 가리키는 파일 더미**가 남는다.
 * 그래서 식별자를 먼저 발급하고 → 미디어를 복사하고 → 트랜잭션을 한 번 돌린다.
 * 어디서 실패하든 되돌릴 대상이 이번 작업이 만든 것으로 한정된다.
 *
 * ── 체크리스트는 기능이다 ─────────────────────────────────────────────
 * 템플릿은 이전 전시의 사전등록 소스·아임웹 주소를 **일부러 안 가져간다**(template.ts).
 * 그 사실을 화면이 말해 주지 않으면, 운영자는 다 된 줄 알고 발행한다. 그래서 무엇을
 * 다시 연결해야 하는지 목록으로 돌려준다.
 */
import { buildExpoTemplate, instantiateExpoTemplate, type TemplateContentMode, type TemplateSnapshot, type SourcePage, type InstantiatedPage } from "@/lib/expo/template";
import { collectExpoMediaUrls, rewriteExpoMediaUrls, type NotCopiedMedia } from "@/lib/expo/media";
import type { ExpoTheme } from "@/lib/expo/types";

export const TEMPLATE_NAME_MAX = 120;
export const TEMPLATE_DESCRIPTION_MAX = 500;

export interface TemplateMeta {
  name: string;
  description: string | null;
  contentMode: TemplateContentMode;
}

/** 이름 없는 템플릿은 목록에서 고를 수 없다 — 자르지 않고 거절한다. */
export function normalizeTemplateMeta(
  body: Record<string, unknown>,
): { ok: true; value: TemplateMeta } | { ok: false; field: string; message: string } {
  const name = String(body.name ?? "").trim();
  if (!name) return { ok: false, field: "name", message: "템플릿 이름을 입력해 주세요" };
  if (name.length > TEMPLATE_NAME_MAX) {
    return { ok: false, field: "name", message: `이름은 ${TEMPLATE_NAME_MAX}자까지예요` };
  }

  const rawDescription = String(body.description ?? "").trim();
  if (rawDescription.length > TEMPLATE_DESCRIPTION_MAX) {
    return { ok: false, field: "description", message: `설명은 ${TEMPLATE_DESCRIPTION_MAX}자까지예요` };
  }

  // 기본은 구조만이다 — 문구까지 가져가는 것은 **명시적으로** 고른 경우만.
  const contentMode: TemplateContentMode = body.contentMode === "full" ? "full" : "design";
  return { ok: true, value: { name, description: rawDescription || null, contentMode } };
}

// ── 체크리스트 ──────────────────────────────────────────────────────────

export type ChecklistCode =
  | "source-ref"          // 사전등록 소스를 새로 골라야 한다
  | "internal-link"       // 비운 내부·아임웹 링크가 있다
  | "external-media"      // 우리가 소유하지 않은 이미지가 있다
  | "imweb-url";          // 새 사이트의 아임웹 주소를 연결해야 한다

export interface ChecklistItem {
  code: ChecklistCode;
  message: string;
}

interface ChecklistInput {
  registerFormSections: number;
  linksCleared: boolean;
  externalMedia: readonly NotCopiedMedia[];
  /** 인스턴스화에서만 켠다 — 저장할 때는 원본에 이미 주소가 있다. */
  needsImwebUrls?: boolean;
}

/** 사람이 읽고 바로 할 일을 아는 문장으로. 화면이 이걸 그대로 쓴다. */
export function reconnectChecklist(input: ChecklistInput): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  if (input.registerFormSections > 0) {
    items.push({
      code: "source-ref",
      message: `사전등록 폼 ${input.registerFormSections}개에 이 전시의 사전등록 소스를 다시 골라 주세요`,
    });
  }
  if (input.linksCleared) {
    items.push({ code: "internal-link", message: "가리킬 곳이 없어 비워 둔 링크가 있어요. 버튼 링크를 확인해 주세요" });
  }
  if (input.externalMedia.length > 0) {
    items.push({
      code: "external-media",
      message: `밖에서 가져온 이미지 ${input.externalMedia.length}개는 그 사이트가 지우면 같이 사라져요. Mach 에 올려 두는 걸 권해요`,
    });
  }
  if (input.needsImwebUrls) {
    items.push({ code: "imweb-url", message: "각 페이지에 이 전시의 아임웹 주소를 연결해 주세요" });
  }
  return items;
}

const countRegisterForms = (sections: ReadonlyArray<{ type: string }>): number =>
  sections.filter((s) => s.type === "register-form").length;

// ── 저장(사이트 → 템플릿) ───────────────────────────────────────────────

export interface TemplateSavePlan {
  snapshot: TemplateSnapshot;
  /** 복사 대상 후보. 소유 판정은 media.copyExpoMedia 가 한다. */
  mediaUrls: string[];
  linksCleared: boolean;
  registerFormSections: number;
}

export function planTemplateSave(input: {
  theme: unknown;
  pages: SourcePage[];
  contentMode: TemplateContentMode;
  siteImwebUrls?: string[];
}): TemplateSavePlan {
  const { snapshot, checklist } = buildExpoTemplate(input);
  const sections = snapshot.pages.flatMap((p) => p.sections);
  return {
    snapshot,
    // `design` 모드는 content 가 없어 미디어도 없다 — 자연히 빈 목록이 된다.
    mediaUrls: collectExpoMediaUrls(sections),
    linksCleared: checklist.internalLinksNeedReview,
    registerFormSections: countRegisterForms(sections),
  };
}

/** 복사한 주소로 스냅샷을 다시 가리킨다. 페이지 구조는 그대로 둔다. */
export function applyMediaToSnapshot(
  snapshot: TemplateSnapshot,
  map: ReadonlyMap<string, string>,
): TemplateSnapshot {
  if (map.size === 0) return snapshot;
  return {
    ...snapshot,
    pages: snapshot.pages.map((page) => ({ ...page, sections: rewriteExpoMediaUrls(page.sections, map) })),
  };
}

// ── 복제(템플릿 → 새 사이트) ────────────────────────────────────────────

export interface TemplateInstantiatePlan {
  theme: ExpoTheme;
  defaultLocale: "ko";
  pages: InstantiatedPage[];
  mediaUrls: string[];
  linksCleared: boolean;
  registerFormSections: number;
}

export function planTemplateInstantiate(snapshot: unknown): TemplateInstantiatePlan {
  const result = instantiateExpoTemplate(snapshot);
  const sections = result.pages.flatMap((p) => p.draft.sections);
  return {
    theme: result.theme,
    defaultLocale: result.defaultLocale,
    pages: result.pages,
    mediaUrls: collectExpoMediaUrls(sections),
    linksCleared: result.checklist.internalLinksNeedReview,
    registerFormSections: countRegisterForms(sections),
  };
}

export function applyMediaToPages(
  pages: InstantiatedPage[],
  map: ReadonlyMap<string, string>,
): InstantiatedPage[] {
  if (map.size === 0) return pages;
  return pages.map((page) => ({
    ...page,
    draft: { ...page.draft, sections: rewriteExpoMediaUrls(page.draft.sections, map) },
  }));
}
