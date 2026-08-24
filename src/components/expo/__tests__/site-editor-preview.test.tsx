// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 편집기 오른쪽 칸 — **무엇을, 언제, 어떤 허가로 그리는가.**
 *
 * 이 파일이 붙잡는 것 셋:
 *  · 저장될 때마다 다시 부르는가 — 안 부르면 고친 내용이 영영 안 보인다
 *  · 붙여넣은 코드를 **기본으로 실행하지 않는가** — 남이 준 스크립트다
 *  · 코드가 바뀌면 옛 허가가 **저절로 낡는가** — 확인하지 않은 코드가 도는 것을 막는다
 *
 * 마지막 것은 서버가 지문 대조로 강제하지만(`app/hp/[token]/route.ts`), 화면이 그걸
 * 모르면 운영자에게는 "눌렀는데 안 돈다" 로만 보인다. 여기서 화면 쪽을 지킨다.
 */

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const replace = vi.fn();
const searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => searchParams,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/contexts/workspace", () => ({
  useWorkspace: () => ({
    projects: [{ id: "p1" }], currentProject: { id: "p1" },
    setCurrentProject: vi.fn(), isLoading: false, workspace: { id: "w1" },
  }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

/**
 * PreviewFrame 이 칸 폭을 잰다 — jsdom 에는 ResizeObserver 가 없다.
 * **매 테스트마다 다시 심는다**: afterEach 의 `unstubAllGlobals` 가 지우기 때문에
 * 모듈 최상단에서 한 번만 심으면 두 번째 테스트부터 터진다.
 */
class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const { ExpoSiteEditor } = await import("@/components/expo/ExpoSiteEditor");

const TOKEN = "prev-token";
const PAGE_ID = "pg1";

const permissions = {
  canEdit: true, canPublish: true, canManageSite: true, canManageTemplates: true,
};

let host: HTMLDivElement;
let root: Root;
/** 서버가 다음 PATCH 응답에 실을 값. 테스트가 바꾼다. */
let nextSave: { draftRevision: number; codeDigest: string };
let pageBody: Record<string, unknown>;
let patchCount = 0;

function stubFetch() {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string }) => {
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body } as Response);
    if (url.startsWith("/api/expo/pages/")) {
      if (init?.method === "PATCH") {
        patchCount += 1;
        return ok({ page: { id: PAGE_ID, ...nextSave } });
      }
      return ok({ page: pageBody });
    }
    if (url.startsWith("/api/expo/")) {
      return ok({
        site: {
          id: "s1", name: "사이트", projectId: "p1",
          previewToken: TOKEN, siteUrl: null, defaultLocale: "ko",
        },
        pages: [{
          id: PAGE_ID, slug: "home", title: "홈", isHome: true, sortOrder: 0,
          imwebUrl: null, hasPublished: Boolean(pageBody.hasPublished), liveAt: null,
        }],
        sources: [],
      });
    }
    return ok({});
  }));
}

async function render() {
  host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    root = createRoot(host);
    root.render(
      <ExpoSiteEditor
        siteId="s1" projectId="p1" siteName="사이트"
        permissions={permissions}
        release={{ publicEmbedEnabled: false }}
      />,
    );
  });
}

const frameSrc = () => host.querySelector("iframe")?.getAttribute("src") ?? "";
const buttonByText = (text: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);

async function click(el: Element | undefined) {
  if (!el) throw new Error("없는 버튼");
  await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}

/** 페이지 이름을 고쳐 자동저장을 한 바퀴 돌린다. */
async function editAndSave(title: string) {
  const input = host.querySelector<HTMLInputElement>('input[value="홈"], input');
  if (!input) throw new Error("이름 칸이 없다");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, title);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  // 디바운스(900ms)를 넘긴다.
  await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
}

beforeEach(() => {
  vi.clearAllMocks();
  patchCount = 0;
  nextSave = { draftRevision: 8, codeDigest: "" };
  pageBody = {
    id: PAGE_ID, slug: "home", title: "홈", imwebUrl: null,
    draft: { sections: [] }, draftRevision: 7,
    hasPublished: false, liveAt: null,
    codeDigest: "", publishedCodeDigest: "",
  };
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  stubFetch();
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  host?.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("미리보기 주소", () => {
  it("이 사이트의 미리보기 토큰과 고른 페이지를 가리킨다", async () => {
    await render();
    expect(frameSrc()).toContain(`/hp/${TOKEN}`);
    expect(frameSrc()).toContain(`page=${PAGE_ID}`);
  });

  /** 저장될 때마다 다시 안 부르면 고친 내용이 미리보기에 영영 안 보인다. */
  it("저장 번호가 바뀌면 다시 부른다", async () => {
    vi.useFakeTimers();
    await render();
    const before = frameSrc();

    nextSave = { draftRevision: 9, codeDigest: "" };
    await editAndSave("바뀐 이름");

    expect(patchCount).toBe(1);
    expect(frameSrc()).not.toBe(before);
    expect(frameSrc()).toContain("_r=9");
  });

  /** 발행본이 없는데 고르는 칸을 보여 주면 고장으로 읽힌다. */
  it("발행본이 없으면 초안·발행본 선택기를 그리지 않는다", async () => {
    await render();
    expect(host.querySelector('[aria-label="무엇을 보는가"]')).toBeNull();
  });

  it("발행본이 있으면 골라서 볼 수 있다", async () => {
    pageBody.hasPublished = true;
    await render();
    await click(buttonByText("발행본"));
    expect(frameSrc()).toContain("published=1");
  });
});

describe("붙여넣은 코드", () => {
  beforeEach(() => {
    pageBody.codeDigest = "digest-one";
  });

  it("기본으로 실행하지 않는다", async () => {
    await render();
    expect(frameSrc()).not.toContain("customCode");
    expect(host.textContent).toContain("아직 실행하지 않았어요");
  });

  it("확인하면 그 지문으로만 실행을 요청한다", async () => {
    await render();
    await click(buttonByText("이 코드 실행하기"));

    expect(frameSrc()).toContain("customCode=run");
    expect(frameSrc()).toContain("codeDigest=digest-one");
    expect(host.textContent).toContain("실행 중이에요");
  });

  it("멈추면 다시 실행을 요청하지 않는다", async () => {
    await render();
    await click(buttonByText("이 코드 실행하기"));
    await click(buttonByText("멈추기"));
    expect(frameSrc()).not.toContain("customCode");
  });

  /**
   * **이 파일에서 가장 중요한 성질.** 코드를 고치면 서버가 계산하는 지문이 바뀌므로 옛
   * 허가는 무효다. 화면도 그 사실을 알고 다시 물어야 한다 — 안 그러면 "실행 중" 이라고
   * 적힌 채 아무것도 안 도는 상태가 된다.
   */
  it("코드가 바뀌면 허가가 낡고 다시 묻는다", async () => {
    vi.useFakeTimers();
    await render();
    await click(buttonByText("이 코드 실행하기"));
    expect(frameSrc()).toContain("codeDigest=digest-one");

    nextSave = { draftRevision: 9, codeDigest: "digest-two" };
    await editAndSave("코드 고친 뒤");

    expect(frameSrc()).not.toContain("customCode");
    expect(host.textContent).toContain("코드가 바뀌었어요");
    expect(buttonByText("이 코드 실행하기")).toBeTruthy();
  });

  /** 코드 구획이 없으면 물을 것도 없다. */
  it("코드가 없으면 아무것도 묻지 않는다", async () => {
    pageBody.codeDigest = "";
    await render();
    expect(host.textContent).not.toContain("아직 실행하지 않았어요");
  });
});
