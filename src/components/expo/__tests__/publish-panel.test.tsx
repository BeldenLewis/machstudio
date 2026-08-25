// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 발행 패널 — **밖으로 나가는 자리다.**
 *
 * 이 화면의 버튼 하나가 파트너 사이트에 붙어 있는 코드 자리를 채우거나 비운다. 그래서
 * 여기서 붙잡는 것은 배치가 아니라 **누르면 정말 그 일이 일어나는가**, 그리고
 * **일어나면 안 될 때 안 일어나는가** 다:
 *
 *  · 못 나가는 이유가 있으면 발행 버튼이 잠기고 그 이유가 보이는가
 *  · 공개를 **켤 때만** 확인을 받는가 — 끄는 것은 되돌리기라 막으면 안 된다
 *  · 이미 공개 중인 페이지를 다시 발행할 때 확인을 받는가(방문자 화면이 즉시 바뀐다)
 *  · 서버가 거절하면 그 사유를 그대로 보여 주는가 — 서버가 화면보다 최신이다
 */

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({ toast: { error: toastError, success: toastSuccess } }));

const { ExpoPublishPanel } = await import("@/components/expo/ExpoPublishPanel");
const { ConfirmProvider } = await import("@/components/ui/confirm-dialog");

const PAGE_ID = "pg1";

let host: HTMLDivElement;
let root: Root;
let posts: Array<{ url: string; body: unknown }> = [];
let nextResponse: { ok: boolean; status: number; body: unknown } = { ok: true, status: 200, body: {} };
const onChanged = vi.fn();

const READY = { canPublish: true, canGoLive: true, publishIssues: [], liveIssues: [], notes: [] };
const SNIPPETS = {
  ok: true as const,
  page: { code: '<script async src="https://x/h/pg1"></script>\n<div data-mach-expo></div>', src: "https://x/h/pg1" },
  sections: [],
};

function stubFetch() {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { body?: string }) => {
    posts.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
    return {
      ok: nextResponse.ok,
      status: nextResponse.status,
      json: async () => nextResponse.body,
    } as Response;
  }));
}

async function render(over: Partial<Parameters<typeof ExpoPublishPanel>[0]> = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    root = createRoot(host);
    root.render(
      <ConfirmProvider>
        <ExpoPublishPanel
          pageId={PAGE_ID}
          pageTitle="홈"
          hasPublished={false}
          liveAt={null}
          readiness={READY}
          snippets={SNIPPETS}
          canPublish
          onChanged={onChanged}
          {...over}
        />
      </ConfirmProvider>,
    );
  });
}

