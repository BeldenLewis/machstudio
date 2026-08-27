// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditableList } from "@/components/ui/editable-list";

/**
 * 드래그 핸들의 **순서 변경 안내가 실제로 읽히는가.**
 *
 * ── 무엇이 고장나 있었나 ──────────────────────────────────────────────
 * dnd-kit 은 `DndContext` 에 id 를 주지 않으면 **모듈 전역 카운터**로 만든다
 * (`useUniqueId("DndDescribedBy")`). 그 카운터가 소비되는 횟수가 안내문을 그린 렌더와
 * 핸들 속성을 그린 렌더에서 달라지면, 핸들의 `aria-describedby` 가 **없는 요소**를 가리킨다.
 * React 는 이걸 고쳐 주지 않는다("This won't be patched up").
 *
 * 실측(2026-08-24, /dev/expo-sections-harness):
 *   id 없이  → 핸들 3종 전부 dangling. 안내문은 DndDescribedBy-0/2/4 로 있는데
 *              핸들은 -6/-7/-8 을 가리켰다. 즉 스크린리더가 순서 변경 방법을 못 읽는다.
 *   id 주고  → dangling 0.
 *
 * 눈에 보이는 증상이 없어서(마우스로는 멀쩡히 끌린다) 테스트가 없으면 조용히 되돌아간다.
 */

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let host: HTMLDivElement;
let root: Root;

interface Row { id: string; label: string }

function List({ listId, items }: { listId: string; items: Row[] }) {
  return (
    <EditableList<Row>
      listId={listId}
      itemNoun="항목"
      items={items}
      onChange={() => {}}
      rowKey={(row) => row.id}
      reorderable
      renderRow={({ item }) => <span>{item.label}</span>}
    />
  );
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  host?.remove();
  vi.useRealTimers();
});

const handles = () => [...document.querySelectorAll('[aria-roledescription="sortable"]')];

async function render(node: React.ReactNode) {
  await act(async () => {
    root = createRoot(host);
    root.render(node);
  });
}

describe("순서 변경 안내", () => {
  /**
   * 이 검사는 **jsdom 에서는 깨지지 않는다** — SSR 도 이중 렌더도 없어서 카운터가 우연히
   * 맞는다(변이 주입으로 확인: id 를 빼도 통과한다). 목표를 적어 두는 검사이고, 실제 증거는
   * 브라우저 실측이다. 회귀를 실제로 붙잡는 것은 아래의 "id 는 listId 다" 쪽이다.
   */
  it("핸들의 aria-describedby 가 실재하는 요소를 가리킨다", async () => {
    await render(<List listId="alpha" items={[{ id: "a", label: "가" }, { id: "b", label: "나" }]} />);

    const refs = handles().map((h) => h.getAttribute("aria-describedby"));
    expect(refs).toHaveLength(2);
    for (const ref of refs) {
      expect(ref, "aria-describedby 가 비어 있다").toBeTruthy();
      // 안내문은 body 로 포탈된다 — host 가 아니라 document 에서 찾는다.
      expect(document.getElementById(ref!), `가리키는 요소가 없다: ${ref}`).not.toBeNull();
    }
  });

  /** listId 를 그대로 쓴다 — 그래야 서버와 브라우저가 같은 값을 낸다. */
  it("안내문 id 는 listId 다 — 렌더 순서에 흔들리지 않는다", async () => {
    await render(<List listId="alpha" items={[{ id: "a", label: "가" }]} />);
    expect(handles()[0].getAttribute("aria-describedby")).toBe("alpha");
  });

  /**
   * 목록이 겹쳐도 안내문 id 가 부딪히면 안 된다 — 같은 id 가 둘이면 어느 쪽을 읽을지
   * 브라우저가 정하고, 그건 우리가 고른 것이 아니다.
   */
  it("목록이 여러 개여도 id 가 겹치지 않는다", async () => {
    await render(
      <>
        <List listId="alpha" items={[{ id: "a", label: "가" }]} />
        <List listId="beta" items={[{ id: "b", label: "나" }]} />
      </>,
    );

    const refs = handles().map((h) => h.getAttribute("aria-describedby"));
    expect(new Set(refs).size).toBe(refs.length);
    for (const ref of refs) {
      expect(document.querySelectorAll(`[id="${ref}"]`)).toHaveLength(1);
    }
  });
});
