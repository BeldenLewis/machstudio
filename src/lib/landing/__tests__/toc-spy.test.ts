// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { attachTocSpy } from "@/lib/landing/effects";

type ObserverOptions = IntersectionObserverInit | undefined;

function rect(top: number, bottom: number): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    bottom,
    left: 0,
    right: 100,
    width: 100,
    height: bottom - top,
    toJSON: () => ({}),
  };
}

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];

  readonly options: ObserverOptions;
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds = [];

  constructor(_callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.options = options;
    FakeIntersectionObserver.instances.push(this);
  }
}

afterEach(() => {
  FakeIntersectionObserver.instances = [];
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("attachTocSpy", () => {
  it("각 목차 링크가 실제 세로 위치에 놓인 섹션의 배경 모드를 따른다", () => {
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);

    const root = document.createElement("main");
    root.dataset.bg = "light";
    const section = document.createElement("section");
    section.id = "lnd-about";
    section.dataset.bg = "light";
    root.append(section);

    const toc = document.createElement("nav");
    const link = document.createElement("a");
    link.dataset.tocId = "lnd-about";
    toc.append(link);
    vi.spyOn(section, "getBoundingClientRect").mockReturnValue(rect(200, 900));

    let linkTop = 100;
    vi.spyOn(link, "getBoundingClientRect").mockImplementation(() => rect(linkTop, linkTop + 30));

    const mirror = document.createElement("nav");
    const cleanup = attachTocSpy(root, toc, [section.id], mirror, "dark");

    expect(mirror.dataset.bg).toBe("dark");
    expect(link.dataset.bg).toBe("dark");
    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    expect(FakeIntersectionObserver.instances[0].options?.rootMargin).toBe("-30% 0px -60% 0px");

    linkTop = 300;
    window.dispatchEvent(new Event("scroll"));
    expect(link.dataset.bg).toBe("light");

    cleanup();
    expect(link.hasAttribute("data-bg")).toBe(false);
  });
});
