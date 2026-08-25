// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 페이지 트리 — **만들고, 고르고, 순서를 바꾸고, 지운다.**
 *
 * 여기서 붙잡는 것은 전부 "화면과 서버가 다른 말을 하는" 종류다:
 *
 *  · 삭제 확정과 순서 변경이 **같은 콜백**으로 온다. 구분을 안 하면 지운 페이지가 순서
 *    목록에서만 빠지고, 서버의 `prepareReorder` 가 빠진 페이지를 "잘려 온 목록" 으로 보고
 *    **맨 뒤에 도로 붙인다** — 지웠는데 안 지워지고, 순서만 이상해진다.
 *  · 홈은 맨 앞 고정이고 지울 수 없다. 서버가 그렇게 저장하므로(`prepareReorder`·
 *    `prepareDeletePage`) 화면이 미리 지키지 않으면 끌어다 놓은 자리가 저장 뒤에 되돌아간다.
 *  · 되돌리기(5초 유예)는 **서버 왕복이 0회**여야 한다. 실행취소했는데 이미 지워져 있으면
 *    되돌리기가 아니다.
 *  · 공개 중인 페이지만 확인 단계를 거친다 — 되돌릴 수 있는 것과 밖에 나가 있는 것을
 *    같은 무게로 다루지 않는다.
 */

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const toastError = vi.fn();
/**
 * 실행취소는 sonner 토스트의 **액션 버튼**이라 DOM 에 우리 요소로 안 나온다.
 * 목이 그 핸들러를 잡아 두고, 테스트가 직접 부른다 — 확인하려는 계약은 버튼의 생김새가
 * 아니라 "그걸 누르면 commit 이 안 돈다" 이기 때문이다.
 */
const toastActions: Array<() => void> = [];
vi.mock("sonner", () => {
  const toast = Object.assign(
    (_message: string, opts?: { action?: { onClick: () => void } }) => {
      if (opts?.action?.onClick) toastActions.push(opts.action.onClick);
    },
    { error: toastError, success: vi.fn(), message: vi.fn() },
  );
  return { toast };
});

/** 가장 최근에 뜬 실행취소를 누른다. */
async function undoLatest() {
  const action = toastActions.at(-1);
  if (!action) throw new Error("실행취소가 뜨지 않았다");
  await act(async () => { action(); });
}

const { ExpoPageTree } = await import("@/components/expo/ExpoPageTree");
const { ConfirmProvider } = await import("@/components/ui/confirm-dialog");

interface Row {
  id: string; title: string; isHome: boolean; hasPublished: boolean; liveAt: string | null;
}

const PAGES: Row[] = [
  { id: "home", title: "홈", isHome: true, hasPublished: true, liveAt: null },
  { id: "about", title: "전시 소개", isHome: false, hasPublished: false, liveAt: null },
  { id: "apply", title: "참가 신청", isHome: false, hasPublished: true, liveAt: null },
];

let host: HTMLDivElement;
let root: Root;
let calls: Array<{ url: string; method: string; body: unknown }> = [];
let nextOk = true;
const onSelect = vi.fn();
const onAdd = vi.fn();
const onReload = vi.fn();
const onPendingChange = vi.fn();

function stubFetch() {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body) : null });
    return { ok: nextOk, status: nextOk ? 200 : 422, json: async () => ({ error: "안 됐어요" }) } as Response;
  }));
}

async function render(pages: Row[] = PAGES, over: Record<string, unknown> = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    root = createRoot(host);
    root.render(
      <ConfirmProvider>
        <ExpoPageTree
          siteId="s1"
          pages={pages}
          selectedId="about"
          canEdit
          canManageSite
          onSelect={onSelect}
          onAdd={onAdd}
          onReload={onReload}
          onPendingChange={onPendingChange}
          {...over}
        />
      </ConfirmProvider>,
    );
  });
}

const deleteButton = (title: string) =>
  host.querySelector<HTMLButtonElement>(`button[aria-label="${title} 페이지 삭제"]`);

const anyButton = (text: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);

const nameInput = (title: string) =>
  [...host.querySelectorAll<HTMLInputElement>("input")].find((i) => i.value === title);

