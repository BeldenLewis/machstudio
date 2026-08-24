/**
 * 홈페이지 설정의 **정규화** — 저장된 JSON → 화면·렌더가 믿을 수 있는 모양.
 *
 * ── 총 함수다 ─────────────────────────────────────────────────────────
 * 저장된 값은 무엇이든 올 수 있다(직접 고친 JSON, 옛 버전, 깨진 값). 그중 하나가 던지면
 * 그 페이지는 어드민에서도 공개에서도 **영영 안 열린다**. 그래서 절대 던지지 않고,
 * 모르는 것은 조용히 버린다.
 *
 * ── 신원은 지어내지 않는다 ────────────────────────────────────────────
 * 섹션 `sid` 는 섹션 단위 스니펫 URL 이 참조하는 값이다. 없는 sid 에 새 UUID 를 붙이면
 * 그 섹션이 매 로드마다 다른 것이 되어 파트너 사이트에 박힌 코드가 영영 안 맞는다.
 * 그래서 **유효하지 않으면 버리고**, 유효하면 **절대 바꾸지 않는다**.
 *
 * ── 여기서 자르는 것과 라우트가 거절하는 것은 다르다 ──────────────────
 * 이 함수의 자르기는 **이미 저장된** 값에 대한 방어다. 새로 들어오는 쓰기는 라우트가
 * 구조화된 오류로 **거절**해야 한다 — 운영자가 입력한 것을 말없이 잘라 저장하면 안 된다.
 */
import { toLocalized, type Localized } from "@/lib/collect-form-config";
import { safeHttpUrl } from "@/lib/webinar-config";
import { normalizeHexColor } from "@/lib/color";
import { EXPO_LIMITS, resolveVariant, sectionDef } from "@/lib/expo/registry";
import type { ExpoPageConfig, ExpoSection, ExpoTheme, SlotDef } from "@/lib/expo/types";

/** 기본 테마 — 색이 없어 화면이 깨지는 것보다 낫다. */
export const EXPO_DEFAULT_THEME: ExpoTheme = { accent: "#1f3a5f", lightBg: "#ffffff", darkBg: "#111318" };

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

/** UUID 모양인가 — 형식만 본다(버전까지 따지면 옛 값이 통째로 날아간다). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isSid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** UTF-8 바이트 기준으로 자른다 — 문자 수로 자르면 한글에서 상한을 넘는다. */
function clampBytes(value: string, maxBytes: number): string {
  if (value.length <= maxBytes / 4) return value; // 최악(4바이트)이어도 안전한 구간
  const enc = new TextEncoder();
  if (enc.encode(value).length <= maxBytes) return value;
  let lo = 0, hi = value.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (enc.encode(value.slice(0, mid)).length <= maxBytes) lo = mid; else hi = mid - 1;
  }
  return value.slice(0, lo);
}

function normalizeLocalizedText(value: unknown, maxChars: number): Localized | undefined {
  const map = toLocalized(value);
  const out: Localized = {};
  for (const [locale, text] of Object.entries(map)) {
    const trimmed = str(text).slice(0, maxChars);
    if (trimmed.trim() !== "") out[locale] = trimmed;
  }
  return Object.keys(out).length ? out : undefined;
}

function normalizeSlot(def: SlotDef, raw: unknown): unknown {
  switch (def.kind) {
    case "text":
      return normalizeLocalizedText(raw, EXPO_LIMITS.textChars);

    case "textarea": {
      // 줄바꿈은 보존한다 — 사용자 텍스트다(AGENTS.md 공통).
      const map = toLocalized(raw);
      const out: Localized = {};
      for (const [locale, text] of Object.entries(map)) {
        const clamped = clampBytes(str(text), EXPO_LIMITS.longTextBytes);
        if (clamped.trim() !== "") out[locale] = clamped;
      }
      return Object.keys(out).length ? out : undefined;
    }

    case "code": {
      // 로케일 맵이 아니다 — 코드에 번역은 없다.
      const code = clampBytes(str(raw), EXPO_LIMITS.longTextBytes);
      return code.trim() === "" ? undefined : code;
    }

    case "media": {
      const m = obj(raw);
      // W1 은 이미지만. 영상·YouTube 는 W2 다.
      if (m.kind !== "image") return undefined;
      const url = safeHttpUrl(m.url);
      if (!url) return undefined;
      const alt = str(m.alt).slice(0, EXPO_LIMITS.textChars);
      return alt ? { kind: "image", url, alt } : { kind: "image", url };
    }

    case "link": {
      const l = obj(raw);
      const rawHref = str(l.href).trim();
      // 내부 참조는 렌더 시점에 푼다(payload.ts) — 여기서는 모양만 지킨다.
      const href = rawHref.startsWith("page:") ? rawHref.slice(0, 200) : safeHttpUrl(rawHref);
      const label = str(l.label).slice(0, EXPO_LIMITS.textChars);
      if (!label && !href) return undefined;
      return { label, href };
    }

    case "sourceRef": {
      const id = str(raw).trim().slice(0, 64);
      return id || undefined;
    }

    case "list": {
      if (!Array.isArray(raw) || !def.itemSlots) return undefined;
      const rows: Array<Record<string, unknown>> = [];
      for (const row of raw.slice(0, EXPO_LIMITS.rowsPerList)) {
        const src = obj(row);
        const out: Record<string, unknown> = {};
        for (const slot of def.itemSlots) {
          const v = normalizeSlot(slot, src[slot.key]);
          if (v !== undefined) out[slot.key] = v;
        }
        // 필수 슬롯이 빈 행은 버린다 — 화면에 빈 카드가 생기면 고장으로 보인다.
        const missingRequired = def.itemSlots.some((s) => s.required && out[s.key] === undefined);
        if (missingRequired) continue;
        if (Object.keys(out).length === 0) continue;
        rows.push(out);
      }
      return rows.length ? rows : undefined;
    }
  }
}