/** 확인 모달은 body 로 포탈된다 — host 가 아니라 document 에서 찾는다. */
const anyButton = (text: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
const panelButton = (text: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);

async function click(el: Element | undefined) {
  if (!el) throw new Error("없는 버튼");
  await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}

beforeEach(() => {
  vi.clearAllMocks();
  posts = [];
  nextResponse = { ok: true, status: 200, body: {} };
  stubFetch();
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  host?.remove();
  vi.unstubAllGlobals();
});

describe("발행", () => {
  it("아직 발행 전이면 초안이라고 말한다", async () => {
    await render();
    expect(host.textContent).toContain("초안");
    expect(panelButton("발행하기")).toBeTruthy();
  });

  it("공개 중이 아니면 확인 없이 바로 발행한다", async () => {
    await render();
    await click(panelButton("발행하기"));

    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe("/api/expo/pages/pg1/publish");
    expect(onChanged).toHaveBeenCalled();
  });

  /** 이미 공개 중이면 발행하는 순간 방문자 화면이 바뀐다 — 그건 확인받을 일이다. */
  it("공개 중이면 확인을 먼저 받는다", async () => {
    await render({ hasPublished: true, liveAt: "2026-08-01T00:00:00.000Z" });
    await click(panelButton("다시 발행"));

    // 아직 아무것도 안 보냈다.
    expect(posts).toHaveLength(0);
    expect(document.body.textContent).toContain("지금 공개 중인 페이지예요");
    // 조사를 계산한다 — "홈를" 이 아니라 "홈을".
    expect(document.body.textContent).toContain("홈을 지금 발행할까요?");

    await click(anyButton("발행하기"));
    expect(posts.map((p) => p.url)).toEqual(["/api/expo/pages/pg1/publish"]);
  });

  it("확인에서 취소하면 아무것도 보내지 않는다", async () => {
    await render({ hasPublished: true, liveAt: "2026-08-01T00:00:00.000Z" });
    await click(panelButton("다시 발행"));
    await click(anyButton("취소"));
    expect(posts).toHaveLength(0);
  });

  /** 못 나가는 이유가 있으면 버튼이 잠기고, 왜인지 그 자리에서 말한다. */
  it("발행할 수 없으면 이유를 보여 주고 버튼을 잠근다", async () => {
    await render({
      readiness: {
        ...READY,
        canPublish: false,
        publishIssues: [{ code: "no-sections", message: "아직 섹션이 없어요." }],
      },
    });
    expect(panelButton("발행하기")?.disabled).toBe(true);
    expect(host.textContent).toContain("아직 섹션이 없어요");
  });

  /** 서버가 화면보다 최신이다 — 거절 사유를 그대로 옮긴다. */
  it("서버가 거절하면 그 사유를 보여 준다", async () => {
    nextResponse = {
      ok: false, status: 422,
      body: { error: "아직 발행할 수 없어요", issues: [{ code: "no-renderable-section", message: "내보낼 섹션이 없어요." }] },
    };
    await render();
    await click(panelButton("발행하기"));

    expect(toastError).toHaveBeenCalledWith("내보낼 섹션이 없어요.");
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe("공개 스위치", () => {
  const switchEl = () => host.querySelector<HTMLButtonElement>('button[role="switch"]');

  it("켤 때는 확인을 받는다", async () => {
    await render({ hasPublished: true });
    await click(switchEl()!);

    expect(posts).toHaveLength(0);
    expect(document.body.textContent).toContain("아임웹에 실제로 내보낼까요");

    await click(anyButton("공개하기"));
    expect(posts[0]).toMatchObject({ url: "/api/expo/pages/pg1/live", body: { live: true } });
  });

  /** 되돌리기를 막으면 안 된다 — 끄는 것은 확인 없이 즉시. */
  it("끌 때는 확인 없이 바로 끈다", async () => {
    await render({ hasPublished: true, liveAt: "2026-08-01T00:00:00.000Z" });
    await click(switchEl()!);

    expect(posts[0]).toMatchObject({ url: "/api/expo/pages/pg1/live", body: { live: false } });
  });

  it("아직 켤 수 없으면 스위치를 잠그고 이유를 말한다", async () => {
    await render({
      readiness: {
        ...READY,
        canGoLive: false,
        liveIssues: [{ code: "not-published", message: "아직 발행하지 않았어요." }],
      },
    });
    expect(switchEl()?.disabled).toBe(true);
    expect(host.textContent).toContain("아직 발행하지 않았어요");
  });

  /** 이미 켜져 있으면 끄는 건 언제나 된다 — 켤 수 없는 사유를 그때 보여 주면 헷갈린다. */
  it("공개 중일 때는 켤 수 없는 사유를 보여주지 않는다", async () => {
    await render({
      hasPublished: true,
      liveAt: "2026-08-01T00:00:00.000Z",
      readiness: {
        ...READY, canGoLive: false,
        liveIssues: [{ code: "not-published", message: "아직 발행하지 않았어요." }],
      },
    });
    expect(switchEl()?.disabled).toBe(false);
    expect(host.textContent).not.toContain("아직 발행하지 않았어요");
  });
});

describe("붙일 코드", () => {
  it("복사하면 코드가 클립보드로 간다", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await render();

    await click(host.querySelector('button[aria-label="페이지 통짜 코드 복사"]') ?? undefined);
    expect(writeText).toHaveBeenCalledWith(SNIPPETS.page.code);
    expect(host.textContent).toContain("복사됨");
  });

  /**
   * 주소를 못 만들면 **코드를 주지 않는다.** 빈 문자열이나 상대경로를 주면 붙인 사람은
   * 붙였다고 믿고 전시 기간에 조용히 빈 자리가 된다(`origin.ts`).
   */
  it("주소를 못 만들면 이유만 말하고 코드를 안 준다", async () => {
    await render({ snippets: { ok: false, message: "공개 주소가 설정되지 않아 코드를 만들 수 없어요" } });
    expect(host.textContent).toContain("공개 주소가 설정되지 않아");
    expect(host.querySelector("pre")).toBeNull();
  });

  /** 발행본에 없는 구획의 코드는 붙여도 아무것도 안 나온다 — 복사부터 막는다. */
  it("아직 못 붙이는 구획은 복사를 막고 이유를 말한다", async () => {
    await render({
      snippets: {
        ok: true,
        page: SNIPPETS.page,
        sections: [{
          sid: "s1", label: "키비주얼",
          snippet: { code: "<script></script>", src: "https://x/h/pg1/s1" },
          issues: [{ code: "section-not-published", message: "이 섹션은 발행본에 없어요." }],
        }],
      },
    });
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="키비주얼 코드 복사"]')?.disabled).toBe(true);
    expect(host.textContent).toContain("이 섹션은 발행본에 없어요");
  });

  it("따로 내보내기를 켠 구획이 없으면 어떻게 켜는지 알려 준다", async () => {
    await render();
    expect(host.textContent).toContain("이 구획만 따로 내보내기");
  });
});

describe("권한", () => {
  /** 눌러도 실패할 버튼은 보여주지 않는다 — 서버도 MEMBER 의 발행을 막는다. */
  it("발행 권한이 없으면 발행·공개 컨트롤을 그리지 않는다", async () => {
    await render({ canPublish: false });
    expect(panelButton("발행하기")).toBeUndefined();
    expect(host.querySelector('button[role="switch"]')).toBeNull();
    // 코드는 그대로 볼 수 있다 — 붙이는 일에 발행 권한이 필요하지는 않다.
    expect(host.querySelector('button[aria-label="페이지 통짜 코드 복사"]')).toBeTruthy();
  });
});
