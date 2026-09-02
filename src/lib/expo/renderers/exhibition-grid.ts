import { renderDestinationAction } from "@/lib/expo/renderers/action";
import { renderImage, renderSectionShell } from "@/lib/expo/renderers/image";
import { createRendererLifecycle } from "@/lib/expo/renderers/lifecycle";
import type { ExpoImageValue } from "@/lib/expo/sections/types";
import type { SectionRenderer } from "@/lib/expo/types";

const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const rows = (value: unknown): Array<Record<string, unknown>> => Array.isArray(value) ? value as Array<Record<string, unknown>> : [];

export const renderExhibitionGrid: SectionRenderer = (section, context) => {
  const doc = context.doc;
  const items = rows(section.content.items)
    .filter((item) => item.enabled !== false && text(item.title) && context.destinations.has(text(item.destinationId)))
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (Number(a.item.order) || 0) - (Number(b.item.order) || 0) || a.index - b.index)
    .map(({ item }) => item);
  if (items.length === 0) return null;

  const lifecycle = createRendererLifecycle(doc);
  return lifecycle.guard(() => {
  const root = doc.createElement("div");
  root.className = "msx-exhibition";
  const headingText = text(section.content.heading);
  if (headingText) {
    const heading = doc.createElement("h2");
    heading.className = "msx-heading";
    heading.textContent = headingText;
    root.appendChild(heading);
  }
  const grid = doc.createElement("div");
  grid.className = "msx-exhibition-grid";
  for (const item of items) {
    const destination = context.destinations.get(text(item.destinationId));
    if (!destination) continue;
    const action = renderDestinationAction(doc, { ...destination, label: text(item.title) }, {
      className: "msx-exhibition-item",
      mode: context.mode,
      signal: lifecycle.signal,
    });
    if (!action) continue;
    while (action.firstChild) action.removeChild(action.firstChild);
    action.setAttribute("data-accent", text(item.accentToken) || "orange");
    const symbol = renderImage(doc, item.symbol as ExpoImageValue | undefined, { className: "msx-exhibition-symbol msx-source-color" });
    if (symbol) action.appendChild(symbol);
    const title = doc.createElement("span");
    title.className = "msx-exhibition-title";
    title.textContent = text(item.title);
    action.appendChild(title);
    const description = text(item.description);
    if (description) {
      const prose = doc.createElement("span");
      prose.className = "msx-exhibition-description";
      prose.textContent = description;
      action.appendChild(prose);
    }
    grid.appendChild(action);
  }
  if (!grid.childElementCount) {
    lifecycle.dispose();
    return null;
  }
  root.appendChild(grid);
  const shell = renderSectionShell(doc, section, root, { className: "msx-exhibition-section" });
  shell.setAttribute("data-count", String(grid.childElementCount));
  shell.style.setProperty("--msx-exhibition-columns", String(grid.childElementCount));
  return { node: shell, dispose: lifecycle.dispose };
  });
};
