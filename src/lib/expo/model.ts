/**
 * 홈페이지의 **상태 판정** — 무엇이 공개로 나가고 무엇이 안 나가는가.
 *
 * 목록·트리 상태점·이행 현황·로더가 전부 이 파일만 읽는다. 판정이 두 곳에 있으면
 * 화면은 "공개중" 인데 로더는 아무것도 안 주는 상태가 반드시 생긴다.
 *
 * ── 두 개의 문 ────────────────────────────────────────────────────────
 * **발행**(published 스냅샷)이 "밖에 나갈 수 있는 사본을 만드는 것" 이고,
 * **공개 스위치**(liveAt / embedEnabled)가 "실제로 나가는 것" 이다. 둘을 나눠야
 * "페이지는 아직인데 히어로 섹션만 아임웹에 먼저" 라는 부분 이행이 성립한다.
 */
import { localize, type Localized } from "@/lib/collect-form-config";
import { sectionDef } from "@/lib/expo/registry";
import { normalizeExpoPage } from "@/lib/expo/config";
import type { ExpoPageConfig, ExpoPageState, ExpoSection, SlotDef } from "@/lib/expo/types";

/** 상태 판정에 필요한 최소한의 페이지 필드 — Prisma 레코드를 통째로 받지 않는다. */
export interface PageStateInput {
  published: unknown;
  liveAt: Date | string | null;
}

/**
 * 이 슬롯에 **볼 만한 값**이 들어 있는가. 이중 게이트의 "내용 있음" 절반이다.
 * 발행 게이트(서버)와 런타임 방어 재검이 같은 함수를 읽어야 두 판정이 안 갈린다.
 */
export function slotHasContent(def: SlotDef, value: unknown): boolean {
  if (value === undefined || value === null) return false;
  switch (def.kind) {
    case "text":
    case "textarea":
      return Object.values(value as Localized).some((v) => String(v).trim() !== "");
    case "code":
      return String(value).trim() !== "";
    case "media":
      return typeof (value as { url?: string }).url === "string" && (value as { url: string }).url !== "";
    case "link": {
      const l = value as { label?: string; href?: string };
      return Boolean(l.href);
    }
    case "sourceRef":
      return String(value).trim() !== "";
    case "list":
      return Array.isArray(value) && value.length > 0;
  }
}

/**
 * 섹션에 내용이 있는가 — **필수 슬롯 기준**이다.
 *
 * 필수 슬롯이 정의돼 있으면 그게 다 차야 한다(제목 없는 히어로는 빈 껍데기다).
 * 필수가 없는 타입은 아무 슬롯이라도 차 있으면 된다.
 */
export function hasContent(section: ExpoSection): boolean {
  const def = sectionDef(section.type);
  if (!def) return false;
  if (def.hasContent) {
    try { return def.hasContent(section); } catch { return false; }
  }
  const required = def.slots.filter((s) => s.required);
  if (required.length > 0) return required.every((s) => slotHasContent(s, section.content[s.key]));
  return def.slots.some((s) => slotHasContent(s, section.content[s.key]));
}

/**
 * 운영자가 보는 페이지 상태.
 *
 * - `draft` — 발행 사본이 없다. 로더는 아무것도 안 준다.
 * - `published` — 사본은 있는데 스위치가 꺼져 있다. **스니펫을 미리 붙여 둘 수 있다**
 *   (붙여도 안 나온다). 전환일에 스위치만 켜면 되므로 준비와 전환이 분리된다.
 * - `live` — 실제로 나간다.
 */
export function derivePageState(page: PageStateInput): ExpoPageState {
  if (!page.published) return "draft";
  return page.liveAt ? "live" : "published";
}

/**
 * 페이지 통짜 임베드로 나갈 섹션들.
 * 발행본을 읽고, 토글이 켜져 있고 내용이 있는 것만 남긴다(이중 게이트).
 */
export function renderableSections(publishedRaw: unknown): ExpoSection[] {
  const config: ExpoPageConfig = normalizeExpoPage(publishedRaw);
  return config.sections.filter((s) => s.enabled && hasContent(s));
}

/**
 * 섹션 단독 임베드로 나갈 섹션 하나.
 *
 * **페이지의 `liveAt` 과 섹션의 `enabled` 를 보지 않는다** — 그게 부분 이행의 정의다.
 * 대신 발행본에 있고, `embedEnabled` 가 켜져 있고, 내용이 있어야 한다.
 */
export function standaloneSection(publishedRaw: unknown, sid: string): ExpoSection | null {
  const config = normalizeExpoPage(publishedRaw);
  const found = config.sections.find((s) => s.sid === sid);
  if (!found) return null;
  if (!found.embedEnabled) return null;
  if (!hasContent(found)) return null;
  return found;
}

/**
 * 제목에서 slug 를 만든다. 어드민 표시·미리보기용이고 **임베드 URL 에는 쓰지 않는다**
 * (운영자가 바꾸는 값이라 파트너 사이트에 박힌 주소가 끊긴다).
 */
export function slugFromTitle(title: string, taken: Iterable<string> = []): string {
  const base = String(title ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "page";

  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

/** 사이트를 만들 때 딸려 오는 홈 페이지의 기본값. */
export function homePageDefaults(locale = "ko") {
  return {
    slug: "home",
    title: locale === "ko" ? "홈" : "Home",
    isHome: true,
    sortOrder: 0,
    draft: { schemaVersion: 2, sections: [] } satisfies ExpoPageConfig,
  };
}

/** 페이지 제목 표시용 — 로케일 맵이 아니라 평문 컬럼이지만, 빈 값 대비를 한 곳에서 한다. */
export function pageTitleOf(title: string, fallback = "제목 없음"): string {
  const t = String(title ?? "").trim();
  return t || fallback;
}

export { localize };
