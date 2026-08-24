// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 상세 진입 시 사이드바 전시 맞추기.
 *
 * ── 이 파일이 막는 사고 ───────────────────────────────────────────────
 * 딥링크로 상세에 바로 들어오면 사이드바에는 엉뚱한 전시가 떠 있다. 그 상태에서 화면이
 * 형제 자원을 사이드바 문맥으로 조회하면 다른 전시의 것이 섞인다. 이 저장소는 실제로
 * 겪었다 — 웨비나 배포 탭이 사이드바의 현재 프로젝트로 아임웹 사이트를 조회·변경해서,
 * 딥링크로 들어오면 **다른 전시의 공개 노출이 성공 토스트와 함께 바뀌었다.**
 *
 * 소속은 **URL 자원**에서 온다. 이 컴포넌트는 그걸 사이드바에 반영할 뿐이다.
 */

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const replace = vi.fn();
const setCurrentProject = vi.fn();
let workspaceValue: {
  projects: Array<{ id: string; name: string }>;
  currentProject: { id: string } | null;
  isLoading: boolean;
  setCurrentProject: typeof setCurrentProject;
};

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/contexts/workspace", () => ({ useWorkspace: () => workspaceValue }));

const { ExpoProjectSync } = await import("@/components/expo/ExpoProjectSync");

let host: HTMLDivElement;
let root: Root;

async function render(projectId = "p-site") {
  host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    root = createRoot(host);
    root.render(<ExpoProjectSync projectId={projectId} />);
  });
}

const rerender = async (projectId = "p-site") => {
  await act(async () => { root.render(<ExpoProjectSync projectId={projectId} />); });
};

beforeEach(() => {
  vi.clearAllMocks();
  workspaceValue = {
    projects: [{ id: "p-site", name: "이 전시" }, { id: "p-other", name: "다른 전시" }],
    currentProject: { id: "p-other" },
    isLoading: false,
    setCurrentProject,
  };
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  host?.remove();
});

describe("들어올 때", () => {
  it("사이드바를 그 사이트의 전시로 맞춘다", async () => {
    await render();
    expect(setCurrentProject).toHaveBeenCalledWith({ id: "p-site", name: "이 전시" });
  });

  it("이미 맞으면 아무것도 하지 않는다", async () => {
    workspaceValue.currentProject = { id: "p-site" };
    await render();
    expect(setCurrentProject).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  /** 문맥이 아직 안 왔을 뿐이다 — 화면을 깨뜨리지 않고 기다린다. */
  it("로딩 중에는 기다린다", async () => {
    workspaceValue.isLoading = true;
    await render();
    expect(setCurrentProject).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  /** 다른 워크스페이스이거나 목록이 아직 안 왔다. 서버가 이미 소유권을 확인했다. */
  it("목록에 없으면 조용히 기다린다", async () => {
    workspaceValue.projects = [{ id: "p-other", name: "다른 전시" }];
    await render();
    expect(setCurrentProject).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("아무것도 그리지 않는다", async () => {
    await render();
    expect(host.innerHTML).toBe("");
  });
});

describe("열어 둔 채 전시를 바꾸면", () => {
  /**
   * 그 자리에 남아 있으면 화면은 새 전시인데 저장은 옛 사이트로 들어간다 —
   * **보이지 않는 변경**이다.
   */
  it("목록으로 보낸다", async () => {
    workspaceValue.currentProject = { id: "p-site" };
    await render();
    expect(replace).not.toHaveBeenCalled();

    workspaceValue = { ...workspaceValue, currentProject: { id: "p-other" } };
    await rerender();
    expect(replace).toHaveBeenCalledWith("/homepage?list=1");
  });

  /** `?list=1` 이 없으면 사이트가 하나뿐인 워크스페이스에서 상세로 다시 튕겨 무한 왕복이 된다. */
  it("목록에 머무르는 탈출구를 붙여 보낸다", async () => {
    workspaceValue.currentProject = { id: "p-site" };
    await render();
    workspaceValue = { ...workspaceValue, currentProject: { id: "p-other" } };
    await rerender();
    expect(replace.mock.calls[0][0]).toContain("list=1");
  });

  /** 우리가 맞춘 것 자체를 "사용자가 바꿨다" 로 오인하면 들어오자마자 목록으로 튕긴다. */
  it("우리가 맞춘 것을 변경으로 오인하지 않는다", async () => {
    await render();
    expect(setCurrentProject).toHaveBeenCalledTimes(1);

    // 맞춘 결과가 문맥에 반영된 상태로 다시 렌더된다.
    workspaceValue = { ...workspaceValue, currentProject: { id: "p-site" } };
    await rerender();
    expect(replace).not.toHaveBeenCalled();
  });
});
