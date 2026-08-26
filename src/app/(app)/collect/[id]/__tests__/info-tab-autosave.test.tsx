// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InfoTab, { type VenueInfo } from "../InfoTab";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function render(onSaved: (value: VenueInfo) => void) {
  act(() => {
    root.render(<InfoTab sourceId="source_1" initial={{}} onSaved={onSaved} />);
  });
}

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("InfoTab autosave", () => {
  it("PATCH 성공 값을 상위 source 상태에도 반영한다", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const onSaved = vi.fn();
    render(onSaved);

    const venueInput = container.querySelectorAll("input")[2] as HTMLInputElement;
    act(() => {
      type(venueInput, "코엑스 A홀");
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/collect-sources/source_1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ venueConfig: { venue: "코엑스 A홀" } }),
      }),
    );
    expect(onSaved).toHaveBeenCalledWith({ venue: "코엑스 A홀" });
  });

  it("PATCH 실패 값을 저장 완료로 상위 상태에 반영하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    const onSaved = vi.fn();
    render(onSaved);

    const venueInput = container.querySelectorAll("input")[2] as HTMLInputElement;
    act(() => {
      type(venueInput, "실패할 장소");
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });

    expect(onSaved).not.toHaveBeenCalled();
  });
});