async function type(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function click(el: Element | null | undefined) {
  if (!el) throw new Error("없는 버튼");
  await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  toastActions.length = 0;
  nextOk = true;
  vi.useFakeTimers();
  stubFetch();
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  host?.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("보이기", () => {
  it("페이지를 순서대로 그리고 홈을 표시한다", async () => {
    await render();
    // 이름은 이제 **고칠 수 있는 칸**이라 textContent 가 아니라 value 로 있다(0클릭 편집).
    const names = [...host.querySelectorAll<HTMLInputElement>("input")].map((i) => i.value);
    expect(names).toEqual(["홈", "전시 소개", "참가 신청"]);
  });

  /** 홈은 지울 수 없다 — 서버도 거절한다(`prepareDeletePage`). */
  it("홈에는 삭제 버튼이 없다", async () => {
    await render();
    expect(deleteButton("홈")).toBeNull();
    expect(deleteButton("전시 소개")).not.toBeNull();
  });

  it("사이트를 관리할 수 없으면 삭제 버튼을 안 그린다", async () => {
    await render(PAGES, { canManageSite: false });
    expect(deleteButton("전시 소개")).toBeNull();
  });

  it("편집할 수 없으면 페이지 추가를 안 그린다", async () => {
    await render(PAGES, { canEdit: false });
    expect([...host.querySelectorAll("button")].some((b) => b.textContent?.trim() === "페이지")).toBe(false);
  });
});

describe("삭제", () => {
  /** 5초 유예 동안은 화면에서만 사라진다 — 서버는 아직 모른다. */
  it("누르면 바로 지우지 않는다", async () => {
    await render();
    await click(deleteButton("전시 소개"));

    expect(calls).toEqual([]);
    expect(onPendingChange).toHaveBeenCalled();
    const pending = onPendingChange.mock.calls.at(-1)![0] as ReadonlySet<string>;
    expect([...pending]).toEqual(["about"]);
  });

  it("유예가 끝나면 그때 한 번 지운다", async () => {
    await render();
    await click(deleteButton("전시 소개"));
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });

    const deletes = calls.filter((c) => c.method === "DELETE");
    expect(deletes).toHaveLength(1);
    expect(deletes[0].url).toBe("/api/expo/pages/about");
  });

  /**
   * **이 파일에서 가장 중요한 검사.** 삭제 확정이 순서 변경과 같은 콜백으로 오므로,
   * 구분하지 않으면 여기서 PATCH(순서)가 나가고 페이지는 안 지워진다.
   */
  it("삭제를 순서 변경으로 착각하지 않는다", async () => {
    await render();
    await click(deleteButton("전시 소개"));
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });

    expect(calls.filter((c) => c.method === "PATCH")).toEqual([]);
  });

  /** 되돌리기가 되려면 서버 왕복이 0회여야 한다. */
  it("실행취소하면 아무 요청도 나가지 않는다", async () => {
    await render();
    await click(deleteButton("전시 소개"));
    await undoLatest();
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });

    expect(calls).toEqual([]);
  });

  /** 지운 페이지를 보고 있었으면 다른 데로 옮긴다 — 없는 페이지를 편집하게 두지 않는다. */
  it("보고 있던 페이지를 지우면 홈으로 옮긴다", async () => {
    await render();
    await click(deleteButton("전시 소개"));
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });

    expect(onSelect).toHaveBeenCalledWith("home");
  });

  it("서버가 거절하면 그대로 알리고 다시 읽지 않는다", async () => {
    await render();
    nextOk = false;
    await click(deleteButton("전시 소개"));
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });

    expect(toastError).toHaveBeenCalledWith("안 됐어요");
    expect(onReload).not.toHaveBeenCalled();
  });
});

