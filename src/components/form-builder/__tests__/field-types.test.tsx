// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REG_TYPE_META, REG_TYPE_ORDER, RegTypeMenu, CHOICE_TYPES, type BuilderFieldType } from "../field-types";

/**
 * 웨비나 등록 폼과 사전등록 빌더가 **같은 항목 형식 어휘**를 쓴다는 계약을 지킨다.
 *
 * 이 모듈은 원래 RegistrationFormTab 안에 있던 것을 꺼낸 것이다. 어드민 화면은 로그인 벽 때문에
 * 브라우저로 볼 수 없어서, 꺼내면서 메뉴가 깨지지 않았는지 확인할 방법이 렌더 테스트뿐이다.
 */

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderMenu(current: BuilderFieldType, onPick = vi.fn()) {
  act(() => { root.render(<RegTypeMenu current={current} onPick={onPick} />); });
  return onPick;
}

describe("항목 형식 표 — 두 빌더의 단일 출처", () => {
  it("표와 순서가 어긋나지 않는다 — 순서에만 넣고 표에 빠뜨리면 메뉴가 깨진다", () => {
    expect(REG_TYPE_ORDER).toHaveLength(Object.keys(REG_TYPE_META).length);
    for (const t of REG_TYPE_ORDER) expect(REG_TYPE_META[t]).toBeDefined();
  });

  it("선택형은 드롭다운·복수 선택 둘뿐 — 옵션 편집이 걸리는 유형", () => {
    expect([...CHOICE_TYPES].sort()).toEqual(["multiple", "select"]);
  });
});

describe("RegTypeMenu", () => {
  it("여섯 형식을 라벨·설명과 함께 그린다", () => {
    renderMenu("text");
    const text = container.textContent ?? "";
    for (const t of REG_TYPE_ORDER) {
      expect(text).toContain(REG_TYPE_META[t].label);
      expect(text).toContain(REG_TYPE_META[t].desc);
    }
  });

  /** 지금 형식이 어느 것인지 눈으로 구분되지 않으면 바꾸려다 같은 걸 다시 고른다. */
  it("현재 형식만 활성 표시된다", () => {
    renderMenu("tel");
    const buttons = [...container.querySelectorAll("button")];
    const active = buttons.filter((b) => b.className.includes("bg-violet-500/10"));
    expect(active).toHaveLength(1);
    expect(active[0].textContent).toContain(REG_TYPE_META.tel.label);
  });

  it("고르면 그 형식으로 onPick 이 불린다", () => {
    const onPick = renderMenu("text");
    const target = [...container.querySelectorAll("button")]
      .find((b) => b.textContent?.includes(REG_TYPE_META.multiple.label));
    act(() => { target?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(onPick).toHaveBeenCalledWith("multiple");
  });
});
