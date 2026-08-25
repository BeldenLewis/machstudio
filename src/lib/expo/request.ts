/**
 * 쓰기 요청 **검증** — 정규화와 다른 일을 한다.
 *
 * ── 자르기와 거절의 차이 ──────────────────────────────────────────────
 * `config.ts` 의 정규화는 **이미 저장된** 값에 대한 방어라 조용히 자른다(던지면 그 페이지가
 * 영영 안 열리므로). 반면 새로 들어오는 쓰기는 **거절**해야 한다 — 운영자가 입력한 문장을
 * 말없이 잘라 저장하면, 저장은 성공했다고 뜨는데 화면에는 잘린 글이 남는다.
 * 그건 "저장이 안 됐다" 보다 알아채기 어렵다.
 *
 * 그래서 여기서는 **어느 칸이 왜 안 되는지**를 구조화해서 돌려준다.
 */
import { EXPO_LIMITS, sectionDef } from "@/lib/expo/registry";
import type { SlotDef } from "@/lib/expo/types";

export interface FieldError {
  /** `sections[2].content.title` 처럼 어느 칸인지 — 편집기가 그 카드로 데려간다. */
  path: string;
  code: "too-long" | "too-many" | "unknown-type" | "invalid-shape" | "too-large";
  message: string;
}

export type ValidateResult = { ok: true } | { ok: false; errors: FieldError[] };

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const bytes = (v: string) => new TextEncoder().encode(v).length;

/** 로케일 맵이든 문자열이든 가장 긴 값을 본다 — 한 언어만 넘쳐도 거절이다. */
function longestText(value: unknown): { chars: number; bytes: number } {
  if (typeof value === "string") return { chars: value.length, bytes: bytes(value) };
  let chars = 0, b = 0;
  for (const v of Object.values(obj(value))) {
    const s = String(v ?? "");
    chars = Math.max(chars, s.length);
    b = Math.max(b, bytes(s));
  }
  return { chars, bytes: b };
}

function validateSlot(def: SlotDef, value: unknown, path: string, errors: FieldError[]): void {
  if (value === undefined || value === null) return;

  if (def.kind === "text") {
    const { chars } = longestText(value);
    if (chars > EXPO_LIMITS.textChars) {
      errors.push({
        path, code: "too-long",
        message: `${def.label} 은 ${EXPO_LIMITS.textChars}자까지 넣을 수 있어요 (지금 ${chars}자)`,
      });
    }
    return;
  }

  if (def.kind === "textarea" || def.kind === "code") {
    const { bytes: b } = longestText(value);
    if (b > EXPO_LIMITS.longTextBytes) {
      const kb = Math.round(EXPO_LIMITS.longTextBytes / 1024);
      errors.push({ path, code: "too-long", message: `${def.label} 은 ${kb}KB까지 넣을 수 있어요` });
    }
    return;
  }

  if (def.kind === "list") {
    if (!Array.isArray(value)) {
      errors.push({ path, code: "invalid-shape", message: `${def.label} 의 모양이 올바르지 않아요` });
      return;
    }
    if (value.length > EXPO_LIMITS.rowsPerList) {
      errors.push({
        path, code: "too-many",
        message: `${def.label} 은 ${EXPO_LIMITS.rowsPerList}개까지 넣을 수 있어요 (지금 ${value.length}개)`,
      });
    }
    if (!def.itemSlots) return;
    value.slice(0, EXPO_LIMITS.rowsPerList).forEach((row, i) => {
      for (const slot of def.itemSlots!) {
        validateSlot(slot, obj(row)[slot.key], `${path}[${i}].${slot.key}`, errors);
      }
    });
  }
}

/**
 * 페이지 draft 쓰기를 검증한다. **정규화 전에** 돈다 — 정규화가 자르고 나면
 * 무엇이 넘쳤는지 알 수 없다.
 */
export function validatePageDraft(raw: unknown): ValidateResult {
  const errors: FieldError[] = [];
  const src = obj(raw);
  const sections = Array.isArray(src.sections) ? src.sections : null;

  if (sections === null) {
    return { ok: false, errors: [{ path: "sections", code: "invalid-shape", message: "페이지 모양이 올바르지 않아요" }] };
  }

  if (sections.length > EXPO_LIMITS.sectionsPerPage) {
    errors.push({
      path: "sections", code: "too-many",
      message: `한 페이지에 구획은 ${EXPO_LIMITS.sectionsPerPage}개까지예요 (지금 ${sections.length}개)`,
    });
  }

  sections.slice(0, EXPO_LIMITS.sectionsPerPage).forEach((raw, i) => {
    const s = obj(raw);
    const def = sectionDef(String(s.type ?? ""));
    if (!def) {
      errors.push({ path: `sections[${i}].type`, code: "unknown-type", message: "알 수 없는 구획이에요" });
      return;
    }
    const content = obj(s.content);
    for (const slot of def.slots) {
      validateSlot(slot, content[slot.key], `sections[${i}].content.${slot.key}`, errors);
    }
  });

  // 전체 크기 — 생성 로더가 부풀지 않게 마지막으로 묶는다.
  let total = 0;
  try { total = bytes(JSON.stringify(src) ?? ""); } catch { total = Number.MAX_SAFE_INTEGER; }
  if (total > EXPO_LIMITS.pageDraftBytes) {
    const kb = Math.round(EXPO_LIMITS.pageDraftBytes / 1024);
    errors.push({ path: "sections", code: "too-large", message: `페이지 전체가 ${kb}KB를 넘었어요` });
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

/** 템플릿 스냅샷 쓰기 — 저장과 인스턴스화 양쪽에서 같은 상한을 건다. */
export function validateTemplateSnapshot(raw: unknown): ValidateResult {
  let total = 0;
  try { total = bytes(JSON.stringify(raw) ?? ""); } catch { total = Number.MAX_SAFE_INTEGER; }
  if (total > EXPO_LIMITS.templateSnapshotBytes) {
    const mb = Math.round(EXPO_LIMITS.templateSnapshotBytes / (1024 * 1024));
    return { ok: false, errors: [{ path: "snapshot", code: "too-large", message: `템플릿이 ${mb}MB를 넘었어요` }] };
  }
  return { ok: true };
}
