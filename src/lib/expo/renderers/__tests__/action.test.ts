/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderDestinationAction } from "@/lib/expo/renderers/action";
import type { DestinationAction, ResolvedDestination } from "@/lib/expo/types";

const destination = (action: DestinationAction, over: Partial<ResolvedDestination> = {}): ResolvedDestination => ({
  id: "action", label: "열기", action, ...over,
});

afterEach(() => {
  delete (window as Window & { SITE?: unknown }).SITE;
  delete (window as Window & { dataLayer?: unknown }).dataLayer;
});

describe("destination actions", () => {
  it.each(["url", "anchor", "download"] as const)("renders %s as a real anchor", (type) => {
    const action: DestinationAction = type === "url"
      ? { type, href: "https://smarttechkorea.com/214" }
      : type === "anchor"
        ? { type, target: "newsletter" }
        : { type, href: "https://cdn.example.com/stk-2027.pdf" };
    const expectedHref = action.type === "anchor" ? "#newsletter" : action.href;
    const node = renderDestinationAction(document, destination(action), { className: "msx-btn", mode: "live" });
    expect(node?.tagName).toBe("A");
    expect(node?.getAttribute("href")).toBe(expectedHref);
  });

  it("applies safe download and external-tab attributes", () => {
    const download = renderDestinationAction(document, destination({ type: "download", href: "https://cdn.example.com/stk.pdf" }), { className: "x", mode: "live" });
    const external = renderDestinationAction(document, destination({ type: "url", href: "https://example.com", newTab: true }), { className: "x", mode: "live" });
    expect(download).toEqual(expect.objectContaining({ tagName: "A" }));
    expect(download?.getAttribute("download")).toBe("");
    expect(download?.getAttribute("rel")).toBe("noopener");
    expect(external?.getAttribute("target")).toBe("_blank");
    expect(external?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("renders a modal as a button with the documented Imweb handler", () => {
    const openModalMenu = vi.fn();
    Object.assign(window, { SITE: { openModalMenu } });
    const node = renderDestinationAction(document, destination({ type: "imweb-modal", modalId: "mInquiry" }), { className: "msx-btn", mode: "live" });
    node?.click();
    expect(node?.tagName).toBe("BUTTON");
    expect(node?.getAttribute("type")).toBe("button");
    expect(openModalMenu).toHaveBeenCalledWith("mInquiry");
  });

  it("offers a cancelable modal fallback event before navigation", () => {
    const handled = vi.fn((event: Event) => event.preventDefault());
    document.addEventListener("msx:imweb-modal", handled, { once: true });
    const node = renderDestinationAction(document, destination({
      type: "imweb-modal", modalId: "mInquiry", fallbackHref: "https://smarttechkorea.com/214",
    }), { className: "msx-btn", mode: "live" });
    node?.click();
    expect(handled).toHaveBeenCalledTimes(1);
  });

  it.each(["preview-draft", "preview-published", "standalone"] as const)("writes no analytics in %s", (mode) => {
    const seen = vi.fn();
    document.addEventListener("msx:destination", seen);
    const dataLayer: unknown[] = [];
    Object.assign(window, { dataLayer });
    const node = renderDestinationAction(document, destination(
      { type: "anchor", target: "newsletter" },
      { analytics: { eventName: "select_content", contentId: "newsletter" } },
    ), { className: "msx-btn", mode });
    node?.click();
    expect(seen).not.toHaveBeenCalled();
    expect(dataLayer).toEqual([]);
    document.removeEventListener("msx:destination", seen);
  });

  it("writes the composed event and dataLayer only in live mode", () => {
    const seen = vi.fn();
    document.addEventListener("msx:destination", seen);
    const dataLayer: unknown[] = [];
    Object.assign(window, { dataLayer });
    const node = renderDestinationAction(document, destination(
      { type: "anchor", target: "newsletter" },
      { analytics: { eventName: "select_content", contentId: "newsletter" } },
    ), { className: "msx-btn", mode: "live" });
    node?.click();
    expect(seen).toHaveBeenCalledTimes(1);
    expect((seen.mock.calls[0][0] as CustomEvent).composed).toBe(true);
    expect(dataLayer).toEqual([{ event: "select_content", content_id: "newsletter", destination_id: "action" }]);
    document.removeEventListener("msx:destination", seen);
  });

  it("still performs the destination when a host dataLayer rejects writes", () => {
    const openModalMenu = vi.fn();
    Object.assign(window, { SITE: { openModalMenu }, dataLayer: Object.freeze([]) });
    const node = renderDestinationAction(document, destination(
      { type: "imweb-modal", modalId: "mInquiry" },
      { analytics: { eventName: "select_content" } },
    ), { className: "msx-btn", mode: "live" });
    expect(() => node?.click()).not.toThrow();
    expect(openModalMenu).toHaveBeenCalledWith("mInquiry");
  });

  it("rejects unsafe and unknown stored actions instead of creating a dead control", () => {
    expect(renderDestinationAction(document, destination({ type: "url", href: "javascript:alert(1)" }), { className: "x", mode: "live" })).toBeNull();
    expect(renderDestinationAction(document, destination({ type: "unknown" } as never), { className: "x", mode: "live" })).toBeNull();
    expect(document.querySelector("[href^='javascript:']")).toBeNull();
  });
});
