// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FormBuilderTab from "../FormBuilderTab";
import { AutosaveScope } from "@/components/ui/autosave-scope";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

/**
 * 빌더에서 만든 폼을 **홈페이지에 붙일 방법**이 화면에 있는가.
 *
 * 붙일 코드가 없으면 폼은 만들어져 있는데 세상에 나가지 못한다 — 기능이 빠진 게 아니라
 * 찾을 수 없어서 없는 것과 같아지는 종류의 결함이고, 어드민이 로그인 벽 뒤라 이 렌더
 * 테스트가 그걸 잡는 유일한 자동 경로다.
 */

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com/");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  // 자동저장이 PATCH 를 쏜다 — 테스트에서 실제 네트워크로 나가지 않게 막는다.
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn() } });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const CONFIG = {
  fields: [{ id: "f1", key: "email", label: { en: "Email" }, type: "email", required: true, enabled: true, options: [] }],
  lookup: { enabled: true, fields: ["email"], logic: "or", showQr: true },
};

function render(config: unknown, token: string | null = "tok123") {
  act(() => {
    root.render(
      <ConfirmProvider>
        <AutosaveScope>
          <FormBuilderTab sourceId="src_1" initialConfig={config} previewToken={token} />
        </AutosaveScope>
      </ConfirmProvider>,
    );
  });
}

const snippets = () => [...container.querySelectorAll("aside pre")].map((p) => p.textContent ?? "");

describe("붙일 코드", () => {
  it("등록 폼 스니펫에 스크립트와 마운트 자리가 둘 다 있다", () => {
    render(CONFIG);
    const form = snippets().find((s) => s.includes("/f/src_1\""));
    // 스크립트만 주면 붙인 사람은 폼이 어디에 그려질지 정할 수 없다.
    expect(form).toContain("<script async src=");
    expect(form).toContain("<div data-mach-form></div>");
  });

  /** 마운트 속성이 런타임(form-entry.ts findMount)과 어긋나면 붙여도 아무것도 안 나온다. */
  it("등록 확인 스니펫은 /check 경로와 전용 마운트 속성을 쓴다", () => {
    render(CONFIG);
    const check = snippets().find((s) => s.includes("/f/src_1/check"));
    expect(check).toContain("<div data-mach-form-check></div>");
  });

  it("폼과 등록 확인 스니펫은 설정된 공개 주소를 쓴다", () => {
    render(CONFIG);
    for (const snippet of snippets()) {
      expect(snippet).toContain('src="https://app.example.com/f/src_1');
    }
  });

  /** 꺼진 기능의 코드를 주면 붙여 놓고 "안 나온다" 고 묻는다. */
  it("등록 확인을 끄면 그 코드는 사라지고 켜는 곳을 알려준다", () => {
    render({ ...CONFIG, lookup: { ...CONFIG.lookup, enabled: false } });
    expect(snippets().some((s) => s.includes("/check"))).toBe(false);
    expect(container.textContent).toContain("등록 확인은 꺼져 있어요");
  });
});

describe("미리보기 링크", () => {
  it("등록 폼과 등록 확인을 각각 열 수 있다", () => {
    render(CONFIG);
    const hrefs = [...container.querySelectorAll("aside a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/p/tok123");
    expect(hrefs).toContain("/p/tok123/check");
  });

  it("링크 복사는 설정된 공개 주소를 쓴다", () => {
    render(CONFIG);
    const copy = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("링크 복사"));
    expect(copy).toBeTruthy();
    act(() => copy?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://app.example.com/p/tok123");
  });

  /** 아이콘만 있는 링크는 이름이 없으면 스크린리더에서 "링크" 로만 읽힌다. */
  it("아이콘만 있는 링크에도 이름이 있다", () => {
    render(CONFIG);
    for (const a of container.querySelectorAll("aside a")) {
      const name = (a.textContent ?? "").trim() || a.getAttribute("aria-label") || "";
      expect(name).not.toBe("");
    }
  });

  /** 예전 소스는 previewToken 이 null 이다 — 그때 /p/null/check 같은 링크가 나가면 안 된다. */
  it("토큰이 없으면 링크를 만들지 않는다", () => {
    render(CONFIG, null);
    const hrefs = [...container.querySelectorAll("aside a")].map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.startsWith("/p/"))).toBe(false);
  });
});
