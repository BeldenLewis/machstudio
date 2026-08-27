/**
 * 초안의 반복 행에 **클라이언트 전용 키**를 붙이고 뗀다.
 *
 * ── 왜 필요한가 ───────────────────────────────────────────────────────
 * 저장되는 모양에는 행의 신원이 없다 — 리스트 슬롯은 그냥 배열이다(`config.ts` 의
 * `normalizeSlot` case "list"). 그런데 React 는 행마다 안정된 key 가 필요하다.
 * 배열 인덱스를 key 로 쓰면 **중간 행을 지웠을 때 아래 행들의 입력값과 IME 조합이
 * 엉킨다** — 이 저장소가 실제로 겪은 버그이고, `EditableList` 가 만들어진 이유다
 * (`components/ui/editable-list.tsx` 머리말).
 *
 * 그래서 편집 state 를 만들 때 클라이언트 키를 붙이고, 저장 직전에 뗀다.
 *
 * ── 한 번만 붙인다 ────────────────────────────────────────────────────
 * `attachExpoRowKeys` 는 **state 초기화에서 딱 한 번** 부른다. 렌더마다 부르면 매번 새
 * UUID 가 나와 값이 계속 달라지고, 자동저장이 **타이핑하지 않아도 끝없이** 돈다.
 * 이 파일은 그걸 강제할 수 없으므로 호출부가 지켜야 하고, 테스트가 그 성질을 못 박는다.
 *
 * ── 떼는 것은 총체적이어야 한다 ───────────────────────────────────────
 * 키가 하나라도 새어 나가면 발행 스냅샷과 공개 페이로드에 들어간다. 서버 정규화가
 * 카탈로그에 없는 키를 버려 주긴 하지만(`config.ts`), 그건 **마지막 그물**이지 계약이
 * 아니다. 여기서 확실히 뗀다.
 *
 * ── 중첩 ──────────────────────────────────────────────────────────────
 * W1 카탈로그에는 리스트 안의 리스트가 없다(`registry.ts` 의 itemSlots 는 전부 단순 슬롯).
 * 그래도 재귀로 쓴다 — 나중에 중첩 리스트가 생겼을 때 키가 **조용히** 새는 것보다
 * 지금 한 줄 더 쓰는 편이 싸다.
 */
import { ROW_KEY, withRowKeys, type WithRowKey } from "@/components/ui/editable-list";
import { sectionDef } from "@/lib/expo/registry";
import type { ExpoSection, SlotDef } from "@/lib/expo/types";

export { ROW_KEY };
export type { WithRowKey };

type Row = Record<string, unknown>;

const isRow = (value: unknown): value is Row =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * **행 단위로 판정한다.** 배열 전체를 한 번에 보면(`every`) 이상한 원소 하나 때문에
 * **그 목록 전체가 키 없이** 남는다. 그러면 모든 행의 키가 `undefined` 가 되고,
 * `removeByKey` 는 `rowKey(it) !== key` 로 거르므로 삭제 한 번에 **목록이 통째로 비고
 * 그대로 자동저장된다.**
 *
 * 편집기에 들어오는 값은 서버 정규화를 거치므로 실제로는 전부 객체다(`config.ts` 의
 * `obj(row)`). 이건 그 전제가 깨졌을 때를 위한 것이고, 비용이 한 줄이라 둔다.
 */
const asRow = (value: unknown): Row | null => (isRow(value) ? value : null);

/** 리스트 슬롯 한 칸에 키를 붙인다. 재귀 — 행 안에 또 리스트가 있으면 거기도. */
function attachSlot(def: SlotDef, value: unknown): unknown {
  if (def.kind !== "list" || !def.itemSlots || !Array.isArray(value)) return value;
  return value.map((raw) => {
    const row = asRow(raw);
    // 객체가 아닌 원소는 그대로 통과시킨다 — 정규화가 어차피 버린다.
    if (!row) return raw;
    const [keyed] = withRowKeys([row]);
    const next: Row = { ...keyed };
    for (const item of def.itemSlots!) {
      if (item.kind === "list") next[item.key] = attachSlot(item, row[item.key]);
    }
    return next;
  });
}

