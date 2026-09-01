import { isSafePublicUrl } from "@/lib/expo/destination";
import type { ResolvedDestination, SectionRenderContext } from "@/lib/expo/types";

export interface DestinationRenderOptions {
  className: string;
  description?: string;
  arrow?: "right" | "none";
  mode: SectionRenderContext["mode"];
  signal?: AbortSignal;
}

type RuntimeWindow = Window & {
  SITE?: { openModalMenu?: (modalId: string) => void };
  dataLayer?: unknown[];
};

const ANCHOR_TARGET = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;

function addText(doc: Document, node: HTMLElement, label: string, options: DestinationRenderOptions): void {
  const text = doc.createElement("span");
  text.className = "msx-action-label";
  text.textContent = label;
  node.appendChild(text);
  if (options.description) {
    const description = doc.createElement("span");
    description.className = "msx-action-description";
    description.textContent = options.description;
    node.appendChild(description);
  }
  if (options.arrow === "right") {
    const arrow = doc.createElement("span");
    arrow.className = "msx-action-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "→";
    node.appendChild(arrow);
  }
}

function listen(node: HTMLElement, type: string, listener: EventListener, signal?: AbortSignal): void {
  if (signal) node.addEventListener(type, listener, { signal });
  else node.addEventListener(type, listener);
}

function writeAnalytics(doc: Document, destination: ResolvedDestination, mode: SectionRenderContext["mode"]): void {
  if (mode !== "live") return;
  const view = doc.defaultView as RuntimeWindow | null;
  const EventCtor = (view as unknown as { CustomEvent?: typeof CustomEvent } | null)?.CustomEvent ?? CustomEvent;
  try {
    doc.dispatchEvent(new EventCtor("msx:destination", {
      bubbles: true,
      composed: true,
      detail: { destinationId: destination.id, actionType: destination.action.type },
    }));
  } catch { /* host analytics must never block the destination */ }
  if (Array.isArray(view?.dataLayer) && destination.analytics) {
    try {
      view.dataLayer.push({
        event: destination.analytics.eventName,
        content_id: destination.analytics.contentId,
        destination_id: destination.id,
      });
    } catch { /* a frozen host dataLayer must not break navigation */ }
  }
}

export function renderDestinationAction(
  doc: Document,
  destination: ResolvedDestination,
  options: DestinationRenderOptions,
): HTMLAnchorElement | HTMLButtonElement | null {
  const label = destination.label.trim();
  if (!label) return null;
  const action = destination.action;

  if (action.type === "url" || action.type === "download") {
    if (!isSafePublicUrl(action.href)) return null;
    const anchor = doc.createElement("a");
    anchor.className = options.className;
    anchor.href = action.href;
    if (action.type === "download") {
      anchor.setAttribute("download", "");
      anchor.rel = "noopener";
    } else if (action.newTab) {
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
    }
    addText(doc, anchor, label, options);
    listen(anchor, "click", () => writeAnalytics(doc, destination, options.mode), options.signal);
    return anchor;
  }

  if (action.type === "anchor") {
    if (!ANCHOR_TARGET.test(action.target)) return null;
    const anchor = doc.createElement("a");
    anchor.className = options.className;
    anchor.setAttribute("href", `#${action.target}`);
    addText(doc, anchor, label, options);
    listen(anchor, "click", () => writeAnalytics(doc, destination, options.mode), options.signal);
    return anchor;
  }

  if (action.type === "imweb-modal" && ANCHOR_TARGET.test(action.modalId)) {
    const fallbackHref = action.fallbackHref && isSafePublicUrl(action.fallbackHref) ? action.fallbackHref : "";
    const button = doc.createElement("button");
    button.className = options.className;
    button.type = "button";
    addText(doc, button, label, options);
    listen(button, "click", () => {
      writeAnalytics(doc, destination, options.mode);
      const view = doc.defaultView as RuntimeWindow | null;
      try {
        const site = view?.SITE;
        const open = site?.openModalMenu;
        if (typeof open === "function") {
          open.call(site, action.modalId);
          return;
        }
      } catch { /* a broken host integration falls through to the public fallback */ }
      const EventCtor = (view as unknown as { CustomEvent?: typeof CustomEvent } | null)?.CustomEvent ?? CustomEvent;
      const claimed = !doc.dispatchEvent(new EventCtor("msx:imweb-modal", {
        bubbles: true,
        composed: true,
        cancelable: true,
        detail: { modalId: action.modalId, destinationId: destination.id },
      }));
      if (!claimed && fallbackHref && view) {
        try { view.location.assign(fallbackHref); } catch { /* jsdom or a locked host location */ }
      }
    }, options.signal);
    return button;
  }

  return null;
}
