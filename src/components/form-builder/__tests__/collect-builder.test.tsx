// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CollectFormPreview } from "../CollectFormPreview";
import { normalizeCollectForm } from "@/lib/collect-form-config";

/**
 * 빌더 옆칸 미리보기 — 어드민은 로그인 벽 뒤라 이게 유일한 확인 경로다.
 *
 * 여기서 붙잡는 것: **미리보기가 임베드와 같은 모델·가시성 규칙을 읽는가.**
 * 각자 그리기 시작하면 "미리보기에선 괜찮았는데" 가 반드시 생긴다.
 */

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const CONFIG = normalizeCollectForm({
  fields: [
    { id: "f1", key: "email", label: { en: "Email" }, type: "email", required: true, enabled: true },
    { id: "f2", key: "type", label: { en: "Visitor type" }, type: "select", enabled: true, options: [{ en: "General" }, { en: "Buyer" }] },
    { id: "f3", key: "hidden_one", label: { en: "Hidden" }, type: "text", enabled: false },
  ],
  branch: { enabled: true, fieldKey: "type", groups: [{ value: "Buyer", fields: [{ id: "b1", key: "company", label: { en: "Company" }, type: "text", required: true, enabled: true }] }] },
  notices: [{ id: "portrait", enabled: true, placement: "above-consent", mode: "notice", body: { en: "첫 줄\n둘째 줄" } }],
  consent: { privacy: { enabled: true, label: { en: "Privacy" } } },
});

function render(node: React.ReactElement) {
  act(() => { root.render(node); });
}

describe("빌더 미리보기", () => {
  it("표시 꺼진 항목은 그리지 않는다", () => {
    render(<CollectFormPreview config={CONFIG} />);
    expect(container.textContent).toContain("Email");
    expect(container.textContent).not.toContain("Hidden");
  });

  /** 분기가 실제로 펼쳐지는지 — 값을 안 고르면 안 보여야 한다. */
  it("유형을 고르면 분기 문항이 나타난다", () => {
    render(<CollectFormPreview config={CONFIG} />);
    expect(container.textContent).not.toContain("Company");

    const select = container.querySelector("select")!;
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")!.set!.call(select, "Buyer");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.textContent).toContain("Company");
  });

  it("접수 창 밖이면 폼 대신 상태 문구를 보여준다 — 마감 화면을 미리 볼 수 있어야 한다", () => {
    render(<CollectFormPreview config={CONFIG} forceStatus="closed" />);
    expect(container.textContent).toContain("마감");
    expect(container.querySelector("select")).toBeNull();

    render(<CollectFormPreview config={CONFIG} forceStatus="before" />);
    expect(container.textContent).toContain("아직 시작되지 않았어요");
  });

  /** AGENTS.md 공통: 사용자 텍스트는 줄바꿈을 보존해 표시한다. */
  it("안내 본문은 줄바꿈을 보존한다", () => {
    render(<CollectFormPreview config={CONFIG} />);
    const el = [...container.querySelectorAll("p")].find((p) => p.textContent?.includes("첫 줄"));
    expect(el?.className).toContain("whitespace-pre-wrap");
  });

  it("항목이 없으면 빈 상태를 알린다 — 빈 화면은 고장으로 보인다", () => {
    render(<CollectFormPreview config={normalizeCollectForm({})} />);
    expect(container.textContent).toContain("항목을 추가하면");
  });
});