function stripSlot(def: SlotDef, value: unknown): unknown {
  if (def.kind !== "list" || !def.itemSlots || !Array.isArray(value)) return value;
  return value.map((raw) => {
    const row = asRow(raw);
    if (!row) return raw;
    const next: Row = { ...row };
    delete next[ROW_KEY];
    for (const item of def.itemSlots!) {
      if (item.kind === "list") next[item.key] = stripSlot(item, row[item.key]);
    }
    return next;
  });
}

/**
 * 슬롯 목록을 직접 받는 형태.
 *
 * 카탈로그를 거치지 않고도 부를 수 있게 열어 둔다 — **중첩 리스트 재귀를 테스트로 덮기
 * 위해서다.** W1 카탈로그에는 중첩이 없어서, 이게 없으면 그 재귀는 도달 불가능한 채로
 * 남고 아무도 그게 맞는지 모른다.
 */
export function attachRowKeysForSlots(
  slots: readonly SlotDef[],
  content: Record<string, unknown>,
): Record<string, unknown> {
  return mapContent(slots, content, attachSlot);
}

export function stripRowKeysForSlots(
  slots: readonly SlotDef[],
  content: Record<string, unknown>,
): Record<string, unknown> {
  return mapContent(slots, content, stripSlot);
}

function mapContent(
  slots: readonly SlotDef[],
  content: Record<string, unknown>,
  slotMapper: (def: SlotDef, value: unknown) => unknown,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...content };
  for (const slot of slots) {
    if (slot.kind !== "list") continue;
    /**
     * 없던 키를 만들지 않는다. `JSON.stringify` 는 `undefined` 값을 빼므로 저장 payload
     * 는 같지만, `Object.keys` 로 도는 코드에는 없던 칸이 생겨 보인다 — 붙이기와 떼기가
     * 서로 다른 모양을 내놓는 것 자체가 나중에 헷갈릴 자리다.
     */
    if (!(slot.key in content)) continue;
    next[slot.key] = slotMapper(slot, content[slot.key]);
  }
  return next;
}

function mapSections(
  sections: readonly ExpoSection[],
  slotMapper: (def: SlotDef, value: unknown) => unknown,
): ExpoSection[] {
  return sections.map((section) => {
    const def = sectionDef(section.type);
    // 카탈로그에 없는 타입은 손대지 않는다 — 옛 발행본에 남아 있을 수 있다.
    if (!def) return section;
    return { ...section, content: mapContent(def.slots, section.content, slotMapper) };
  });
}

/**
 * 편집 state 를 만들 때 **한 번만** 부른다.
 * 렌더마다 부르면 매번 새 키가 나와 자동저장이 끝없이 돈다.
 */
export function attachExpoRowKeys(sections: readonly ExpoSection[]): ExpoSection[] {
  return mapSections(sections, attachSlot);
}

/** 저장 직전에 부른다. 키가 하나도 남지 않아야 한다. */
export function stripExpoRowKeys(sections: readonly ExpoSection[]): ExpoSection[] {
  return mapSections(sections, stripSlot);
}

/**
 * 어디에도 클라이언트 키가 남지 않았는가 — 테스트와 개발 중 방어에 쓴다.
 * 카탈로그를 보지 않고 **값 전체**를 훑는다: 카탈로그가 놓친 자리를 잡는 것이 목적이다.
 */
export function findRowKeyLeak(value: unknown, path = "$"): string | null {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = findRowKeyLeak(value[i], `${path}[${i}]`);
      if (found) return found;
    }
    return null;
  }
  if (value === null || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value as Row)) {
    if (key === ROW_KEY) return `${path}.${key}`;
    const found = findRowKeyLeak(child, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}
