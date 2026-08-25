import { describe, expect, it } from "vitest";
import { changedSourceRefs, isUsableSource, sourceScopeWhere } from "@/lib/expo/source-scope";

/**
 * **사전등록 소스를 이 사이트가 써도 되는가** — 네 곳이 같은 답을 내는가.
 *
 * 흩어져 있던 판정을 모은 이유가 여기 있다: 사이트 PATCH 는 `mode` 를 안 보고 있어서
 * capture 모드 소스를 기본 소스로 붙일 수 있었다. 그건 폼이 아니라 아임웹에서 긁어 오는
 * 쪽이라, 홈페이지가 폼으로 그리면 방문자에게 빈 껍데기가 나간다.
 */

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const page = (sections: unknown[]) => ({ sections });
const form = (sid: string, ref?: string) => ({
  sid, type: "register-form", variant: "inline",
  content: ref === undefined ? {} : { sourceRef: ref },
});

describe("조회 조건", () => {
  it("세 조건이 모두 들어간다 — 같은 프로젝트·미삭제·builder", () => {
    expect(sourceScopeWhere("p1")).toEqual({ projectId: "p1", deletedAt: null, mode: "builder" });
  });

  it("id 를 주면 그것만 본다", () => {
    expect(sourceScopeWhere("p1", ["s1", "s2"])).toEqual({
      id: { in: ["s1", "s2"] }, projectId: "p1", deletedAt: null, mode: "builder",
    });
  });
});

describe("쓸 수 있는 소스인가", () => {
  const ok = { projectId: "p1", deletedAt: null, mode: "builder" };
  it("셋 다 맞아야 통과", () => {
    expect(isUsableSource(ok, "p1")).toBe(true);
  });
  it("하나만 어긋나도 거절 — 각각 확인한다", () => {
    expect(isUsableSource({ ...ok, projectId: "다른프로젝트" }, "p1")).toBe(false);
    expect(isUsableSource({ ...ok, deletedAt: new Date() }, "p1")).toBe(false);
    expect(isUsableSource({ ...ok, mode: "capture" }, "p1")).toBe(false);
    expect(isUsableSource(null, "p1")).toBe(false);
    expect(isUsableSource(undefined, "p1")).toBe(false);
  });
});

/**
 * **바뀐 것만 본다.**
 *
 * `SourceRefField` 는 값이 후보 목록에 없으면 빈 select 로 그릴 뿐 onChange 를 내지 않아
 * 낡은 참조가 payload 에 계속 실린다. 매번 대조하면 소스를 하나 지운 순간, 운영자가
 * **전혀 다른 구획의 글자 하나**를 고쳐도 그 페이지가 영구 저장 불가가 된다.
 */
describe("이번에 바뀐 참조만 고른다", () => {
  it("그대로면 아무것도 안 본다 — 조회가 0회여야 한다", () => {
    const before = page([form(uid(1), "src-a")]);
    const after = page([form(uid(1), "src-a")]);
    expect(changedSourceRefs(after, before)).toEqual([]);
  });

  it("낡은 참조를 그대로 실어 보내도 막지 않는다", () => {
    // src-지워짐 은 이미 저장돼 있던 값이다. 다른 구획만 고쳤다.
    const before = page([form(uid(1), "src-지워짐"), { sid: uid(2), type: "textblock", variant: "prose", content: { body: "옛 글" } }]);
    const after = page([form(uid(1), "src-지워짐"), { sid: uid(2), type: "textblock", variant: "prose", content: { body: "고친 글" } }]);
    expect(changedSourceRefs(after, before)).toEqual([]);
  });

  it("새로 고른 것은 잡는다", () => {
    const before = page([form(uid(1), "src-a")]);
    const after = page([form(uid(1), "src-b")]);
    expect(changedSourceRefs(after, before)).toEqual([{ sid: uid(1), value: "src-b" }]);
  });

  it("처음 붙이는 것도 잡는다", () => {
    expect(changedSourceRefs(page([form(uid(1), "src-b")]), page([form(uid(1))])))
      .toEqual([{ sid: uid(1), value: "src-b" }]);
  });

  it("새 구획이 들고 온 참조도 잡는다", () => {
    const after = page([form(uid(1), "src-a"), form(uid(2), "src-b")]);
    expect(changedSourceRefs(after, page([form(uid(1), "src-a")])))
      .toEqual([{ sid: uid(2), value: "src-b" }]);
  });

  /** 같은 값을 **다른 구획**이 쓰면 그건 새 참조다 — 그 구획에 대해 처음 들어온 값이다. */
  it("구획 단위로 본다", () => {
    expect(changedSourceRefs(page([form(uid(2), "src-a")]), page([form(uid(1), "src-a")])))
      .toEqual([{ sid: uid(2), value: "src-a" }]);
  });

  it("참조를 뗀 것은 볼 필요가 없다", () => {
    expect(changedSourceRefs(page([form(uid(1))]), page([form(uid(1), "src-a")]))).toEqual([]);
  });

  it("모양이 이상해도 던지지 않는다", () => {
    for (const bad of [null, undefined, 3, "x", {}, { sections: "x" }, { sections: [null, 1, {}] }]) {
      expect(() => changedSourceRefs(bad, bad)).not.toThrow();
      expect(changedSourceRefs(bad, null)).toEqual([]);
    }
  });
});
