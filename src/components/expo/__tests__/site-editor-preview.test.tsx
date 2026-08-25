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
// 발행 패널이 공용 확인 모달을 쓴다 — 프로바이더 없이 렌더하면 훅이 던진다.
const { ConfirmProvider } = await import("@/components/ui/confirm-dialog");

const TOKEN = "prev-token";
const PAGE_ID = "pg1";

let permissions = {
  canEdit: true, canPublish: true, canManageSite: true, canManageTemplates: true,
};

let host: HTMLDivElement;
let root: Root;
/** 서버가 다음 PATCH 응답에 실을 값. 테스트가 바꾼다. */
let nextSave: { draftRevision: number; codeDigest: string };
let pageBody: Record<string, unknown>;
let patchCount = 0;
let liveAt: string | null = null;
/** 세우면 페이지 상세 응답을 붙잡는다 — "아직 모르는 상태" 를 만들 때 쓴다. */
let holdPageDetail: ((body: unknown) => void) | null = null;
/** 상세를 몇 번 불렀나 — 발행 뒤 다시 읽는지 여기서 본다. */
let detailCount = 0;
/** 사이트 PATCH 로 실제로 나간 본문들. 색은 자동저장이 아니라는 것을 여기서 본다. */
let sitePatches: unknown[] = [];

