// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  ROW_KEY, attachExpoRowKeys, attachRowKeysForSlots, findRowKeyLeak,
  stripExpoRowKeys, stripRowKeysForSlots,
} from "@/lib/expo/row-key";
import { normalizeExpoPage } from "@/lib/expo/config";
import { buildExpoPayload } from "@/lib/expo/payload";
import type { ExpoSection, SlotDef } from "@/lib/expo/types";

/**
 * 편집기 전용 행 키.
 *
 * ── 이 파일이 붙잡는 것 둘 ────────────────────────────────────────────
 * ① **키가 새어 나가지 않는다.** 하나라도 남으면 발행 스냅샷과 공개 페이로드에 들어간다.
 * ② **키를 렌더마다 새로 만들지 않는다.** 매번 새 UUID 면 값이 계속 달라져
 *    자동저장이 타이핑하지 않아도 끝없이 돈다.
 */

const SID = "11111111-1111-1111-1111-111111111111";
const SID2 = "22222222-2222-2222-2222-222222222222";

const cardgrid = (rows: Array<Record<string, unknown>>): ExpoSection => ({
  sid: SID, type: "cardgrid", variant: "multicolumn", enabled: true, embedEnabled: false,
  design: {},
  content: { heading: { ko: "프로그램" }, items: rows },
});

const kv = (): ExpoSection => ({
  sid: SID2, type: "kv", variant: "column", enabled: true, embedEnabled: false,
  design: {},
  content: { title: { ko: "제목" }, media: { kind: "image", url: "https://x.test/a.jpg" } },
});

