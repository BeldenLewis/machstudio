// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DeployTab from "../DeployTab";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import type { CompetitionDetail } from "../page";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let container: HTMLDivElement;
let root: Root;

const competition = {
  id: "competition-1",
  name: "공모전",
  slug: "contest",
  description: null,
  phaseOverride: null,
  recruitOpenAt: null,
  recruitCloseAt: null,
  theme: {},
  config: { noticePage: { enabled: true } },
  maxEntriesPerApplicant: 1,
  previewToken: "preview-token",
  showToken: null,
  showConfig: null,
  resultPublishedAt: null,
} as CompetitionDetail;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_CANONICAL_APP_URL", "https://app.example.com/");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn() } });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function render() {
  act(() => {
    root.render(
      <ConfirmProvider>
        <DeployTab competition={competition} patch={vi.fn(async () => true)} />
      </ConfirmProvider>,
    );
  });
}

describe("대회 배포 코드", () => {
  it("공고·예선·본선·결과 설치 코드는 설정된 공개 주소를 쓴다", () => {
    render();
    const snippets = [...container.querySelectorAll("pre")]
      .map((snippet) => snippet.textContent ?? "")
      .filter((snippet) => snippet.includes("<script"));
    expect(snippets).toEqual([
      '<script async src="https://app.example.com/c/competition-1"></script>\n<div data-mach-competition></div>',
      '<script async src="https://app.example.com/c/competition-1/vote"></script>\n<div data-mach-competition-vote></div>',
      '<script async src="https://app.example.com/c/competition-1/vote?round=final"></script>\n<div data-mach-competition-vote></div>',
      '<script async src="https://app.example.com/c/competition-1/result"></script>\n<div data-mach-competition-result></div>',
    ]);
  });

  it("미리보기 링크와 복사 값은 설정된 공개 주소를 쓴다", async () => {
    render();
    const links = [...container.querySelectorAll("a")].map((link) => link.getAttribute("href"));
    expect(links).toContain("https://app.example.com/cp/preview-token");

    const previewSection = [...container.querySelectorAll("section")].find((section) =>
      section.querySelector("h2")?.textContent === "미리보기 링크",
    );
    expect(previewSection).toBeTruthy();
    const copy = [...(previewSection?.querySelectorAll("button") ?? [])].find((button) => button.textContent?.trim() === "복사");
    expect(copy).toBeTruthy();
    await act(async () => {
      copy?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://app.example.com/cp/preview-token");
  });

  it("공개 주소 설정이 없으면 localhost·상대 설치 코드와 링크 복사를 막는다", () => {
    vi.stubEnv("NEXT_PUBLIC_CANONICAL_APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    render();

    expect(container.textContent).toContain("공개 배포 주소가 설정되지 않아 설치 코드와 미리보기 링크를 복사할 수 없어요");
    expect([...container.querySelectorAll("pre")].map((pre) => pre.textContent).join("\n")).not.toContain("<script");
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });
});
