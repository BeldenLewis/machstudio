// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DeployTab from "../DeployTab";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const workspaceContext = {
  workspace: { id: "ws-1" },
  currentProject: { id: "sidebar-project" },
};

vi.mock("@/contexts/workspace", () => ({
  useWorkspace: () => workspaceContext,
}));

vi.mock("@/components/ui/confirm-dialog", () => ({
  useConfirm: () => vi.fn().mockResolvedValue(false),
}));

vi.mock("@/lib/app-url", () => ({
  getPublicAppOrigin: () => "https://app.example.com",
}));

vi.mock("@/components/ui/use-autosave", () => ({
  useAutosave: () => ({ state: "saved", retry: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

let host: HTMLDivElement | null = null;
let root: Root | null = null;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function render() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <DeployTab
        webinarId="webinar-1"
        projectId="url-project"
        slug="url-webinar"
        webinarName="URL 웨비나"
        components={null}
        onSilentUpdate={() => {}}
      />,
    );
  });
  return host;
}

beforeEach(() => {
  window.scrollTo = vi.fn();
  vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve({
    ok: true,
    json: async () => url.startsWith("/api/webinar-embed-sites") ? { sites: [] } : { webinar: null },
  })));
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  host = null;
  root = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("배포 탭은 URL 웨비나의 프로젝트에만 사이트를 연결한다", () => {
  it("목록과 생성 요청 모두 사이드바가 아닌 URL 웨비나 프로젝트를 쓴다", async () => {
    const el = render();
    const fetchMock = vi.mocked(fetch);
    await flush();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/webinar-embed-sites?workspaceId=ws-1&projectId=url-project",
    );
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("sidebar-project"))).toBe(false);

    const openCreate = [...el.querySelectorAll("button")].find((button) => button.textContent?.includes("새 사이트 연결"));
    act(() => { openCreate?.click(); });
    const nameInput = el.querySelector<HTMLInputElement>('input[placeholder^="사이트 이름"]');
    expect(nameInput).not.toBeNull();
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(nameInput, "행사 사이트");
      nameInput!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const create = [...el.querySelectorAll("button")].find((button) => button.textContent?.includes("이 웨비나로 연결하기"));
    act(() => { create?.click(); });
    await flush();

    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(postCall?.[1]?.body))).toMatchObject({
      workspaceId: "ws-1",
      projectId: "url-project",
      activeWebinarId: "webinar-1",
    });
  });
});
