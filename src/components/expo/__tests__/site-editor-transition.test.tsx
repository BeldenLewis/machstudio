// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const navigation = vi.hoisted(() => ({
  flush: vi.fn<() => Promise<"clean">>(),
  replace: vi.fn(),
}));
const searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace, push: vi.fn() }),
  useSearchParams: () => searchParams,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/expo/ExpoProjectSync", () => ({ ExpoProjectSync: () => null }));
vi.mock("@/components/expo/ExpoTemplateSave", () => ({ ExpoTemplateSave: () => null }));
vi.mock("@/components/expo/PageDraftWorkspace", () => ({
  PageDraftWorkspace: ({ leftTop }: {
    leftTop: (draft: { flush: () => Promise<"clean"> }) => ReactNode;
  }) => <>{leftTop({ flush: navigation.flush })}</>,
}));
vi.mock("sonner", () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), message: vi.fn() });
  return { toast };
});

const { ExpoSiteEditor } = await import("@/components/expo/ExpoSiteEditor");
const { ConfirmProvider } = await import("@/components/ui/confirm-dialog");

let host: HTMLDivElement;
let root: Root;
let postGate: Promise<void>;
let releasePost: () => void;
let postStarted: Promise<void>;
let markPostStarted: () => void;
let created = false;
let siteReads = 0;
let postCount = 0;
let deleteCount = 0;

function sitePayload() {
  return {
    site: {
      id: "s1", name: "사이트", projectId: "p1", previewToken: "preview",
      siteUrl: null, defaultLocale: "ko",
      theme: { accent: "#1f3a5f", lightBg: "#ffffff", darkBg: "#111318" },
    },
    pages: [
      { id: "pg1", slug: "home", title: "홈", isHome: true, sortOrder: 0, imwebUrl: null, hasPublished: false, liveAt: null },
      { id: "pg2", slug: "about", title: "소개", isHome: false, sortOrder: 1, imwebUrl: null, hasPublished: false, liveAt: null },
      { id: "pg3", slug: "contact", title: "연락처", isHome: false, sortOrder: 2, imwebUrl: null, hasPublished: false, liveAt: null },
      ...(created ? [{ id: "pg-new", slug: "new", title: "새 페이지", isHome: false, sortOrder: 3, imwebUrl: null, hasPublished: false, liveAt: null }] : []),
    ],
    sources: [],
  };
}

function stubFetch() {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string }) => {
    if (url === "/api/expo/s1/pages" && init?.method === "POST") {
      postCount += 1;
      markPostStarted();
      await postGate;
      created = true;
      return { ok: true, status: 200, json: async () => ({ page: { id: "pg-new" } }) } as Response;
    }
    if (url.startsWith("/api/expo/pages/") && init?.method === "DELETE") {
      deleteCount += 1;
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }
    if (url === "/api/expo/s1") {
      siteReads += 1;
      return { ok: true, status: 200, json: async () => sitePayload() } as Response;
    }
    throw new Error(`unexpected fetch: ${init?.method ?? "GET"} ${url}`);
  }));
}

async function render() {
  host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    root = createRoot(host);
    root.render(
      <ConfirmProvider>
        <ExpoSiteEditor
          siteId="s1"
          projectId="p1"
          siteName="사이트"
          permissions={{ canEdit: true, canPublish: true, canManageSite: true, canManageTemplates: true }}
          release={{ publicEmbedEnabled: false }}
          previewOrigin="https://machstudio.example.com"
        />
      </ConfirmProvider>,
    );
  });
}

const button = (label: string) => [...host.querySelectorAll("button")]
  .find((node) => node.textContent?.trim() === label);

async function click(node: Element | null | undefined) {
  if (!node) throw new Error("missing button");
  await act(async () => { node.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}

async function settle() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  searchParams.delete("page");
  created = false;
  siteReads = 0;
  postCount = 0;
  deleteCount = 0;
  postGate = new Promise<void>((resolve) => { releasePost = resolve; });
  postStarted = new Promise<void>((resolve) => { markPostStarted = resolve; });
  navigation.flush.mockResolvedValue("clean");
  stubFetch();
});

afterEach(async () => {
  releasePost?.();
  await act(async () => { root?.unmount(); });
  host?.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("page navigation intent", () => {
  it("cancels a create still waiting on an older flush without a POST or duplicate flush", async () => {
    let releaseFlush!: (result: "clean") => void;
    const flushGate = new Promise<"clean">((resolve) => { releaseFlush = resolve; });
    navigation.flush.mockReturnValue(flushGate);
    await render();

    await click(button("페이지"));
    await click(button("소개"));
    expect(navigation.flush).toHaveBeenCalledTimes(2);

    releaseFlush("clean");
    await settle();

    expect(postCount).toBe(0);
    expect(navigation.flush).toHaveBeenCalledTimes(2);
    expect(navigation.replace).toHaveBeenCalledTimes(1);
    expect(navigation.replace).toHaveBeenCalledWith("?page=pg2", { scroll: false });
  });

  it("keeps a newer selection when an already-started create POST finishes later", async () => {
    await render();
    await click(button("페이지"));
    await act(async () => { await postStarted; });

    await click(button("연락처"));
    expect(navigation.replace).toHaveBeenCalledWith("?page=pg3", { scroll: false });

    releasePost();
    await settle();

    expect(postCount).toBe(1);
    expect(siteReads).toBe(2);
    expect(navigation.flush).toHaveBeenCalledTimes(2);
    expect(navigation.replace).toHaveBeenCalledTimes(1);
  });

  it("does not let a completed deletion select its fallback over a newer page", async () => {
    searchParams.set("page", "pg2");
    await render();

    await click(host.querySelector('button[aria-label="소개 페이지 삭제"]'));
    await click(button("연락처"));
    await act(async () => { await vi.advanceTimersByTimeAsync(5_100); });
    await settle();

    expect(deleteCount).toBe(1);
    expect(navigation.flush).toHaveBeenCalledTimes(2);
    expect(navigation.replace).toHaveBeenCalledTimes(1);
    expect(navigation.replace).toHaveBeenCalledWith("?page=pg3", { scroll: false });
  });
});
