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
const { expoSectionTitle } = await import("@/components/expo/ExpoSectionTree");
const { mergeEditorIssues, resolveExpoFieldFocusTarget } = await import("@/components/expo/PageDraftWorkspace");
const { instantiateStkHomeV1 } = await import("@/lib/expo/presets/stk-home-v1");
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
/** 세우면 다음 draft PATCH 를 422 로 거절한다 — 서버가 값을 거절한 상황. */
let rejectNext: { errors: Array<{ path: string; message: string; sid?: string }> } | null = null;
let pageBody: Record<string, unknown>;
let patchCount = 0;
let liveAt: string | null = null;
/** 세우면 페이지 상세 응답을 붙잡는다 — "아직 모르는 상태" 를 만들 때 쓴다. */
let holdPageDetail: ((body: unknown) => void) | null = null;
/** 상세를 몇 번 불렀나 — 발행 뒤 다시 읽는지 여기서 본다. */
let detailCount = 0;
/** 사이트 PATCH 로 실제로 나간 본문들. 색은 자동저장이 아니라는 것을 여기서 본다. */
let sitePatches: unknown[] = [];
/** 목록이 돌려주는 이름. 트리의 이름 PATCH 가 서버처럼 이걸 바꾼다. */
let listTitle = "홈";
let nextExportFailure: { issues: Array<{ path: string; code: string; message: string; severity: "error"; sid?: string }> } | null = null;
let includeSecondPage = false;
let conflictNext = false;
let transportFailureNext = false;
let draftSaveGate: Promise<void> | null = null;

function stubFetch() {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body } as Response);
    if (url.startsWith("/api/expo/pages/")) {
      if (url.endsWith("/export") && init?.method === "POST" && nextExportFailure) {
        return { ok: false, status: 422, json: async () => nextExportFailure } as Response;
      }
      if (init?.method === "PATCH") {
        const body = JSON.parse(String(init.body ?? "{}"));
        // 이름 바꾸기는 자동저장이 아니다 — 트리가 따로 보낸다. 같이 세면 저장 횟수가 거짓말한다.
        if (typeof body.title === "string" && body.draft === undefined) {
          listTitle = body.title;
          return ok({ page: { id: PAGE_ID, title: body.title } });
        }
        if (typeof body.title === "string") listTitle = body.title;
        patchCount += 1;
        if (draftSaveGate) await draftSaveGate;
        if (transportFailureNext) {
          transportFailureNext = false;
          return { ok: false, status: 503, json: async () => ({ error: "temporarily unavailable" }) } as Response;
        }
        if (conflictNext) {
          conflictNext = false;
          return {
            ok: false, status: 409,
            json: async () => ({ draftRevision: 12, draft: pageBody.draft }),
          } as Response;
        }
        if (rejectNext) {
          const payload = rejectNext;
          return { ok: false, status: 422, json: async () => payload } as Response;
        }
        pageBody = {
          ...pageBody,
          title: typeof body.title === "string" ? body.title : pageBody.title,
          imwebUrl: body.imwebUrl ?? pageBody.imwebUrl,
          draft: body.draft ?? pageBody.draft,
          draftRevision: nextSave.draftRevision,
          codeDigest: nextSave.codeDigest,
        };
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
          id: PAGE_ID, slug: "home", title: listTitle, isHome: true, sortOrder: 0,
          imwebUrl: null, hasPublished: Boolean(pageBody.hasPublished), liveAt,
        }, ...(includeSecondPage ? [{
          id: "pg2", slug: "about", title: "소개", isHome: false, sortOrder: 1,
          imwebUrl: null, hasPublished: false, liveAt: null,
        }] : [])],
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
          previewOrigin="https://machstudio.example.com"
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
 * 자동저장을 한 바퀴 돌린다.
 *
 * **이름이 아니라 아임웹 주소를 고친다** — 페이지 이름은 왼쪽 트리로 옮겨 갔고 거기서
 * 따로 저장한다(같은 값을 두 곳이 저장하면 경합이 생긴다). 가운데 칸의 자동저장을
 * 건드리려면 이 칸이 맞다.
 */
