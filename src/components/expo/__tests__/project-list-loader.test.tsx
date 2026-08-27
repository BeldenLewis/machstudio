// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 홈페이지 목록 로더.
 *
 * 현재 전시는 **클라이언트 저장소에서 하이드레이션**된다. 그래서 마운트 직후에는 아직
 * `null` 이고, 조금 뒤에 채워진다. 이 파일이 붙잡는 것은 그 사이에 생기는 두 가지 사고다:
 *  · 전시를 안 고른 상태의 목록(=워크스페이스 전체)이 잠깐 보이는 것
 *  · 전시를 바꿨을 때 **먼저 보낸 요청이 나중에 도착해** 옛 목록으로 덮는 것
 * 두 번째가 특히 나쁘다 — 화면은 새 전시인데 목록은 옛 전시다.
 */

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const replace = vi.fn();
let searchParams = new URLSearchParams();
let workspaceValue: {
  workspace: { id: string } | null;
  currentProject: { id: string } | null;
  isLoading: boolean;
} = { workspace: { id: "w1" }, currentProject: { id: "p1" }, isLoading: false };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => searchParams,
}));
vi.mock("@/contexts/workspace", () => ({ useWorkspace: () => workspaceValue }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const { ExpoProjectListLoader } = await import("@/components/expo/ExpoProjectListLoader");

const permissions = (over: Partial<Record<string, boolean>> = {}) => ({
  canEdit: true, canPublish: true, canManageSite: true, canManageTemplates: true, ...over,
});

const site = (id: string) => ({
  id, name: `사이트 ${id}`, projectId: "p1", siteUrl: null,
  updatedAt: "2026-08-01T00:00:00.000Z", pageCount: 3, permissions: permissions(),
});

let host: HTMLDivElement;
let root: Root;

/** 응답을 우리가 원하는 순서로 풀 수 있게 지연 가능한 fetch 목. */
function deferredFetch() {
  const pending: Array<{
    url: string;
    resolve: (body: unknown, ok?: boolean) => void;
    signal?: AbortSignal;
  }> = [];
  const fetchMock = vi.fn((url: string, init?: { signal?: AbortSignal }) => new Promise((resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    });
    pending.push({
      url,
      signal: init?.signal,
      resolve: (body, ok = true) => resolve({ ok, json: async () => body } as Response),
    });
  }));
  vi.stubGlobal("fetch", fetchMock);
  return { pending, fetchMock };
}

async function render() {
  host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    root = createRoot(host);
    root.render(<ExpoProjectListLoader />);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  workspaceValue = { workspace: { id: "w1" }, currentProject: { id: "p1" }, isLoading: false };
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  host?.remove();
  vi.unstubAllGlobals();
});

