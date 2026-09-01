import { renderDestinationAction } from "@/lib/expo/renderers/action";
import { renderImage, renderSectionShell } from "@/lib/expo/renderers/image";
import type { ExpoImageValue } from "@/lib/expo/sections/types";
import type { SectionRenderer } from "@/lib/expo/types";

const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const rows = (value: unknown): Array<Record<string, unknown>> => Array.isArray(value) ? value as Array<Record<string, unknown>> : [];

export const renderAudienceLinks: SectionRenderer = (section, context) => {
  const doc = context.doc;
  const controller = new (doc.defaultView?.AbortController ?? AbortController)();
  const source = rows(section.content.groups);
  const activeCampaigns = new Set([...context.campaigns.values()].filter((row) => row.active).map((row) => row.id));
  const root = doc.createElement("div");
  root.className = "msx-audience-groups";

  for (const audience of ["exhibitor", "visitor"] as const) {
    const raw = source.find((group) => group.audience === audience) ?? {};
    const group = doc.createElement("div");
    group.className = "msx-audience-group";
    group.setAttribute("data-audience", audience);
    group.setAttribute("data-variant", raw.variant === "dark" ? "dark" : "light");
    const title = doc.createElement("h2");
    title.className = "msx-audience-title";
    title.textContent = text(raw.title) || (audience === "exhibitor" ? "Exhibitors" : "Visitors");
    group.appendChild(title);
    const description = text(raw.description);
    if (description) {
      const prose = doc.createElement("p");
      prose.className = "msx-audience-description";
      prose.textContent = description;
      group.appendChild(prose);
    }
    const list = doc.createElement("div");
    list.className = "msx-audience-actions";
    const links = rows(raw.items)
      .filter((item) => item.enabled !== false)
      .filter((item) => {
        const ids = Array.isArray(item.campaignIds) ? item.campaignIds.filter((id): id is string => typeof id === "string") : [];
        return ids.length === 0 || ids.some((id) => activeCampaigns.has(id));
      })
      .map((item, index) => ({ item, index }))
      .sort((a, b) => (Number(a.item.order) || 0) - (Number(b.item.order) || 0) || a.index - b.index)
      .map(({ item }) => item);
    for (const link of links) {
      const destination = context.destinations.get(text(link.destinationId));
      const label = text(link.label);
      if (!destination || !label) continue;
      const action = renderDestinationAction(doc, { ...destination, label }, {
        className: "msx-audience-action",
        arrow: "right",
        mode: context.mode,
        signal: controller.signal,
      });
      if (!action) continue;
      const icon = renderImage(doc, link.icon as ExpoImageValue | undefined, { className: "msx-audience-icon" });
      if (icon) action.insertBefore(icon, action.firstChild);
      list.appendChild(action);
    }
    group.appendChild(list);
    root.appendChild(group);
  }

  if (!root.querySelector(".msx-audience-action")) {
    controller.abort();
    return null;
  }
  return {
    node: renderSectionShell(doc, section, root, { className: "msx-audience-section" }),
    dispose: () => controller.abort(),
  };
};
