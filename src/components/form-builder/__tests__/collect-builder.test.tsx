// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CollectFormView } from "../CollectFormView";
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
    render(<CollectFormView config={CONFIG} />);
    expect(container.textContent).toContain("Email");
    expect(container.textContent).not.toContain("Hidden");
  });

  /** 분기가 실제로 펼쳐지는지 — 값을 안 고르면 안 보여야 한다. */
  it("유형을 고르면 분기 문항이 나타난다", () => {
    render(<CollectFormView config={CONFIG} />);
    expect(container.textContent).not.toContain("Company");

    const select = container.querySelector("select")!;
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")!.set!.call(select, "Buyer");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.textContent).toContain("Company");
  });

  it("접수 창 밖이면 폼 대신 상태 문구를 보여준다 — 마감 화면을 미리 볼 수 있어야 한다", () => {
    render(<CollectFormView config={CONFIG} forceStatus="closed" />);
    expect(container.textContent).toContain("마감");
    expect(container.querySelector("select")).toBeNull();

    render(<CollectFormView config={CONFIG} forceStatus="before" />);
    expect(container.textContent).toContain("아직 시작되지 않았어요");
  });

  /** AGENTS.md 공통: 사용자 텍스트는 줄바꿈을 보존해 표시한다. */
  it("안내 본문은 줄바꿈을 보존한다", () => {
    render(<CollectFormView config={CONFIG} />);
    const el = [...container.querySelectorAll("p")].find((p) => p.textContent?.includes("첫 줄"));
    expect(el?.className).toContain("whitespace-pre-wrap");
  });

  it("항목이 없으면 빈 상태를 알린다 — 빈 화면은 고장으로 보인다", () => {
    render(<CollectFormView config={normalizeCollectForm({})} />);
    expect(container.textContent).toContain("항목을 추가하면");
  });
});

// ── 제출 (미리보기 모드) ──────────────────────────────────────────────
/**
 * onSubmit 이 없으면 미리보기다 — **아무것도 보내지 않고** 검증 결과만 보여준다.
 * 여기서 붙잡는 것은 "미리보기가 진짜 검증을 도는가" 와 "부작용이 없는가" 둘 다다.
 */
describe("미리보기 제출", () => {
  const submit = () => {
    const btn = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("사전 등록하기"))!;
    act(() => { btn.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  };
  const type = (el: HTMLInputElement | HTMLSelectElement, value: string) => {
    const proto = el instanceof HTMLSelectElement ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    act(() => {
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
      el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
    });
  };

  it("빈 폼을 제출하면 항목 아래 인라인으로 알린다(AGENTS.md 공통)", () => {
    render(<CollectFormView config={CONFIG} />);
    submit();
    expect(container.textContent).toContain("필수 항목이에요");
    expect(container.textContent).toContain("동의가 필요해요");
  });

  /**
   * 분기 유형을 바꾸면 이전 그룹 값이 남는다(공통 입력은 유지해야 하므로 통째로 비울 수 없다).
   * 그 값을 검증에 넘기면 **화면에 없는 항목의 오류**가 떠서 등록이 영영 안 된다 —
   * 렌더러가 "지금 보이는 것만" 추려 보내야 한다.
   */
  it("분기를 되돌리면 이전 그룹에 적어 둔 값이 제출을 막지 않는다", () => {
    render(<CollectFormView config={CONFIG} />);
    type(container.querySelector<HTMLInputElement>('input[type="email"]')!, "a@b.com");

    const select = container.querySelector("select")!;
    type(select, "Buyer");
    type(container.querySelector<HTMLInputElement>('input[type="text"]')!, "Acme");
    type(select, "General"); // 다시 일반으로 — Company 는 사라지고 "Acme" 만 남는다

    act(() => { container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); });
    submit();

    expect(container.textContent).not.toContain("폼에 없는 값이에요");
    expect(container.textContent).toContain("검증을 통과했어요");
  });

  it("onSubmit 이 있으면 통과한 값만 넘긴다 — 실제 제출 경로가 붙을 자리", () => {
    const seen: Array<Record<string, unknown>> = [];
    render(<CollectFormView config={CONFIG} onSubmit={({ values }) => seen.push(values)} />);
    submit();
    expect(seen).toHaveLength(0); // 검증 실패 — 넘기지 않는다

    type(container.querySelector<HTMLInputElement>('input[type="email"]')!, "a@b.com");
    act(() => { container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); });
    submit();
    expect(seen).toEqual([{ email: "a@b.com" }]);
  });
});
