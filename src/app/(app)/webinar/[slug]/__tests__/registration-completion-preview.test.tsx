// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { RegistrationFormPreview } from "../RegistrationFormTab";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const props = {
  fields: [],
  privacyText: "[필수] 개인정보 수집 및 이용에 동의합니다",
  marketingText: "[선택] 마케팅 정보 수신에 동의합니다",
  privacyBody: "",
  marketingBody: "",
  privacyDefaultChecked: false,
  marketingDefaultChecked: false,
  submitLabel: "사전 등록하기",
  theme: { accent: "#6D28D9", text: "#141320", surface: "#FFFFFF" },
  slug: "preview-test",
};

let host: HTMLDivElement | null = null;
let root: Root | null = null;

function renderPreview(successCta: { enabled: boolean; label: string; url: string }) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(<RegistrationFormPreview {...props} successCta={successCta} />);
  });
  return host;
}

function button(host: HTMLElement, label: string) {
  const target = Array.from(host.querySelectorAll("button")).find((item) => item.textContent === label);
  expect(target, `button “${label}”`).toBeTruthy();
  return target!;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("등록 완료 미리보기", () => {
  it("유효하고 완전한 CTA만 완료 화면에 보이고 닫기로 폼 미리보기로 돌아온다", () => {
    const view = renderPreview({ enabled: true, label: "오픈채팅 입장", url: "https://example.com/chat" });

    act(() => button(view, "완료").click());

    expect(view.textContent).toContain("사전등록이 완료됐어요");
    expect(button(view, "오픈채팅 입장").type).toBe("button");

    act(() => button(view, "닫기").click());

    expect(view.querySelector(".rp-title")?.textContent).toBe("사전 등록");
    expect(view.textContent).not.toContain("사전등록이 완료됐어요");
  });

  it("비어 있거나 안전하지 않은 CTA는 완료 화면에서 숨긴다", () => {
    const view = renderPreview({ enabled: true, label: "오픈채팅 입장", url: "javascript:alert(1)" });

    act(() => button(view, "완료").click());

    expect(view.textContent).not.toContain("오픈채팅 입장");
    expect(view.textContent).toContain("닫기");
  });

  it("문구가 비어 있으면 안전한 URL이 있어도 CTA를 숨긴다", () => {
    const view = renderPreview({ enabled: true, label: "", url: "https://example.com/chat" });

    act(() => button(view, "완료").click());

    expect(view.querySelector(".rp-submit")).toBeNull();
  });
});