function normalizeSection(raw: unknown): ExpoSection | null {
  const s = obj(raw);
  if (!isSid(s.sid)) return null;               // 신원을 지어내지 않는다
  const def = sectionDef(str(s.type));
  if (!def) return null;                        // 모르는 타입은 버린다

  const content: Record<string, unknown> = {};
  const srcContent = obj(s.content);
  for (const slot of def.slots) {
    const v = normalizeSlot(slot, srcContent[slot.key]);
    if (v !== undefined) content[slot.key] = v;
  }

  const design: Record<string, string> = {};
  const srcDesign = obj(s.design);
  for (const [key, allowed] of Object.entries(def.design ?? {})) {
    const v = str(srcDesign[key]);
    design[key] = allowed.includes(v) ? v : allowed[0];
  }

  return {
    sid: s.sid,
    type: def.type,
    variant: resolveVariant(def, s.variant),
    enabled: s.enabled !== false,
    // 밖으로 나가는 스위치는 **명시적으로 켠 것만** true 다.
    embedEnabled: s.embedEnabled === true,
    design,
    content,
  };
}

/**
 * 페이지 하나(draft 또는 published)를 정규화한다.
 *
 * 다중성·배치 규칙(kv 는 하나이고 맨 위, toolbox·register-form 은 하나)도 여기서 강제한다 —
 * 렌더가 그 규칙을 다시 확인하지 않아도 되게.
 */
export function normalizeExpoPage(raw: unknown): ExpoPageConfig {
  const src = obj(raw);
  const list = Array.isArray(src.sections) ? src.sections : [];

  const seen = new Set<string>();
  const usedSingletons = new Set<string>();
  const sections: ExpoSection[] = [];

  for (const item of list) {
    if (sections.length >= EXPO_LIMITS.sectionsPerPage) break;
    const section = normalizeSection(item);
    if (!section) continue;
    if (seen.has(section.sid)) continue;        // 중복 sid — 첫 것만
    const def = sectionDef(section.type)!;
    if (!def.multi) {
      if (usedSingletons.has(section.type)) continue;
      usedSingletons.add(section.type);
    }
    seen.add(section.sid);
    sections.push(section);
  }

  // 키비주얼은 맨 위에 온다 — 저장 순서가 어긋나 있어도 화면에서 바로잡는다.
  const pinned = sections.filter((s) => sectionDef(s.type)?.pinnedFirst);
  const rest = sections.filter((s) => !sectionDef(s.type)?.pinnedFirst);
  return { sections: [...pinned, ...rest] };
}

export function normalizeExpoTheme(raw: unknown): ExpoTheme {
  const t = obj(raw);
  return {
    accent: normalizeHexColor(str(t.accent)) ?? EXPO_DEFAULT_THEME.accent,
    lightBg: normalizeHexColor(str(t.lightBg)) ?? EXPO_DEFAULT_THEME.lightBg,
    darkBg: normalizeHexColor(str(t.darkBg)) ?? EXPO_DEFAULT_THEME.darkBg,
  };
}

/**
 * 편집기가 섹션을 새로 추가할 때. **여기서만** sid 를 발급한다
 * (템플릿 인스턴스화도 이 함수를 쓴다).
 */
export function newSection(type: string): ExpoSection {
  const def = sectionDef(type);
  if (!def) throw new Error(`알 수 없는 섹션 타입: ${type}`);
  const design: Record<string, string> = {};
  for (const [key, allowed] of Object.entries(def.design ?? {})) design[key] = allowed[0];
  return {
    sid: crypto.randomUUID(),
    type: def.type,
    variant: def.variants[0].id,
    enabled: true,
    // 붙일 코드는 따로 켠다 — 만들자마자 밖으로 나가면 안 된다.
    embedEnabled: false,
    design,
    content: {},
  };
}
