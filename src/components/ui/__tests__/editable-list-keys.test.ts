import { describe, it, expect } from "vitest";
import { ROW_KEY, withRowKeys, stripRowKeys } from "../editable-list";

/**
 * 스키마에 id 가 없는 반복 항목(랜딩 4종·자료)의 안정 키 왕복 테스트.
 * 예전엔 React key 로 index 를 써서 중간 행을 지우면 아래 행들의 입력값이 엉켰다.
 */

type Resource = { title: string; meta: string; url: string };
const rows: Resource[] = [
  { title: "발표자료", meta: "PDF · 4.2MB", url: "https://a" },
  { title: "실험 템플릿", meta: "XLSX", url: "https://b" },
  { title: "체크리스트", meta: "PDF", url: "https://c" },
];

describe("withRowKeys / stripRowKeys", () => {
  it("행마다 서로 다른 키를 붙인다", () => {
    const keyed = withRowKeys(rows);
    const keys = keyed.map((r) => r[ROW_KEY]);
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(3); // 중복 없음
    expect(keys.every((k) => typeof k === "string" && k.length > 0)).toBe(true);
  });

  it("원래 값은 건드리지 않는다", () => {
    const keyed = withRowKeys(rows);
    keyed.forEach((r, i) => {
      expect(r.title).toBe(rows[i].title);
      expect(r.meta).toBe(rows[i].meta);
      expect(r.url).toBe(rows[i].url);
    });
    expect(rows[0]).not.toHaveProperty(ROW_KEY); // 입력 배열 불변
  });

  it("저장 직전 키를 떼면 원래 형태로 돌아온다 — 저장 형태가 바뀌지 않는다", () => {
    expect(stripRowKeys(withRowKeys(rows))).toEqual(rows);
    expect(stripRowKeys(withRowKeys(rows))[0]).not.toHaveProperty(ROW_KEY);
  });

  it("중간 행을 지워도 남은 행의 키가 유지된다 (index key 였다면 밀렸다)", () => {
    const keyed = withRowKeys(rows);
    const before = keyed.map((r) => r[ROW_KEY]);
    const after = keyed.filter((_, i) => i !== 1).map((r) => r[ROW_KEY]);

    expect(after).toEqual([before[0], before[2]]); // 1번을 지웠는데 2번 키가 1번 자리로 밀리지 않는다
    // index key 였다면: 삭제 후 key 0,1 → 예전 1번(지워진 것)의 자리를 2번이 물려받아
    // React 가 같은 DOM 을 재사용하고 입력값·IME 조합이 엉켰다.
  });

  it("순서를 바꿔도 각 행이 자기 키를 들고 간다", () => {
    const keyed = withRowKeys(rows);
    const keyOfTemplate = keyed[1][ROW_KEY];
    const moved = [keyed[1], keyed[0], keyed[2]];
    expect(moved[0][ROW_KEY]).toBe(keyOfTemplate);
    expect(moved[0].title).toBe("실험 템플릿");
  });

  it("빈 배열도 안전", () => {
    expect(withRowKeys([])).toEqual([]);
    expect(stripRowKeys([])).toEqual([]);
  });
});
