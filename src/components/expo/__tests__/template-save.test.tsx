// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 템플릿 저장 · 템플릿에서 시작 — **끊어 둔 것을 말해 주는가.**
 *
 * 템플릿은 이전 전시의 흔적을 한 톨도 가져가지 않는다: 사전등록 소스도, 내부 링크도,
 * 아임웹 주소도 **일부러 비운다**(`template.ts` 머리말). 그게 맞는 동작이다. 그런데
 * 비웠다는 사실을 말해 주지 않으면 운영자는 **다 된 줄 알고 발행한다** — 사전등록 폼이
 * 소스 없이 통째로 안 그려지고, 버튼은 아무 데도 안 가고, 아무도 이유를 모른다.
 *
 * 서버는 그 목록(`reconnectChecklist`)을 이미 돌려주고 있었다. 화면이 버리고 있었을 뿐이다.
 */

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

let workspaceValue = {
  workspace: { id: "w1" }, currentProject: { id: "p1" }, isLoading: false,
};
vi.mock("@/contexts/workspace", () => ({ useWorkspace: () => workspaceValue }));

const { ExpoTemplateSave } = await import("@/components/expo/ExpoTemplateSave");
const { ExpoCreateChoices } = await import("@/components/expo/ExpoCreateChoices");

let host: HTMLDivElement;
let root: Root;
let posts: Array<{ url: string; body: Record<string, unknown> }> = [];
let templateResponse: { ok: boolean; body: unknown } = { ok: true, body: {} };
let instantiateResponse: { ok: boolean; body: unknown } = { ok: true, body: {} };

function stubFetch() {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const json = init?.body ? JSON.parse(init.body) : {};
    if (init?.method === "POST") posts.push({ url, body: json });
    const pick = url.includes("/instantiate") ? instantiateResponse : templateResponse;
    if (url === "/api/expo/templates" && init?.method !== "POST") {
      return { ok: true, json: async () => ({ templates: [
        { id: "stk-home-v1", name: "STK 2027 홈페이지", description: "승인된 STK 관리 구획", contentMode: "full", pageCount: 1, builtIn: true },
        { id: "t1", name: "지난 전시", description: null, contentMode: "design", pageCount: 3, builtIn: false },
      ] }) } as Response;
    }
    return { ok: pick.ok, status: pick.ok ? 201 : 422, json: async () => pick.body } as Response;
  }));
}

const button = (text: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);

async function click(el: Element | undefined) {
  if (!el) throw new Error("없는 버튼");
  await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}

async function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(proto.prototype, "value")!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function render(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    root = createRoot(host);
    root.render(node);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  posts = [];
  templateResponse = { ok: true, body: { template: { id: "t1", name: "빛의 시간" }, checklist: [] } };
  instantiateResponse = { ok: true, body: { site: { id: "s2" }, checklist: [] } };
  workspaceValue = { workspace: { id: "w1" }, currentProject: { id: "p1" }, isLoading: false };
  stubFetch();
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  host?.remove();
  vi.unstubAllGlobals();
});