describe("붙이기", () => {
  it("리스트 슬롯의 각 행에 키를 붙인다", () => {
    const [section] = attachExpoRowKeys([cardgrid([{ title: { ko: "A" } }, { title: { ko: "B" } }])]);
    const rows = section.content.items as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(typeof row[ROW_KEY]).toBe("string");
    // 행마다 달라야 한다 — 같으면 React 가 두 행을 하나로 본다.
    expect(rows[0][ROW_KEY]).not.toBe(rows[1][ROW_KEY]);
  });

  it("리스트가 아닌 슬롯은 건드리지 않는다", () => {
    const [section] = attachExpoRowKeys([kv()]);
    expect(section.content.media).toEqual({ kind: "image", url: "https://x.test/a.jpg" });
    expect(findRowKeyLeak(section.content.media)).toBeNull();
  });

  it("원본을 바꾸지 않는다", () => {
    const original = cardgrid([{ title: { ko: "A" } }]);
    const snapshot = JSON.stringify(original);
    attachExpoRowKeys([original]);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  /** 옛 발행본에 남아 있을 수 있다 — 손대지 않고 그대로 통과시킨다. */
  it("카탈로그에 없는 타입은 그대로 둔다", () => {
    const unknown = { ...cardgrid([{ title: { ko: "A" } }]), type: "nope" };
    const [section] = attachExpoRowKeys([unknown]);
    expect(section).toBe(unknown);
  });

  it("리스트 값이 배열이 아니면 그대로 둔다", () => {
    const broken = { ...cardgrid([]), content: { items: "이상한 값" } };
    const [section] = attachExpoRowKeys([broken]);
    expect(section.content.items).toBe("이상한 값");
  });

  /**
   * **핵심.** 붙이기를 렌더마다 부르면 매번 새 키가 나와 값이 계속 달라진다 —
   * 자동저장이 타이핑하지 않아도 끝없이 돈다. 그래서 state 초기화에서 한 번만 부른다.
   */
  it("두 번 부르면 서로 다른 키가 나온다 — 그래서 한 번만 불러야 한다", () => {
    const input = [cardgrid([{ title: { ko: "A" } }])];
    const a = attachExpoRowKeys(input)[0].content.items as Array<Record<string, unknown>>;
    const b = attachExpoRowKeys(input)[0].content.items as Array<Record<string, unknown>>;
    expect(a[0][ROW_KEY]).not.toBe(b[0][ROW_KEY]);
  });
});

describe("떼기", () => {
  it("붙였던 키를 전부 뗀다", () => {
    const attached = attachExpoRowKeys([cardgrid([{ title: { ko: "A" } }, { title: { ko: "B" } }])]);
    const stripped = stripExpoRowKeys(attached);
    expect(findRowKeyLeak(stripped)).toBeNull();
  });

  it("행의 다른 값은 그대로 남긴다", () => {
    const attached = attachExpoRowKeys([cardgrid([
      { title: { ko: "A" }, tag: { ko: "태그" }, link: { label: "보기", href: "https://x.test/a" } },
    ])]);
    const rows = stripExpoRowKeys(attached)[0].content.items as Array<Record<string, unknown>>;
    expect(rows[0]).toEqual({
      title: { ko: "A" }, tag: { ko: "태그" }, link: { label: "보기", href: "https://x.test/a" },
    });
  });

  it("붙인 적 없는 초안에도 안전하다", () => {
    const stripped = stripExpoRowKeys([cardgrid([{ title: { ko: "A" } }]), kv()]);
    expect(findRowKeyLeak(stripped)).toBeNull();
    expect((stripped[0].content.items as unknown[])[0]).toEqual({ title: { ko: "A" } });
  });

  /** 붙이기와 떼기가 왕복이어야 편집 state 와 저장 값이 같은 것을 가리킨다. */
  it("붙였다 떼면 원래대로다", () => {
    const original = [cardgrid([{ title: { ko: "A" } }, { title: { ko: "B" } }]), kv()];
    const round = stripExpoRowKeys(attachExpoRowKeys(original));
    expect(JSON.parse(JSON.stringify(round))).toEqual(JSON.parse(JSON.stringify(original)));
  });
});

describe("새어 나가지 않는다", () => {
  /** 하나라도 남으면 발행 스냅샷과 공개 페이로드에 들어간다. */
  it("공개 페이로드까지 가도 키가 없다", () => {
    const attached = attachExpoRowKeys([cardgrid([
      { title: { ko: "A" }, link: { label: "보기", href: "https://x.test/a" } },
    ])]);
    const stripped = stripExpoRowKeys(attached);
    const payload = buildExpoPayload(stripped, { locale: "ko", pages: [] });
    expect(findRowKeyLeak(payload)).toBeNull();
    expect(JSON.stringify(payload)).not.toContain(ROW_KEY);
  });

  /**
   * 서버 정규화가 카탈로그에 없는 키를 버려 주긴 한다 — 마지막 그물이다.
   * 그물이 실제로 있다는 것을 확인해 두되, 그것에 기대지는 않는다(위 테스트가 계약이다).
   */
  it("정규화도 그물 역할을 한다", () => {
    const attached = attachExpoRowKeys([cardgrid([{ title: { ko: "A" } }])]);
    const normalized = normalizeExpoPage({ sections: attached });
    expect(findRowKeyLeak(normalized)).toBeNull();
  });

  it("누수 탐지기가 실제로 잡는다", () => {
    const leaked = { sections: [{ content: { items: [{ [ROW_KEY]: "abc", title: "A" }] } }] };
    expect(findRowKeyLeak(leaked)).toBe(`$.sections[0].content.items[0].${ROW_KEY}`);
  });

  it("깊이 묻힌 것도 잡는다", () => {
    expect(findRowKeyLeak({ a: [{ b: { c: [{ [ROW_KEY]: "x" }] } }] }))
      .toBe(`$.a[0].b.c[0].${ROW_KEY}`);
    expect(findRowKeyLeak({ a: [{ b: { c: [{ ok: 1 }] } }] })).toBeNull();
  });
});

describe("이상한 값이 섞여 와도", () => {
  /**
   * 배열 전체를 한 번에 판정하면(`every`) 이상한 원소 하나 때문에 **목록 전체가 키 없이**
   * 남는다. 그러면 모든 행의 키가 undefined 가 되고, `removeByKey` 가 `!== key` 로
   * 거르므로 **삭제 한 번에 목록이 통째로 비고 그대로 자동저장된다.**
   */
  it("객체가 아닌 원소가 섞여도 나머지 행은 키를 받는다", () => {
    const broken = {
      ...cardgrid([]),
      content: { items: [{ title: { ko: "A" } }, "이상한 값", { title: { ko: "B" } }] },
    };
    const rows = attachExpoRowKeys([broken])[0].content.items as unknown[];
    expect(typeof (rows[0] as Record<string, unknown>)[ROW_KEY]).toBe("string");
    expect(rows[1]).toBe("이상한 값");
    expect(typeof (rows[2] as Record<string, unknown>)[ROW_KEY]).toBe("string");
    expect((rows[0] as Record<string, unknown>)[ROW_KEY])
      .not.toBe((rows[2] as Record<string, unknown>)[ROW_KEY]);
  });

  it("떼기도 이상한 원소를 그대로 통과시킨다", () => {
    const broken = {
      ...cardgrid([]),
      content: { items: [{ title: { ko: "A" } }, null, 42] },
    };
    const stripped = stripExpoRowKeys(attachExpoRowKeys([broken]));
    expect(findRowKeyLeak(stripped)).toBeNull();
    expect(stripped[0].content.items).toEqual([{ title: { ko: "A" } }, null, 42]);
  });

  /** 붙이기와 떼기가 서로 다른 모양을 내놓으면 나중에 헷갈릴 자리가 된다. */
  it("없던 슬롯 키를 만들지 않는다", () => {
    const noItems = { ...cardgrid([]), content: { heading: { ko: "제목" } } };
    const attached = attachExpoRowKeys([noItems])[0];
    expect(Object.keys(attached.content).sort()).toEqual(["heading"]);
    const stripped = stripExpoRowKeys([attached])[0];
    expect(Object.keys(stripped.content).sort()).toEqual(["heading"]);
  });
});

describe("중첩 리스트", () => {
  /**
   * W1 카탈로그에는 중첩 리스트가 없다. 그래도 재귀를 써 뒀고, 그 코드가 맞는지는
   * **여기서만** 확인할 수 있다 — 도달 불가능한 방어 코드를 검증 없이 남기지 않는다.
   */
  const nestedSlots: SlotDef[] = [{
    key: "groups", kind: "list", label: "묶음",
    itemSlots: [
      { key: "name", kind: "text", label: "이름" },
      { key: "items", kind: "list", label: "항목", itemSlots: [{ key: "label", kind: "text", label: "라벨" }] },
    ],
  }];

  const content = () => ({
    groups: [
      { name: { ko: "A" }, items: [{ label: { ko: "a1" } }, { label: { ko: "a2" } }] },
      { name: { ko: "B" }, items: [{ label: { ko: "b1" } }] },
    ],
  });

  it("안쪽 행에도 키를 붙인다", () => {
    const attached = attachRowKeysForSlots(nestedSlots, content());
    const groups = attached.groups as Array<Record<string, unknown>>;
    expect(typeof groups[0][ROW_KEY]).toBe("string");
    const inner = groups[0].items as Array<Record<string, unknown>>;
    expect(inner).toHaveLength(2);
    expect(typeof inner[0][ROW_KEY]).toBe("string");
    expect(inner[0][ROW_KEY]).not.toBe(inner[1][ROW_KEY]);
  });

  /** 얕게 떼면 안쪽 키가 그대로 남아 공개 페이로드까지 간다. */
  it("안쪽 키까지 전부 뗀다", () => {
    const attached = attachRowKeysForSlots(nestedSlots, content());
    expect(findRowKeyLeak(attached)).not.toBeNull();
    expect(findRowKeyLeak(stripRowKeysForSlots(nestedSlots, attached))).toBeNull();
  });

  it("중첩도 왕복이다", () => {
    const original = content();
    const round = stripRowKeysForSlots(nestedSlots, attachRowKeysForSlots(nestedSlots, original));
    expect(round).toEqual(original);
  });
});

describe("W1 카탈로그 사실 확인", () => {
  /**
   * 지금은 리스트 안의 리스트가 없다. 그래도 재귀로 써 둔 이유는, 나중에 생겼을 때
   * 키가 **조용히** 새는 것보다 지금 한 줄 더 쓰는 편이 싸기 때문이다.
   * 이 테스트는 그 전제가 바뀌면 알려 준다.
   */
  it("리스트 슬롯 안에는 아직 리스트가 없다", async () => {
    const { EXPO_SECTIONS } = await import("@/lib/expo/registry");
    const nested = EXPO_SECTIONS.flatMap((def) =>
      def.slots.filter((s) => s.kind === "list")
        .flatMap((s) => (s.itemSlots ?? []).filter((i) => i.kind === "list"))
    );
    expect(nested).toEqual([]);
  });

  it("리스트 슬롯을 가진 타입은 카드와 퀵 액션 둘이다", async () => {
    const { EXPO_SECTIONS } = await import("@/lib/expo/registry");
    const withList = EXPO_SECTIONS.filter((def) => def.slots.some((s) => s.kind === "list"));
    expect(withList.map((d) => d.type).sort()).toEqual(["cardgrid", "toolbox"]);
  });
});
