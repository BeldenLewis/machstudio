import { describe, it, expect } from "vitest";
import { removeByKey, patchByKey, moveByKey } from "@/components/ui/editable-list";

type Row = { id: string; title: string };
const key = (r: Row) => r.id;
const seed = (): Row[] => [
  { id: "a", title: "사전 등록" },
  { id: "b", title: "입장 확인" },
  { id: "c", title: "라이브 시청" },
];
const ids = (rows: Row[]) => rows.map((r) => r.id);

describe("removeByKey", () => {
  it("해당 키만 빠지고 나머지 순서는 유지된다", () => {
    expect(ids(removeByKey(seed(), key, "b"))).toEqual(["a", "c"]);
  });

  it("없는 키는 아무것도 바꾸지 않는다", () => {
    expect(ids(removeByKey(seed(), key, "zzz"))).toEqual(["a", "b", "c"]);
  });

  it("입력 배열을 변형하지 않는다", () => {
    const rows = seed();
    removeByKey(rows, key, "a");
    expect(ids(rows)).toEqual(["a", "b", "c"]);
  });
});

/**
 * 이 describe 가 이 파일의 존재 이유다.
 *
 * 실제로 프로덕션에 나갔던 버그: 5초 유예 안에 두 행을 지우면 각 commit 이 **클릭 시점의 배열**을
 * 클로저로 들고 있어서, 나중에 도는 commit 이 먼저 도는 commit 의 결과를 덮어썼다.
 * 결과는 "먼저 지운 행이 되살아나고 그대로 자동저장" — 하니스에서 실측 확인했다.
 *
 * 아래 두 테스트는 같은 입력에 대해 **스냅샷을 다시 읽는 방식(fix)** 과
 * **원본 스냅샷을 계속 쓰는 방식(bug)** 이 서로 다른 결과를 낸다는 것을 못박는다.
 * 컴포넌트가 itemsRef 대신 클로저로 되돌아가면 이 대비가 무의미해지므로,
 * 여기서 지키는 것은 "연쇄 적용이 누적된다" 는 계약이다.
 */
describe("삭제 2건이 겹칠 때 — 다중 삭제 부활 회귀 가드", () => {
    it("직전 결과 위에 적용하면 둘 다 지워진다 (현재 구현)", () => {
    let live: Row[] = seed();
    live = removeByKey(live, key, "a"); // 첫 유예 만료
    live = removeByKey(live, key, "b"); // 두 번째 유예 만료 — 최신 배열 위에서 계산
    expect(ids(live)).toEqual(["c"]);
  });

  it("둘 다 원본 스냅샷 위에 적용하면 먼저 지운 행이 되살아난다 (옛 버그 재현)", () => {
    const original = seed();
    const afterFirst = removeByKey(original, key, "a");
    const afterSecond = removeByKey(original, key, "b"); // 스테일 스냅샷
    expect(ids(afterFirst)).toEqual(["b", "c"]);
    // 나중 것이 이기므로 최종 결과에 "a" 가 되살아난다
    expect(ids(afterSecond)).toEqual(["a", "c"]);
    expect(ids(afterSecond)).toContain("a");
  });

  it("세 건이 겹쳐도 누적된다", () => {
    let live: Row[] = seed();
    for (const k of ["a", "b", "c"]) live = removeByKey(live, key, k);
    expect(ids(live)).toEqual([]);
  });
});

describe("patchByKey", () => {
  it("해당 행만 병합한다", () => {
    const next = patchByKey(seed(), key, "b", { title: "바뀜" });
    expect(next.map((r) => r.title)).toEqual(["사전 등록", "바뀜", "라이브 시청"]);
  });

  it("같은 틱에 두 행을 연달아 patch 해도 둘 다 남는다", () => {
    // 클로저를 쓰면 두 번째가 첫 번째를 덮어써 "사전 등록" 이 되돌아간다.
    let live: Row[] = seed();
    live = patchByKey(live, key, "a", { title: "A2" });
    live = patchByKey(live, key, "b", { title: "B2" });
    expect(live.map((r) => r.title)).toEqual(["A2", "B2", "라이브 시청"]);
  });

  it("입력 배열과 항목을 변형하지 않는다", () => {
    const rows = seed();
    patchByKey(rows, key, "a", { title: "바뀜" });
    expect(rows[0].title).toBe("사전 등록");
  });
});

describe("moveByKey", () => {
  it("아래로 이동", () => {
    expect(ids(moveByKey(seed(), key, "a", "b"))).toEqual(["b", "a", "c"]);
  });

  it("위로 이동", () => {
    expect(ids(moveByKey(seed(), key, "c", "a"))).toEqual(["c", "a", "b"]);
  });

  it("항목 전체를 데리고 움직인다 — 필드가 뒤섞이지 않는다", () => {
    const moved = moveByKey(seed(), key, "a", "c");
    expect(moved.map((r) => [r.id, r.title])).toEqual([
      ["b", "입장 확인"],
      ["c", "라이브 시청"],
      ["a", "사전 등록"],
    ]);
  });

  it("모르는 id 면 원본을 그대로 돌려준다", () => {
    expect(ids(moveByKey(seed(), key, "a", "없음"))).toEqual(["a", "b", "c"]);
    expect(ids(moveByKey(seed(), key, "없음", "b"))).toEqual(["a", "b", "c"]);
  });

  it("삭제로 짧아진 배열 위에서도 정확한 행이 움직인다", () => {
    // 드래그가 유예 삭제와 겹치는 경로 — index 가 아니라 키로 찾는지 확인
    const afterDelete = removeByKey(seed(), key, "a");
    expect(ids(moveByKey(afterDelete, key, "c", "b"))).toEqual(["c", "b"]);
  });
});