describe("템플릿으로 저장", () => {
  it("펼치기 전에는 폼을 그리지 않는다", async () => {
    await render(<ExpoTemplateSave siteId="s1" siteName="빛의 시간" />);
    expect(host.querySelector("textarea")).toBeNull();
    expect(button("저장")).toBeTruthy();
  });

  /** 이름은 사이트 이름으로 채워 둔다 — 대부분 그대로 쓴다. */
  it("펼치면 사이트 이름이 채워져 있다", async () => {
    await render(<ExpoTemplateSave siteId="s1" siteName="빛의 시간" />);
    await click(button("저장"));
    expect(host.querySelector<HTMLInputElement>("input")?.value).toBe("빛의 시간");
  });

  /** 기본은 **구조만**이다 — 문구까지 가져가는 건 명시적으로 고른 경우만. */
  it("기본 범위는 구조만이다", async () => {
    await render(<ExpoTemplateSave siteId="s1" siteName="빛의 시간" />);
    await click(button("저장"));
    await click(button("템플릿으로 저장"));

    expect(posts[0].url).toBe("/api/expo/templates");
    expect(posts[0].body).toMatchObject({ siteId: "s1", contentMode: "design" });
  });

  it("문구까지를 고르면 그렇게 보낸다", async () => {
    await render(<ExpoTemplateSave siteId="s1" siteName="빛의 시간" />);
    await click(button("저장"));
    await click(button("문구까지"));
    await click(button("템플릿으로 저장"));
    expect(posts[0].body).toMatchObject({ contentMode: "full" });
  });

  it("이름이 비면 보내지 않는다", async () => {
    await render(<ExpoTemplateSave siteId="s1" siteName="빛의 시간" />);
    await click(button("저장"));
    await type(host.querySelector<HTMLInputElement>("input")!, "   ");
    await click(button("템플릿으로 저장"));

    expect(posts).toHaveLength(0);
    expect(toastError).toHaveBeenCalledWith("템플릿 이름을 입력해 주세요");
  });

  /**
   * 저장 시점에도 끊어 둔 것을 말한다 — 다음 전시가 그걸 이어야 하고,
   * 그 사실을 아는 사람은 지금 이 사이트를 만든 사람이다.
   */
  it("서버가 준 이어서 할 일을 그대로 보여 준다", async () => {
    templateResponse = {
      ok: true,
      body: {
        template: { id: "t1", name: "빛의 시간" },
        checklist: [{ code: "source-ref", message: "사전등록 폼 2개에 이 전시의 사전등록 소스를 다시 골라 주세요" }],
      },
    };
    await render(<ExpoTemplateSave siteId="s1" siteName="빛의 시간" />);
    await click(button("저장"));
    await click(button("템플릿으로 저장"));

    expect(host.textContent).toContain("사전등록 폼 2개에");
  });

  /** "저장하지 못했어요" 보다 무엇을 고칠지 말해 준다. */
  it("필드 오류가 오면 그걸 먼저 보여 준다", async () => {
    templateResponse = { ok: false, body: { error: "확인해 주세요", errors: [{ message: "이름은 120자까지예요" }] } };
    await render(<ExpoTemplateSave siteId="s1" siteName="빛의 시간" />);
    await click(button("저장"));
    await click(button("템플릿으로 저장"));

    expect(toastError).toHaveBeenCalledWith("이름은 120자까지예요");
  });
});

describe("템플릿에서 시작", () => {
  const startWithTemplate = async () => {
    await render(<ExpoCreateChoices />);
    await type(host.querySelector<HTMLInputElement>("input")!, "2026 에듀테크");
    await click(button("지난 전시구조만(문구·이미지는 새로 씁니다) · 페이지 3개"));
  };

  /** 할 일이 없으면 한 번 더 누르게 하지 않는다. */
  it("이어서 할 일이 없으면 곧바로 편집기로 보낸다", async () => {
    await startWithTemplate();
    expect(replace).toHaveBeenCalledWith("/homepage/s2");
  });

  /**
   * **이 파일에서 가장 중요한 성질.** 곧바로 보내면 목록을 아무도 못 읽는다 —
   * 그러면 소스 없는 사전등록 폼을 그대로 발행하게 된다.
   */
  it("이어서 할 일이 있으면 먼저 보여 주고 기다린다", async () => {
    instantiateResponse = {
      ok: true,
      body: {
        site: { id: "s2" },
        checklist: [
          { code: "source-ref", message: "사전등록 폼 1개에 이 전시의 사전등록 소스를 다시 골라 주세요" },
          { code: "imweb-url", message: "각 페이지에 이 전시의 아임웹 주소를 연결해 주세요" },
        ],
      },
    };
    await startWithTemplate();

    expect(replace).not.toHaveBeenCalled();
    expect(host.textContent).toContain("사전등록 소스를 다시 골라 주세요");
    expect(host.textContent).toContain("아임웹 주소를 연결해 주세요");

    await click(button("홈페이지 열기"));
    expect(replace).toHaveBeenCalledWith("/homepage/s2");
  });

  /** 빈 사이트는 끊어 둔 것이 없다 — 이 화면을 거치게 하면 방해만 된다. */
  it("빈 사이트는 곧바로 보낸다", async () => {
    await render(<ExpoCreateChoices />);
    await type(host.querySelector<HTMLInputElement>("input")!, "2026 에듀테크");
    templateResponse = { ok: true, body: { site: { id: "s3" } } };
    await click([...host.querySelectorAll("button")].find((b) => /빈 사이트/.test(b.textContent ?? "")));
    expect(replace).toHaveBeenCalledWith("/homepage/s3");
  });

  it("기본 제공 STK 프리셋은 관리 불가 항목임을 구분하고 같은 인증 API로 만든다", async () => {
    await render(<ExpoCreateChoices />);
    await type(host.querySelector<HTMLInputElement>("input")!, "STK 2027");
    const choice = [...host.querySelectorAll("button")].find((candidate) => /STK 2027 홈페이지/.test(candidate.textContent ?? ""));
    expect(choice?.textContent).toContain("기본 제공");
    await click(choice);
    expect(posts[0]).toMatchObject({
      url: "/api/expo/templates/stk-home-v1/instantiate",
      body: { projectId: "p1", name: "STK 2027" },
    });
  });
});