function stubFetch() {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body } as Response);
    if (url.startsWith("/api/expo/pages/")) {
      if (init?.method === "PATCH") {
        patchCount += 1;
        return ok({ page: { id: PAGE_ID, ...nextSave } });
      }
      // 발행·공개는 상세 조회가 아니다 — 같이 세면 "다시 읽었는가" 를 못 본다.
      if (/\/(publish|live)$/.test(url)) return ok({ page: { id: PAGE_ID } });
      if (holdPageDetail) {
        return new Promise((resolve) => {
          holdPageDetail = (body) => resolve(ok(body));
        });
      }
      detailCount += 1;
      return ok({ page: pageBody });
    }
    if (url.startsWith("/api/expo/")) {
      if (init?.method === "PATCH") {
        const body = JSON.parse(String(init.body ?? "{}"));
        sitePatches.push(body);
        return ok({ site: { theme: body.theme } });
      }
      return ok({
        site: {
          id: "s1", name: "사이트", projectId: "p1",
          previewToken: TOKEN, siteUrl: null, defaultLocale: "ko",
          theme: { accent: "#1f3a5f", lightBg: "#ffffff", darkBg: "#111318" },
        },
        pages: [{
          id: PAGE_ID, slug: "home", title: "홈", isHome: true, sortOrder: 0,
          imwebUrl: null, hasPublished: Boolean(pageBody.hasPublished), liveAt,
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
      <ConfirmProvider>
        <ExpoSiteEditor
          siteId="s1" projectId="p1" siteName="사이트"
          permissions={permissions}
          release={{ publicEmbedEnabled: false }}
        />
      </ConfirmProvider>,
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

/**
 * 페이지 이름을 고쳐 자동저장을 한 바퀴 돌린다.
 * 라벨로 찾는다 — `querySelector("input")` 는 왼쪽 칸의 색 입력을 먼저 집는다.
 */
async function editAndSave(title: string) {
  const label = [...host.querySelectorAll("label")]
    .find((el) => el.textContent?.startsWith("페이지 이름"));
  const input = label?.querySelector("input");
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
  sitePatches = [];
  liveAt = null;
  detailCount = 0;
  holdPageDetail = () => {};
  holdPageDetail = null;
  permissions = { canEdit: true, canPublish: true, canManageSite: true, canManageTemplates: true };
  nextSave = { draftRevision: 8, codeDigest: "" };
  pageBody = {
    id: PAGE_ID, slug: "home", title: "홈", imwebUrl: null,
    draft: { sections: [] }, draftRevision: 7,
    hasPublished: false, liveAt: null,
    codeDigest: "", publishedCodeDigest: "",
    readiness: {
      canPublish: true, canGoLive: false,
      publishIssues: [], liveIssues: [], notes: [],
    },
    snippets: { ok: true, page: { code: "<script></script>", src: "https://x/h/pg1" }, sections: [] },
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

/**
 * 색은 이 화면에서 **유일하게 자동저장이 아닌 값**이다.
 *
 * 공개 로더가 사이트 테마를 실시간으로 읽으므로(`app/h/[pageId]/loader.ts`) 저장하는
 * 순간 이미 붙여 둔 파트너 사이트의 색까지 바뀐다. 타이핑 중인 색이 그대로 나가면 안 된다.
 */
describe("사이트 색", () => {
  const hexInput = () => {
    const fields = [...host.querySelectorAll<HTMLInputElement>('input[type="color"]')];
    if (fields.length === 0) throw new Error("색 칸이 없다");
    return fields[0];
  };

  const setColor = async (value: string) => {
    const el = hexInput();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  it("고치는 동안에는 서버로 나가지 않는다", async () => {
    vi.useFakeTimers();
    await render();
    await setColor("#ff0000");
    // 자동저장 디바운스를 훌쩍 넘겨도 나가지 않아야 한다.
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(sitePatches).toEqual([]);
  });

  it("미리보기에 반영된다", async () => {
    vi.useFakeTimers();
    await render();
    await setColor("#ff0000");
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(frameSrc()).toContain("accent=%23ff0000");
  });

  /**
   * `<input type="color">` 는 선택기를 끄는 동안 정상 HEX 를 초당 수십 번 쏜다. 그대로
   * 주소에 실으면 PreviewFrame 이 URL 을 key 로 쓰므로 **iframe 이 매번 다시 뜨고**
   * /hp 로 그만큼 요청이 나간다.
   */
  it("고르는 동안에는 미리보기를 다시 띄우지 않는다", async () => {
    vi.useFakeTimers();
    await render();
    const before = frameSrc();

    for (const hex of ["#ff0000", "#ee0000", "#dd0000", "#cc0000"]) {
      await setColor(hex);
      await act(async () => { await vi.advanceTimersByTimeAsync(30); });
    }
    // 아직 안 멈췄다 — 주소는 그대로여야 한다.
    expect(frameSrc()).toBe(before);

    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    // 멈추고 나서 마지막 색 하나만 반영된다.
    expect(frameSrc()).toContain("accent=%23cc0000");
  });

  it("적용해야 서버로 나간다", async () => {
    await render();
    await setColor("#ff0000");
    await click(buttonByText("적용"));

    expect(sitePatches).toHaveLength(1);
    expect((sitePatches[0] as { theme: { accent: string } }).theme.accent).toBe("#ff0000");
  });

  it("적용한 뒤에는 미적용 안내가 사라진다", async () => {
    await render();
    await setColor("#ff0000");
    expect(host.textContent).toContain("아직 적용하지 않았어요");

    await click(buttonByText("적용"));
    expect(host.textContent).not.toContain("아직 적용하지 않았어요");
  });

  it("되돌리면 저장된 색으로 가고 미리보기에서도 빠진다", async () => {
    await render();
    await setColor("#ff0000");
    await click(buttonByText("되돌리기"));

    expect(sitePatches).toEqual([]);
    expect(frameSrc()).not.toContain("accent=%23ff0000");
  });

  /** 공개 중인 페이지가 있을 때만 그렇게 말한다 — 없는데 겁을 주면 문구를 안 믿게 된다. */
  it("공개 중인 페이지가 있으면 그 사실을 말한다", async () => {
    liveAt = "2026-08-01T00:00:00.000Z";
    await render();
    await setColor("#ff0000");
    expect(host.textContent).toContain("이미 공개 중인 페이지의 색도 바로 바뀝니다");
  });

  it("공개 중인 페이지가 없으면 그런 말을 하지 않는다", async () => {
    await render();
    await setColor("#ff0000");
    expect(host.textContent).not.toContain("이미 공개 중인 페이지의 색도");
  });

  /** 눌러도 실패할 버튼은 보여주지 않는다 — 서버도 MEMBER 의 색 변경을 막는다. */
  it("색을 바꿀 수 없는 사람에게는 패널을 보여주지 않는다", async () => {
    permissions = { ...permissions, canPublish: false };
    await render();
    expect(host.querySelector('input[type="color"]')).toBeNull();
  });
});

/**
 * 페이지를 바꾸면 주소는 곧바로 새 페이지가 되지만 **상세는 나중에 온다.**
 *
 * 그 사이에 미리보기를 그리면 앞 페이지의 발행 여부와 코드 지문으로 새 페이지를 한 번
 * 부른다: 발행본이 없는 페이지에 `published=1` 이 붙고, 승인한 적 없는 페이지에 앞 페이지의
 * 지문이 실린다. 서버는 거절하지만 화면에는 "코드가 바뀌었어요" 가 뜬다 — 사용자가 한
 * 적도 없는 일에 대한 경고다.
 */
describe("페이지 상세를 아직 모를 때", () => {
  it("미리보기를 그리지 않는다", async () => {
    // 상세를 붙잡아 두고 마운트한다.
    holdPageDetail = () => {};
    await render();

    expect(host.querySelector("iframe")).toBeNull();
    expect(host.textContent).toContain("미리보기를 준비하는 중이에요");
  });

  it("상세가 도착하면 그때 그린다", async () => {
    holdPageDetail = () => {};
    await render();
    const release = holdPageDetail!;

    await act(async () => { release({ page: pageBody }); });
    expect(host.querySelector("iframe")).not.toBeNull();
    expect(frameSrc()).toContain(`page=${PAGE_ID}`);
  });
});

/**
 * 색이 아닌 값을 적었을 때 — **미리보기가 거짓말하는 자리다.**
 *
 * 색이 아닌 값은 미리보기 주소에서 빠지므로 프레임에는 저장돼 있던 옛 색이 그대로 보인다.
 * 화면은 멀쩡한데 적용을 누르면 서버가 거절한다(혹은 예전에는 기본 남색으로 되돌렸다).
 * 그래서 제출 전에, 그 칸 바로 아래에서 말해야 한다.
 */
describe("색이 아닌 값", () => {
  const hexText = () => {
    const el = [...host.querySelectorAll<HTMLInputElement>("input")]
      .find((i) => i.type === "text" && /^#/.test(i.value));
    if (!el) throw new Error("HEX 칸이 없다");
    return el;
  };

  const typeHex = async (value: string) => {
    const el = hexText();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  it("그 칸 아래에서 미리 말한다", async () => {
    await render();
    // Figma 에서 복사하면 알파가 붙은 8자리가 온다.
    await typeHex("#E2532CFF");
    expect(host.textContent).toContain("#RRGGBB 형식으로 적어 주세요");
  });

  it("적용을 못 누르게 한다", async () => {
    await render();
    await typeHex("#E2532CFF");
    expect(buttonByText("적용")?.disabled).toBe(true);
  });

  it("눌러도 서버로 나가지 않는다", async () => {
    await render();
    await typeHex("#E2532CFF");
    await click(buttonByText("적용"));
    expect(sitePatches).toEqual([]);
  });

  it("고치면 다시 누를 수 있다", async () => {
    await render();
    await typeHex("#E2532CFF");
    await typeHex("#e2532c");
    expect(host.textContent).not.toContain("#RRGGBB 형식으로 적어 주세요");
    expect(buttonByText("적용")?.disabled).toBe(false);
  });
});

/**
 * **발행하면 발행본 쪽 값이 따라와야 한다.**
 *
 * 페이지 상세는 pageId 가 바뀔 때만 다시 읽는다. 발행은 그 상세를 바꾸는데(published,
 * publishedAt, 그리고 거기서 파생되는 발행본 코드 지문) 다시 읽지 않으면 편집기가
 * 세션 내내 옛 값을 들고 있게 된다 — 발행본을 보면서 "코드 실행 중" 이라고 적힌 채
 * 자리표만 뜨는 상태다.
 */
describe("발행한 뒤", () => {
  const publishButton = () =>
    [...host.querySelectorAll("button")].find((b) => /발행/.test(b.textContent ?? ""));

  it("발행 쪽 값을 다시 읽는다", async () => {
    await render();
    expect(detailCount).toBe(1);

    // 서버가 발행 뒤에 돌려줄 상태.
    pageBody.hasPublished = true;
    pageBody.publishedCodeDigest = "digest-published";
    await click(publishButton());

    expect(detailCount).toBe(2);
  });

  /** 다시 읽은 값이 실제로 미리보기에 쓰여야 한다 — 읽기만 하고 안 쓰면 같은 증상이다. */
  it("발행본을 볼 때 새 지문을 쓴다", async () => {
    pageBody.codeDigest = "digest-draft";
    await render();

    pageBody.hasPublished = true;
    pageBody.publishedCodeDigest = "digest-published";
    await click(publishButton());

    // 발행본으로 전환하고 코드 실행을 허가하면, 초안이 아니라 발행본 지문이 실려야 한다.
    await click(buttonByText("발행본"));
    await click(buttonByText("이 코드 실행하기"));
    expect(frameSrc()).toContain("codeDigest=digest-published");
    expect(frameSrc()).not.toContain("digest-draft");
  });

  /** 편집 중인 내용을 서버 사본으로 덮으면 방금 친 글이 사라진다. */
  it("초안은 덮어쓰지 않는다", async () => {
    vi.useFakeTimers();
    await render();
    await editAndSave("고친 이름");

    const label = [...host.querySelectorAll("label")]
      .find((el) => el.textContent?.startsWith("페이지 이름"));
    expect(label?.querySelector("input")?.value).toBe("고친 이름");

    pageBody.hasPublished = true;
    await act(async () => { publishButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });

    // 서버가 준 옛 제목("홈")으로 되돌아가면 안 된다.
    expect(label?.querySelector("input")?.value).toBe("고친 이름");
  });
});