describe("공개 중인 페이지", () => {
  const live: Row[] = [
    PAGES[0],
    { id: "about", title: "전시 소개", isHome: false, hasPublished: true, liveAt: "2026-08-01T00:00:00.000Z" },
  ];

  /**
   * 지우는 순간 파트너 사이트에서 사라진다 — 되돌릴 수 있는 것과 같은 무게로 다루지 않는다.
   */
  it("확인을 먼저 받는다", async () => {
    await render(live);
    await click(deleteButton("전시 소개"));

    expect(onPendingChange).not.toHaveBeenCalledWith(expect.objectContaining({ size: 1 }));
    expect(document.body.textContent).toContain("지금 공개 중인 페이지예요");
    // 조사를 계산한다 — "전시 소개를".
    expect(document.body.textContent).toContain("전시 소개를 지울까요?");
  });

  it("취소하면 유예도 시작하지 않는다", async () => {
    await render(live);
    await click(deleteButton("전시 소개"));
    await click(anyButton("취소"));
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });

    expect(calls).toEqual([]);
  });

  /** 확인한 뒤에는 평소와 같은 5초 유예를 탄다 — 확인했다고 되돌리기를 뺏지 않는다. */
  it("확인하면 유예를 거쳐 지운다", async () => {
    await render(live);
    await click(deleteButton("전시 소개"));
    await click(anyButton("지우기"));

    expect(calls).toEqual([]);
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(1);
  });

  /** 공개 중이 아니면 모달이 없다 — 자주 하는 일을 느리게 만들지 않는다. */
  it("공개 중이 아니면 확인하지 않는다", async () => {
    await render();
    await click(deleteButton("전시 소개"));
    expect(document.body.textContent).not.toContain("지금 공개 중인 페이지예요");
  });
});

/**
 * 이름은 **여기서** 고친다(0클릭). 가운데 칸에도 두면 같은 값을 두 곳이 저장하게 되고,
 * 한쪽이 저장 중일 때 다른 쪽이 옛 값으로 덮는 경합이 생긴다.
 */
describe("이름 고치기", () => {
  it("치는 동안에는 보내지 않는다", async () => {
    await render();
    await type(nameInput("전시 소개")!, "전시 안내");

    expect(calls).toEqual([]);
    // 화면은 곧바로 친 값을 보여 준다 — 서버 값을 쓰면 왕복 동안 글자가 되돌아간다.
    expect(nameInput("전시 안내")).toBeTruthy();
  });

  it("멈추면 그때 한 번 보낸다", async () => {
    await render();
    await type(nameInput("전시 소개")!, "전시 안내");
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

    const patches = calls.filter((c) => c.method === "PATCH");
    expect(patches).toHaveLength(1);
    expect(patches[0].url).toBe("/api/expo/pages/about");
    expect(patches[0].body).toEqual({ title: "전시 안내" });
  });

  /** 연달아 쳐도 한 번만 나간다 — 글자마다 보내면 목록을 그만큼 다시 읽는다. */
  it("연달아 쳐도 한 번만 보낸다", async () => {
    await render();
    const el = nameInput("전시 소개")!;
    for (const v of ["전", "전시", "전시 안", "전시 안내"]) {
      await type(el, v);
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    }
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

    const patches = calls.filter((c) => c.method === "PATCH");
    expect(patches).toHaveLength(1);
    expect(patches[0].body).toEqual({ title: "전시 안내" });
  });

  /** 칸을 떠나면 기다리지 않는다 — 다 쳤다는 신호다. */
  it("포커스를 떠나면 바로 보낸다", async () => {
    await render();
    const el = nameInput("전시 소개")!;
    await type(el, "전시 안내");
    // React 의 onBlur 는 focusout 위임이다 — blur 는 버블하지 않아 안 닿는다.
    await act(async () => { el.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });

    expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(1);
  });

  /** 빈 이름을 보내면 서버가 "제목 없음" 으로 바꾼다 — 지우던 중에 이름이 뒤바뀐다. */
  it("빈 이름은 보내지 않는다", async () => {
    await render();
    await type(nameInput("전시 소개")!, "   ");
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

    expect(calls).toEqual([]);
  });

  /** 고르지 않은 페이지도 여기서 바로 고칠 수 있다 — 그게 트리에 두는 값어치다. */
  it("고르지 않은 페이지도 고칠 수 있다", async () => {
    await render();
    await type(nameInput("참가 신청")!, "신청 안내");
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

    expect(calls.filter((c) => c.method === "PATCH")[0].url).toBe("/api/expo/pages/apply");
  });

  it("칸에 들어가면 그 페이지가 골라진다", async () => {
    await render();
    await act(async () => { nameInput("참가 신청")!.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); });
    expect(onSelect).toHaveBeenCalledWith("apply");
  });

  it("뷰어에게는 고칠 칸을 주지 않는다", async () => {
    await render(PAGES, { canEdit: false });
    expect(host.querySelector("input")).toBeNull();
  });
});
