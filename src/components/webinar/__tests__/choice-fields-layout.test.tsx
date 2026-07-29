// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MultiChoiceField } from "../choice-fields";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let host: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("native multiple-choice row layout", () => {
  it("keeps a 44px target while aligning the checkbox to the first line of a wrapped option", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root?.render(
        <MultiChoiceField
          field={{
            key: "long-option",
            label: "관심 분야",
            type: "multiple",
            options: ["여러 줄로 감싸지는 아주 긴 복수 선택 문구입니다"],
          }}
          value=""
          onChange={vi.fn()}
          accent="#6D28D9"
          inputStyle={{}}
        />,
      );
    });

    const row = host.querySelector<HTMLLabelElement>("label")!;
    const checkbox = row.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    const label = row.querySelector("span")!;

    expect(label.textContent).toContain("여러 줄로 감싸지는");
    expect(row.className).toContain("min-h-11");
    expect(row.className).toContain("items-start");
    expect(row.className).toContain("py-3");
    expect(row.className).toContain("leading-5");
    expect(checkbox.className).toContain("mt-px");
  });
});
