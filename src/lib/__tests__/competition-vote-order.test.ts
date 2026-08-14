import { describe, expect, it } from "vitest";
import { orderEntries } from "@/lib/competition-vote";

const entry = (id: string, entryNo: string, sortOrder: number, finalOrder: number | null) => ({
  id, entryNo, sortOrder, finalOrder, submittedAt: new Date(`2026-08-${entryNo.padStart(2, "0")}T00:00:00Z`),
});

const ENTRIES = [
  entry("a", "1", 10, 3),
  entry("b", "2", 20, 1),
  entry("c", "3", 30, null),
  entry("d", "4", 40, 2),
];

describe("본선 진행 순서", () => {
  it("운영자가 정한 순서를 그대로 따른다 — 무대 순서라 섞으면 안 된다", () => {
    expect(orderEntries(ENTRIES, "final", "seed").map((e) => e.entryNo)).toEqual(["2", "4", "1", "3"]);
  });

  it("순서를 안 정한 참가작은 뒤로 밀고 참가번호로 떨어뜨린다", () => {
    const pending = [entry("x", "7", 1, null), entry("y", "5", 2, null), entry("z", "6", 3, 1)];
    expect(orderEntries(pending, "final", "seed").map((e) => e.entryNo)).toEqual(["6", "5", "7"]);
  });

  it("같은 입력이면 seed 와 무관하게 같은 순서다", () => {
    const first = orderEntries(ENTRIES, "final", "voter-a").map((e) => e.id);
    const second = orderEntries(ENTRIES, "final", "voter-b").map((e) => e.id);
    expect(first).toEqual(second);
  });
});

describe("예선 표시 순서", () => {
  it("random 은 사람마다 다르되 그 사람에겐 고정이다", () => {
    const a1 = orderEntries(ENTRIES, "random", "voter-a").map((e) => e.id);
    const a2 = orderEntries(ENTRIES, "random", "voter-a").map((e) => e.id);
    expect(a1).toEqual(a2);

    // 시드가 다르면 순서가 달라져야 위치 편향이 실제로 흩어진다.
    const seeds = ["v1", "v2", "v3", "v4", "v5", "v6"].map((s) =>
      orderEntries(ENTRIES, "random", s).map((e) => e.id).join(","),
    );
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });

  it("manual 은 sortOrder, submitted 는 접수 시각을 따른다", () => {
    expect(orderEntries(ENTRIES, "manual", "s").map((e) => e.entryNo)).toEqual(["1", "2", "3", "4"]);
    expect(orderEntries(ENTRIES, "submitted", "s").map((e) => e.entryNo)).toEqual(["1", "2", "3", "4"]);
  });
});