describe("문맥을 기다린다", () => {
  /** 여기서 조회하면 전시를 안 고른 상태의 목록(워크스페이스 전체)이 잠깐 보인다. */
  it("전시가 아직 없으면 조회하지 않는다", async () => {
    const { fetchMock } = deferredFetch();
    workspaceValue = { workspace: { id: "w1" }, currentProject: null, isLoading: false };
    await render();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(host.textContent).toContain("불러오는 중");
  });

  it("로딩 중에도 조회하지 않는다", async () => {
    const { fetchMock } = deferredFetch();
    workspaceValue = { workspace: null, currentProject: null, isLoading: true };
    await render();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("문맥이 오면 그 전시로 조회한다", async () => {
    const { fetchMock } = deferredFetch();
    await render();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/expo?projectId=p1");
  });
});

describe("늦게 온 응답", () => {
  /**
   * **핵심.** 전시를 바꾼 뒤 앞선 요청이 도착하면 화면은 새 전시인데 목록은 옛 전시가 된다.
   */
  it("전시가 바뀐 뒤 도착한 응답은 버린다", async () => {
    const { pending } = deferredFetch();
    await render();

    // 전시를 바꾼다 — 새 요청이 하나 더 나간다.
    workspaceValue = { workspace: { id: "w1" }, currentProject: { id: "p2" }, isLoading: false };
    await act(async () => { root.render(<ExpoProjectListLoader />); });
    expect(pending).toHaveLength(2);

    // 옛 요청이 **나중에** 도착한다.
    await act(async () => {
      pending[0].resolve({ sites: [site("old-a"), site("old-b")], permissions: permissions(), release: { publicEmbedEnabled: false } });
    });
    expect(host.textContent).not.toContain("사이트 old-a");
    expect(host.textContent).toContain("불러오는 중");

    // 새 요청이 도착하면 그것만 반영된다.
    await act(async () => {
      pending[1].resolve({ sites: [site("new-a"), site("new-b")], permissions: permissions(), release: { publicEmbedEnabled: false } });
    });
    expect(host.textContent).toContain("사이트 new-a");
    expect(host.textContent).not.toContain("사이트 old-a");
  });

  it("전시가 바뀌면 앞선 요청을 취소한다", async () => {
    const { pending } = deferredFetch();
    await render();
    const first = pending[0].signal;
    workspaceValue = { workspace: { id: "w1" }, currentProject: { id: "p2" }, isLoading: false };
    await act(async () => { root.render(<ExpoProjectListLoader />); });
    expect(first?.aborted).toBe(true);
  });

  /** 취소는 우리가 한 것이다 — 오류 화면을 띄우면 사용자가 뭘 잘못한 줄 안다. */
  it("취소가 오류 화면을 만들지 않는다", async () => {
    deferredFetch();
    await render();
    workspaceValue = { workspace: { id: "w1" }, currentProject: { id: "p2" }, isLoading: false };
    await act(async () => { root.render(<ExpoProjectListLoader />); });
    expect(host.textContent).not.toContain("불러오지 못했어요");
  });

  it("워크스페이스가 바뀌어도 같은 규칙이다", async () => {
    const { pending } = deferredFetch();
    await render();
    workspaceValue = { workspace: { id: "w2" }, currentProject: { id: "p1" }, isLoading: false };
    await act(async () => { root.render(<ExpoProjectListLoader />); });
    await act(async () => {
      pending[0].resolve({ sites: [site("old")], permissions: permissions(), release: { publicEmbedEnabled: false } });
    });
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("사이트가 하나뿐일 때", () => {
  /** 한 줄짜리 목록을 한 번 더 보여줄 이유가 없다. */
  it("바로 그 상세로 보낸다", async () => {
    const { pending } = deferredFetch();
    await render();
    await act(async () => {
      pending[0].resolve({ sites: [site("only")], permissions: permissions(), release: { publicEmbedEnabled: false } });
    });
    expect(replace).toHaveBeenCalledWith("/homepage/only");
  });

  /** `push` 면 뒤로가기가 목록↔상세를 무한히 왕복한다. */
  it("push 가 아니라 replace 다", async () => {
    const { pending } = deferredFetch();
    await render();
    await act(async () => {
      pending[0].resolve({ sites: [site("only")], permissions: permissions(), release: { publicEmbedEnabled: false } });
    });
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("?list=1 이면 머문다", async () => {
    searchParams = new URLSearchParams("list=1");
    const { pending } = deferredFetch();
    await render();
    await act(async () => {
      pending[0].resolve({ sites: [site("only")], permissions: permissions(), release: { publicEmbedEnabled: false } });
    });
    expect(replace).not.toHaveBeenCalled();
    expect(host.textContent).toContain("사이트 only");
  });
});

describe("빈 상태와 권한", () => {
  const resolveEmpty = async (pending: ReturnType<typeof deferredFetch>["pending"], canEdit: boolean) => {
    await act(async () => {
      pending[0].resolve({ sites: [], permissions: permissions({ canEdit }), release: { publicEmbedEnabled: false } });
    });
  };

  it("만들 수 있으면 주 행동 하나를 보여 준다", async () => {
    const { pending } = deferredFetch();
    await render();
    await resolveEmpty(pending, true);
    expect(host.textContent).toContain("아직 만든 홈페이지가 없어요");
    expect(host.querySelector('a[href="/homepage/new"]')).not.toBeNull();
  });

  /** 눌렀는데 403 이 나는 화면은 고장으로 읽힌다. */
  it("뷰어에게는 만들기 버튼을 보여주지 않는다", async () => {
    const { pending } = deferredFetch();
    await render();
    await resolveEmpty(pending, false);
    expect(host.textContent).toContain("아직 만든 홈페이지가 없어요");
    expect(host.querySelector('a[href="/homepage/new"]')).toBeNull();
  });
});

describe("실패", () => {
  it("응답이 실패하면 조용한 오류 상태를 보여 준다", async () => {
    const { pending } = deferredFetch();
    await render();
    await act(async () => { pending[0].resolve({}, false); });
    expect(host.textContent).toContain("불러오지 못했어요");
  });
});
