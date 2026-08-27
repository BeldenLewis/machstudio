import { describe, expect, it } from "vitest";
import { armedEmbedSections, newlyEmbedEnabled } from "@/lib/expo/release-gate";

/**
 * **끄는 것은 언제나 허용, 켜는 것만 잠금.**
 *
 * 이 비대칭이 안 지켜지면 두 가지 중 하나가 된다: 되돌릴 수 없거나(끄기가 막힘),
 * 이미 켜 둔 구획이 있는 페이지가 영구 저장 불가가 된다(글자 하나만 고쳐도 422).
 * 그래서 이 함수는 **새로 켜진 것만** 돌려준다 — 나머지는 담길 수 없는 구조여야 한다.
 */

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const page = (rows: Array<[number, boolean]>) => ({
  sections: rows.map(([n, on]) => ({ sid: uid(n), type: "textblock", embedEnabled: on })),
});

describe("새로 켜진 구획만 잡는다", () => {
  it("false → true 는 잡는다", () => {
    expect(newlyEmbedEnabled(page([[1, true]]), page([[1, false]]))).toEqual([uid(1)]);
  });

  it("true → false(끄기)는 **잡지 않는다** — 언제나 허용이다", () => {
    expect(newlyEmbedEnabled(page([[1, false]]), page([[1, true]]))).toEqual([]);
  });

  it("계속 켜져 있는 것은 잡지 않는다 — 안 그러면 그 페이지가 영구 저장 불가가 된다", () => {
    expect(newlyEmbedEnabled(page([[1, true]]), page([[1, true]]))).toEqual([]);
  });

  it("계속 꺼져 있는 것도 잡지 않는다", () => {
    expect(newlyEmbedEnabled(page([[1, false]]), page([[1, false]]))).toEqual([]);
  });

  /** 새 구획을 켠 채로 들여올 수 없다 — 이전 값이 없으면 켜진 것으로 센다. */
  it("처음 보는 구획이 켜져 있으면 잡는다", () => {
    expect(newlyEmbedEnabled(page([[1, false], [2, true]]), page([[1, false]]))).toEqual([uid(2)]);
  });

  it("처음 보는 구획이 꺼져 있으면 잡지 않는다", () => {
    expect(newlyEmbedEnabled(page([[1, false], [2, false]]), page([[1, false]]))).toEqual([]);
  });

  /** 켜고 끄는 것이 섞여도 켜진 것만 나온다. */
  it("섞여 있으면 켜진 것만", () => {
    const before = page([[1, true], [2, false], [3, true]]);
    const after = page([[1, false], [2, true], [3, true]]);
    expect(newlyEmbedEnabled(after, before)).toEqual([uid(2)]);
  });

  it("`true` 가 아닌 값은 켜진 것이 아니다", () => {
    const truthy = { sections: [{ sid: uid(1), embedEnabled: 1 }] };
    expect(newlyEmbedEnabled(truthy, page([[1, false]]))).toEqual([]);
  });

  it("모양이 이상해도 던지지 않는다", () => {
    for (const bad of [null, undefined, 3, "x", {}, { sections: "x" }, { sections: [null, 1, {}] }]) {
      expect(() => newlyEmbedEnabled(bad, bad)).not.toThrow();
      expect(newlyEmbedEnabled(bad, null)).toEqual([]);
    }
  });
});

/**
 * 프리플라이트가 세는 값 — **구획 단독 임베드는 `liveAt` 을 보지 않으므로**
 * 공개 스위치가 전부 꺼져 있어도 발행본에 켜진 구획이 있으면 플래그를 켜는 순간 나간다.
 */
describe("발행본에 장전된 구획", () => {
  it("켜진 것만 센다", () => {
    expect(armedEmbedSections(page([[1, true], [2, false], [3, true]]))).toEqual([uid(1), uid(3)]);
  });

  it("없으면 빈 배열", () => {
    expect(armedEmbedSections(page([[1, false]]))).toEqual([]);
    expect(armedEmbedSections(null)).toEqual([]);
  });
});