async function editAndSave(value: string) {
  const label = [...host.querySelectorAll("label")]
    .find((el) => el.textContent?.startsWith("아임웹 주소"));
  const input = label?.querySelector("input");
  if (!input) throw new Error("아임웹 주소 칸이 없다");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  // 디바운스(900ms)를 넘긴다.
  await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
}

beforeEach(() => {
  vi.clearAllMocks();
  patchCount = 0;
  sitePatches = [];
  listTitle = "홈";
  rejectNext = null;
  nextExportFailure = null;
  includeSecondPage = false;
  conflictNext = false;
  transportFailureNext = false;
  draftSaveGate = null;
  liveAt = null;
  detailCount = 0;
  holdPageDetail = () => {};
  holdPageDetail = null;
  permissions = { canEdit: true, canPublish: true, canManageSite: true, canManageTemplates: true };
  nextSave = { draftRevision: 8, codeDigest: "" };
  pageBody = {
    id: PAGE_ID, siteId: "s1", slug: "home", title: "홈", imwebUrl: null,
    draft: { schemaVersion: 2, sections: [] }, draftRevision: 7,
    hasPublished: false, publishedAt: null, liveAt: null,
    updatedAt: "2026-09-01T00:00:00.000Z",
    codeDigest: "", publishedCodeDigest: "",
    readiness: {
      canPublish: true, canGoLive: false,
      publishIssues: [], liveIssues: [], notes: [],
    },
    snippets: { ok: true, page: { code: "<script></script>", src: "https://x/h/pg1" }, sections: [] },
    exportSections: [],
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

  it("캠페인 가정만 주소에 바꾸고 초안과 자동저장은 건드리지 않는다", async () => {
    await render();
    const beforeDraft = structuredClone(pageBody.draft);
    const beforePatches = patchCount;
    const select = host.querySelector<HTMLSelectElement>('select[aria-label="캠페인 미리보기"]')!;
    await act(async () => {
      select.value = "both";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(frameSrc()).toContain("campaignState=both");
    expect(pageBody.draft).toEqual(beforeDraft);
    expect(patchCount).toBe(beforePatches);
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

  /**
   * 색은 **프레임에 밀어 넣는다** — 주소에 싣지 않는다.
   *
   * 전에는 URL 에 실었는데, `<input type="color">` 가 선택기를 끄는 동안 정상 HEX 를 초당
   * 수십 번 쏘고 PreviewFrame 이 URL 을 key 로 쓰는 탓에 **iframe 이 그만큼 파괴·재생성**됐다.
   * 프레임 안쪽은 처음부터 `mach-expo-preview-theme` 를 받을 줄 알았다(`preview-bridge.ts`).
   */
  it("미리보기 주소를 바꾸지 않는다 — 프레임을 다시 안 띄운다", async () => {
    await render();
    const before = frameSrc();

    for (const hex of ["#ff0000", "#ee0000", "#dd0000", "#cc0000"]) {
      await setColor(hex);
    }
    expect(frameSrc()).toBe(before);
  });

  it("프레임에 색을 밀어 넣는다", async () => {
    await render();
    const frame = host.querySelector("iframe")!;
    const posted: unknown[] = [];
    // jsdom 의 contentWindow 는 실제 창이라 postMessage 를 가로채 볼 수 있다.
    Object.defineProperty(frame, "contentWindow", {
      value: { postMessage: (msg: unknown) => { posted.push(msg); } },
      configurable: true,
    });

    await setColor("#ff0000");

    const theme = posted.find((m) => (m as { type?: string }).type === "mach-expo-preview-theme");
    expect(theme).toMatchObject({
      pageId: PAGE_ID,
      theme: expect.objectContaining({ accent: "#ff0000" }),
    });
  });

  /** 통로가 붙으려면 채널이 주소에 실려야 한다 — 없으면 프레임이 통로를 아예 안 만든다. */
  it("미리보기 주소에 채널을 싣는다", async () => {
    await render();
    expect(frameSrc()).toMatch(/channel=[0-9a-f-]{8,}/);
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
    await editAndSave("https://example.com/새주소");

    const label = [...host.querySelectorAll("label")]
      .find((el) => el.textContent?.startsWith("아임웹 주소"));
    expect(label?.querySelector("input")?.value).toBe("https://example.com/새주소");

    pageBody.hasPublished = true;
    await act(async () => { publishButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });

    // 서버가 준 옛 값(null)으로 되돌아가면 안 된다.
    expect(label?.querySelector("input")?.value).toBe("https://example.com/새주소");
  });
});

/**
 * 이름의 출처는 **하나**여야 한다.
 *
 * 페이지 이름은 왼쪽 트리에서 고치는데, 가운데 칸의 상세는 `pageId` 가 바뀔 때만 다시
 * 읽는다. 그래서 상세가 실어 보낸 이름을 오른쪽 칸이 쓰면, 이름을 고쳐도 **페이지를
 * 떠났다 돌아오기 전까지** 발행 패널이 옛 이름을 단다 — 그 이름은 공개 스위치를
 * 스크린리더가 읽는 이름이기도 하다("○○ 아임웹에 내보내기").
 */
/**
 * **422 는 조용히 사라지면 안 된다.**
 *
 * 예전에는 `!res.ok` 를 전부 `failed` 로 뭉갰다. `failed` 는 기준선을 유지해 **다음 변경마다
 * 다시 시도**되는데, 서버가 값을 거절한 것이므로 같은 값은 영원히 거절이다. 화면에는 이유가
 * 한 글자도 안 떴다 — 운영자는 저장이 안 되고 있다는 사실조차 몰랐다.
 * 쓰기 검증을 강하게 만들면서 이 처리를 같이 고치지 않으면 그 상태가 흔해진다.
 */
describe("서버가 값을 거절하면", () => {
  const bannerText = () => host.textContent ?? "";

  it("이유를 화면에 올린다", async () => {
    vi.useFakeTimers();
    await render();
    rejectNext = { errors: [{ path: "sections[0].sid", message: "구획 하나가 신원 없이 왔어요.", sid: "sid-1" }] };
    await editAndSave("https://example.com/x");

    expect(bannerText()).toContain("저장하지 못했어요");
    expect(bannerText()).toContain("구획 하나가 신원 없이 왔어요");
  });

  /** 409(다른 곳에서 먼저 저장)와 갈라야 한다 — 그건 기다리면 풀리고 이건 고쳐야 풀린다. */
  it("409 배너와 다른 문구를 쓴다", async () => {
    vi.useFakeTimers();
    await render();
    rejectNext = { errors: [{ path: "sections", message: "값이 안 돼요." }] };
    await editAndSave("https://example.com/x");
    expect(bannerText()).not.toContain("다른 곳에서 먼저 저장했어요");
  });

  /** 값을 고치면 안내가 사라지고 다시 시도된다 — 막힌 채로 두지 않는다. */
  it("값을 고치면 안내가 사라지고 다시 보낸다", async () => {
    vi.useFakeTimers();
    await render();
    rejectNext = { errors: [{ path: "sections", message: "값이 안 돼요." }] };
    await editAndSave("https://example.com/x");
    expect(bannerText()).toContain("저장하지 못했어요");

    rejectNext = null;
    const before = patchCount;
    await editAndSave("https://example.com/고침");

    expect(patchCount).toBeGreaterThan(before);
    expect(bannerText()).not.toContain("저장하지 못했어요");
  });

  /** 이유가 비어 있어도 무언가는 말한다 — 빈 배너가 뜨면 고장으로 읽힌다. */
  it("서버가 이유를 안 주면 일반 문구라도 낸다", async () => {
    vi.useFakeTimers();
    await render();
    rejectNext = { errors: [] };
    await editAndSave("https://example.com/x");
    expect(bannerText()).toContain("저장할 수 없는 값이 있어요");
  });
});

describe("발행 준비 문제", () => {
  it.each([
    ["self", '<input id="target" data-field-path="field.path">'],
    ["ancestor", '<div data-field-path="field.path"><input id="target"></div>'],
    ["sibling", '<div data-field-focus-scope><input id="target"><p data-field-path="field.path">오류</p></div>'],
    ["explicit", '<input id="target"><p data-field-path="field.path" data-field-focus-target="target">오류</p>'],
  ])("field focus resolver supports %s markers", (_mode, markup) => {
    const rootElement = document.createElement("main");
    rootElement.innerHTML = markup;
    document.body.appendChild(rootElement);
    const target = resolveExpoFieldFocusTarget(rootElement, new Set(["field.path"]))?.element;
    target?.focus();
    expect(target).toBeInstanceOf(HTMLInputElement);
    expect(document.activeElement).toBe(target);
    rootElement.remove();
  });

  it("경로가 있는 준비 문제를 정확히 보존하고 저장 거절 중복만 제거한다", () => {
    const readinessIssue = {
      path: "sections[1].content.items[0].title",
      code: "required-title",
      message: "하위 전시 이름이 필요해요",
      severity: "warning" as const,
      sid: "section-2",
    };
    expect(mergeEditorIssues(
      [readinessIssue, { code: "not-published", message: "발행 전이에요" }],
      [
        { path: readinessIssue.path, message: readinessIssue.message, sid: readinessIssue.sid },
        { path: "settings.event.startsAt", message: "시작 시각이 필요해요" },
      ],
    )).toEqual([
      readinessIssue,
      {
        path: "settings.event.startsAt",
        code: "rejected",
        message: "시작 시각이 필요해요",
        severity: "error",
      },
    ]);
  });

  it("문제가 있는 구획을 고르면 같은 필드의 인라인 오류를 보여 준다", async () => {
    const draft = instantiateStkHomeV1({
      randomUUID: (() => {
        let serial = 0;
        return () => `00000000-0000-4000-8000-${String(++serial).padStart(12, "0")}`;
      })(),
    });
    const targetIndex = draft.sections.findIndex((section) => section.type === "exhibition-grid");
    const target = draft.sections[targetIndex];
    const path = `sections[${targetIndex}].content.items[0].title`;
    pageBody.draft = draft;
    pageBody.readiness = {
      canPublish: false,
      canGoLive: false,
      publishIssues: [{
        path,
        code: "required-title",
        message: "하위 전시 이름이 필요해요",
        severity: "error",
        sid: target.sid,
      }],
      liveIssues: [],
      notes: [],
    };

    await render();
    expect([...host.querySelectorAll("[data-field-path]")]
      .some((element) => element.textContent === "하위 전시 이름이 필요해요")).toBe(false);
    await click(host.querySelector(`button[aria-label="${expoSectionTitle(target)} 편집"]`) ?? undefined);
    const inlineIssue = [...host.querySelectorAll("[data-field-path]")]
      .find((element) => element.textContent === "하위 전시 이름이 필요해요");
    expect(inlineIssue).toBeTruthy();
  });

  it("백업 HTML 오류의 sid와 path로 구획을 고르고 해당 필드 오류에 포커스한다", async () => {
    const draft = instantiateStkHomeV1({
      randomUUID: (() => {
        let serial = 0;
        return () => `00000000-0000-4000-8000-${String(++serial).padStart(12, "0")}`;
      })(),
    });
    const targetIndex = draft.sections.findIndex((section) => section.type === "exhibition-grid");
    const target = draft.sections[targetIndex];
    const path = `sections[${targetIndex}].content.items[0].title`;
    pageBody.draft = draft;
    pageBody.hasPublished = true;
    pageBody.exportSections = [{ sid: target.sid, label: expoSectionTitle(target) }];
    nextExportFailure = {
      issues: [{ path, code: "standalone-media-public-https", message: "이 구획의 값을 확인해 주세요.", severity: "error", sid: target.sid }],
    };

    await render();
    await click(buttonByText(`${expoSectionTitle(target)} HTML 다운로드`));

    expect(host.querySelector(`[aria-label="${expoSectionTitle(target)} 편집기"]`)).toBeTruthy();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("1번 하위 전시 이름");
    expect(document.activeElement?.getAttribute("data-field-path")).toBe("[0].title");

    const pageTitle = host.querySelector<HTMLInputElement>('input[aria-label="페이지 제목"]');
    await act(async () => { pageTitle?.focus(); });
    expect(document.activeElement).toBe(pageTitle);
    await click(buttonByText("이 구획의 값을 확인해 주세요."));
    expect(document.activeElement?.getAttribute("aria-label")).toBe("1번 하위 전시 이름");
  });

  it("일반 구획의 백업 미디어 오류는 실제 주소 입력에 포커스한다", async () => {
    const target = {
      sid: "33333333-3333-4333-8333-333333333333",
      type: "kv", variant: "column", enabled: true, embedEnabled: false,
      design: { bg: "light", align: "left" },
      content: {
        title: { ko: "키비주얼" },
        media: { kind: "image", url: "http://127.0.0.1/private.jpg" },
      },
    };
    pageBody.draft = { schemaVersion: 2, sections: [target] };
    pageBody.hasPublished = true;
    pageBody.exportSections = [{ sid: target.sid, label: "키비주얼" }];
    nextExportFailure = {
      issues: [{
        path: "sections[0].content.media.url", code: "standalone-media-public-https",
        message: "공개 HTTPS 주소가 필요해요.", severity: "error", sid: target.sid,
      }],
    };

    await render();
    await click(buttonByText("키비주얼 HTML 다운로드"));

    expect(document.activeElement?.getAttribute("aria-label")).toBe("배경 이미지 주소");
    expect(document.activeElement?.getAttribute("data-field-path")).toBe("media.url");
    expect(host.textContent).toContain("공개 HTTPS 주소가 필요해요.");
  });

  it("커스텀 표 미디어 오류는 같은 행의 첫 칸이 아니라 해당 주소 입력에 포커스한다", async () => {
    const draft = instantiateStkHomeV1({
      randomUUID: (() => {
        let serial = 0;
        return () => `00000000-0000-4000-8000-${String(++serial).padStart(12, "0")}`;
      })(),
    });
    const targetIndex = draft.sections.findIndex((section) => section.type === "exhibition-grid");
    const target = draft.sections[targetIndex];
    const path = `sections[${targetIndex}].content.items[0].symbol.url`;
    pageBody.draft = draft;
    pageBody.hasPublished = true;
    pageBody.exportSections = [{ sid: target.sid, label: expoSectionTitle(target) }];
    nextExportFailure = { issues: [{
      path, code: "standalone-media-public-https", message: "공개 심볼 주소가 필요해요.",
      severity: "error", sid: target.sid,
    }] };

    await render();
    await click(buttonByText(`${expoSectionTitle(target)} HTML 다운로드`));

    expect(document.activeElement?.getAttribute("aria-label")).toBe("1번 하위 전시 심볼 주소");
    expect(document.activeElement?.getAttribute("data-field-path")).toBe("[0].symbol.url");
  });

  it("중첩 Audience 그룹 미디어 오류는 다른 그룹이 아니라 정확한 아이콘 입력에 포커스한다", async () => {
    const target = {
      sid: "88888888-8888-4888-8888-888888888888",
      type: "audience-links", variant: "split", enabled: true, embedEnabled: false,
      design: {}, content: { groups: ["exhibitor", "visitor"].map((audience, groupIndex) => ({
        audience, title: { ko: audience }, variant: groupIndex === 0 ? "light" : "dark",
        items: [{
          id: `${audience}-link`, label: { ko: `${audience} 링크` }, destinationId: "",
          campaignIds: [], order: 0, enabled: true,
          icon: { kind: "image", url: `https://cdn.example.com/${audience}.png`, decorative: true },
        }],
      })) },
    };
    pageBody.draft = { schemaVersion: 2, sections: [target] };
    pageBody.hasPublished = true;
    pageBody.exportSections = [{ sid: target.sid, label: "대상 링크" }];
    nextExportFailure = { issues: [{
      path: "sections[0].content.groups[1].items[0].icon.url",
      code: "standalone-media-public-https", message: "참관객 아이콘 주소가 필요해요.",
      severity: "error", sid: target.sid,
    }] };

    await render();
    await click(buttonByText("대상 링크 HTML 다운로드"));

    const visitorIcon = host.querySelector<HTMLInputElement>(
      'input[data-field-path="groups[1].items[0].icon.url"]',
    );
    expect(visitorIcon).toBeTruthy();
    expect(document.activeElement).toBe(visitorIcon);
  });

  it("페이지 설정 백업 오류는 오류 문구가 아니라 해당 입력에 포커스한다", async () => {
    const target = {
      sid: "44444444-4444-4444-8444-444444444444",
      type: "textblock", variant: "prose", enabled: true, embedEnabled: false,
      design: { bg: "light" }, content: { body: { ko: "본문" } },
    };
    pageBody.draft = {
      schemaVersion: 2,
      settings: { destinations: [{
        id: "inquiry", label: "문의", enabled: true,
        action: { type: "imweb-modal", modalId: "mInquiry", fallbackHref: "http://127.0.0.1/private" },
      }] },
      sections: [target],
    };
    pageBody.hasPublished = true;
    nextExportFailure = { issues: [{
      path: "settings.destinations[0].action.fallbackHref", code: "standalone-modal-fallback-required",
      message: "공개 대체 주소가 필요해요.", severity: "error",
    }] };

    await render();
    await click(buttonByText("전체 HTML 다운로드"));

    expect(document.activeElement?.getAttribute("aria-label")).toBe("문의 대체 주소");
    expect(document.activeElement?.getAttribute("data-field-path")).toBe("settings.destinations[0].action.fallbackHref");
  });

  it("Hero 영상 백업 오류는 marker가 없어도 영상 주소 입력에 포커스한다", async () => {
    const target = {
      sid: "55555555-5555-4555-8555-555555555555",
      type: "campaign-hero", variant: "default", enabled: true, embedEnabled: false,
      design: {}, content: {
        typingLines: [{ ko: "STK 2027" }], accessibleHeadline: { ko: "STK 2027" }, ctas: [],
        video: {
          kind: "video", url: "http://127.0.0.1/private.mp4", originalUrl: "http://127.0.0.1/private.mp4",
          mimeType: "video/mp4", rightsStatus: "confirmed",
        },
      },
    };
    pageBody.draft = { schemaVersion: 2, sections: [target] };
    pageBody.hasPublished = true;
    pageBody.exportSections = [{ sid: target.sid, label: "히어로" }];
    nextExportFailure = { issues: [{
      path: "sections[0].content.video.url", code: "standalone-media-public-https",
      message: "공개 영상 주소가 필요해요.", severity: "error", sid: target.sid,
    }] };

    await render();
    await click(buttonByText("히어로 HTML 다운로드"));

    expect(document.activeElement?.getAttribute("aria-label")).toBe("외부 영상 HTTPS 주소");
    expect(document.activeElement?.getAttribute("data-field-path")).toBe("video.url");
    expect(host.textContent).toContain("공개 영상 주소가 필요해요.");
  });

  it("Hero readiness originalUrl이 먼저 있어도 export url은 안정적인 영상 입력에 포커스한다", async () => {
    const target = {
      sid: "99999999-9999-4999-8999-999999999999",
      type: "campaign-hero", variant: "default", enabled: true, embedEnabled: false,
      design: {}, content: {
        typingLines: [{ ko: "STK 2027" }], accessibleHeadline: { ko: "STK 2027" }, ctas: [],
        video: {
          kind: "video", url: "http://127.0.0.1/private.mp4", originalUrl: "http://127.0.0.1/original.mp4",
          mimeType: "video/mp4", rightsStatus: "confirmed",
        },
      },
    };
    pageBody.draft = { schemaVersion: 2, sections: [target] };
    pageBody.hasPublished = true;
    pageBody.exportSections = [{ sid: target.sid, label: "Hero divergence" }];
    pageBody.readiness = {
      canPublish: false, canGoLive: false,
      publishIssues: [{
        path: "sections[0].content.video.originalUrl", code: "unsafe-original",
        message: "원본 영상 주소를 확인해 주세요.", severity: "error", sid: target.sid,
      }],
      liveIssues: [], notes: [],
    };
    nextExportFailure = { issues: [{
      path: "sections[0].content.video.url", code: "standalone-media-public-https",
      message: "공개 영상 주소가 필요해요.", severity: "error", sid: target.sid,
    }] };

    await render();
    await click(buttonByText("Hero divergence HTML 다운로드"));

    const videoUrl = host.querySelector<HTMLInputElement>('input[data-field-path="video.url"]');
    expect(videoUrl).toBeTruthy();
    expect(document.activeElement).toBe(videoUrl);

    nextExportFailure = { issues: [{
      path: "sections[0].content.video.originalUrl", code: "standalone-media-public-https",
      message: "공개 원본 영상 주소가 필요해요.", severity: "error", sid: target.sid,
    }] };
    const pageTitle = host.querySelector<HTMLInputElement>('input[aria-label="페이지 제목"]');
    await act(async () => { pageTitle?.focus(); });
    await click(buttonByText("Hero divergence HTML 다운로드"));
    expect(document.activeElement).toBe(videoUrl);
  });

  it("초안에 없는 published-only sid 오류가 현재 초안 편집기를 비우지 않는다", async () => {
    const local = {
      sid: "66666666-6666-4666-8666-666666666666",
      type: "textblock", variant: "prose", enabled: true, embedEnabled: false,
      design: { bg: "light" }, content: { heading: { ko: "현재 초안" }, body: { ko: "본문" } },
    };
    const publishedOnlySid = "77777777-7777-4777-8777-777777777777";
    pageBody.draft = { schemaVersion: 2, sections: [local] };
    pageBody.hasPublished = true;
    pageBody.exportSections = [{ sid: publishedOnlySid, label: "발행 전용" }];
    nextExportFailure = { issues: [{
      path: "scope.sid", code: "standalone-section-unavailable", message: "발행본 구획을 찾지 못했어요.",
      severity: "error", sid: publishedOnlySid,
    }] };

    await render();
    await click(host.querySelector('button[aria-label="현재 초안 편집"]') ?? undefined);
    expect(host.querySelector('[aria-label="현재 초안 편집기"]')).toBeTruthy();
    await click(buttonByText("발행 전용 HTML 다운로드"));

    expect(host.querySelector('[aria-label="현재 초안 편집기"]')).toBeTruthy();
    expect(host.textContent).not.toContain("왼쪽에서 구획을 골라 주세요.");
  });
});

describe("페이지 이름", () => {
  /** 스위치의 읽는 이름 — 여기에 페이지 이름이 실린다. */
  const switchName = () =>
    [...host.querySelectorAll('[role="switch"], input[type="checkbox"]')]
      .map((el) => el.getAttribute("aria-label") ?? "")
      .join(" | ");

  async function rename(next: string) {
    const input = [...host.querySelectorAll("input")]
      .find((el) => el.getAttribute("aria-label") === "페이지 제목");
    if (!input) throw new Error("이름 칸이 없다");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(input, next);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // 공유 페이지 초안의 900ms 자동저장 + 목록 다시 읽기.
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
  }

  it("공유 초안에서 고친 이름이 발행 패널에 바로 따라온다", async () => {
    vi.useFakeTimers();
    await render();
    expect(switchName()).toContain("홈");

    await rename("첫 화면");

    expect(switchName()).toContain("첫 화면");
    expect(switchName()).not.toContain("홈 아임웹에");
  });

  /** 제목도 같은 CAS 초안의 일부라 한 번의 자동저장에 함께 나간다. */
  it("이름 바꾸기가 공유 초안 자동저장을 한 번만 돌린다", async () => {
    vi.useFakeTimers();
    await render();
    await rename("첫 화면");
    expect(patchCount).toBe(1);
  });
});

describe("페이지 전환 전 자동저장", () => {
  const titleInput = () => host.querySelector<HTMLInputElement>('input[aria-label="페이지 제목"]')!;
  const pageButton = (title: string) => [...host.querySelectorAll("button")]
    .find((button) => button.textContent?.trim() === title);
  const editTitle = async (title: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(titleInput(), title);
      titleInput().dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    includeSecondPage = true;
  });

  it("느린 저장이 끝난 뒤에만 다른 페이지로 이동한다", async () => {
    let release!: () => void;
    draftSaveGate = new Promise<void>((resolve) => { release = resolve; });
    await render();
    await editTitle("이동 전 저장할 제목");

    await click(pageButton("소개"));
    expect(patchCount).toBe(1);
    expect(replace).not.toHaveBeenCalled();

    release();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(replace).toHaveBeenCalledWith("?page=pg2", { scroll: false });
  });

  it("검증 거절이면 이동하지 않고 보이는 초안을 유지한다", async () => {
    rejectNext = { errors: [{ path: "title", message: "제목을 확인해 주세요." }] };
    await render();
    await editTitle("로컬 검증 초안");

    await click(pageButton("소개"));
    await act(async () => { await Promise.resolve(); });

    expect(replace).not.toHaveBeenCalled();
    expect(titleInput().value).toBe("로컬 검증 초안");
    expect(host.textContent).toContain("제목을 확인해 주세요.");
  });

  it("409 충돌이면 이동하지 않고 보이는 초안을 유지한다", async () => {
    conflictNext = true;
    await render();
    await editTitle("로컬 충돌 초안");

    await click(pageButton("소개"));
    await act(async () => { await Promise.resolve(); });

    expect(replace).not.toHaveBeenCalled();
    expect(titleInput().value).toBe("로컬 충돌 초안");
    expect(host.textContent).toContain("다른 팀원이 먼저 저장했어요");
  });

  it("전송 실패면 이동하지 않고 보이는 초안을 유지한다", async () => {
    transportFailureNext = true;
    await render();
    await editTitle("로컬 전송 초안");

    await click(pageButton("소개"));
    await act(async () => { await Promise.resolve(); });

    expect(replace).not.toHaveBeenCalled();
    expect(titleInput().value).toBe("로컬 전송 초안");
  });

  it("저장 거절이면 페이지 삭제를 예약하지 않는다", async () => {
    rejectNext = { errors: [{ path: "title", message: "제목을 확인해 주세요." }] };
    await render();
    await editTitle("삭제 전 로컬 초안");

    await click(host.querySelector('button[aria-label="소개 페이지 삭제"]') ?? undefined);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_100); });

    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    expect(titleInput().value).toBe("삭제 전 로컬 초안");
  });
});
