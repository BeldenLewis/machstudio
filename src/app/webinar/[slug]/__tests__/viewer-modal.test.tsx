// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import ViewerModal from "../ViewerModal";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let host: HTMLDivElement | null = null;
let root: Root | null = null;

function renderRegistrationHandoff(onClose = vi.fn()) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);

  function Harness() {
    const [open, setOpen] = useState(false);
    const [opener, setOpener] = useState<HTMLButtonElement | null>(null);
    return (
      <>
        <button
          type="button"
          onClick={(event) => {
            setOpener(event.currentTarget);
            setOpen(true);
          }}
        >
          사전등록 열기
        </button>
        {open && (
          <ViewerModal
            surface="#fff"
            text="#111"
            soft={(pct) => `rgba(0,0,0,${pct / 100})`}
            label="사전등록 완료"
            onClose={() => {
              onClose();
              setOpen(false);
            }}
            restoreFocusTo={opener}
          >
            <button type="button">첫 행동</button>
            <button type="button">마지막 행동</button>
          </ViewerModal>
        )}
      </>
    );
  }

  act(() => root?.render(<Harness />));
  const opener = host.querySelector<HTMLButtonElement>("button")!;
  act(() => {
    opener.focus();
    opener.click();
  });
  return { view: host, opener, onClose };
}

async function flushFocusRestore() {
  await act(async () => {
    await Promise.resolve();
  });
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.removeAttribute("style");
  root = null;
  host = null;
});

describe("ViewerModal dialog lifecycle", () => {
  it("moves initial focus inside and wraps Tab in both directions", () => {
    const { view } = renderRegistrationHandoff();
    const dialog = view.querySelector<HTMLElement>('[role="dialog"]')!;
    const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button"));

    expect(dialog.contains(document.activeElement)).toBe(true);

    buttons.at(-1)!.focus();
    buttons.at(-1)!.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    }));
    expect(document.activeElement).toBe(buttons[0]);

    buttons[0].dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }));
    expect(document.activeElement).toBe(buttons.at(-1));
  });

  it("Escape closes once, restores scroll, and returns focus to the connected registration opener", async () => {
    document.body.style.overflow = "clip";
    const { opener, onClose } = renderRegistrationHandoff();

    expect(document.body.style.overflow).toBe("hidden");
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }));
    });
    await flushFocusRestore();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.style.overflow).toBe("clip");
    expect(document.activeElement).toBe(opener);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
