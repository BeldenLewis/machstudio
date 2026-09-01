import { selectVisibleCtas } from "@/lib/expo/cta";
import { renderDestinationAction } from "@/lib/expo/renderers/action";
import { renderSectionShell } from "@/lib/expo/renderers/image";
import type { CtaPlacement } from "@/lib/expo/sections/types";
import type { SectionRenderer } from "@/lib/expo/types";

const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const rows = (value: unknown): Array<Record<string, unknown>> => Array.isArray(value) ? value as Array<Record<string, unknown>> : [];

export const renderCtaBand: SectionRenderer = (section, context) => {
  const doc = context.doc;
  const controller = new (doc.defaultView?.AbortController ?? AbortController)();
  const audience = section.content.audience === "exhibitor" || section.content.audience === "visitor" ? section.content.audience : "all";
  const selected = selectVisibleCtas(rows(section.content.ctas) as unknown as CtaPlacement[], {
    audience,
    activeCampaignIds: new Set([...context.campaigns.values()].filter((row) => row.active).map((row) => row.id)),
    validDestinationIds: new Set(context.destinations.keys()),
    limit: 2,
  });
  if (!selected.length || !text(section.content.headline)) return null;
  const root = doc.createElement("div");
  root.className = "msx-cta-band";
  const heading = doc.createElement("h2");
  heading.className = "msx-cta-headline";
  heading.textContent = text(section.content.headline);
  root.appendChild(heading);
  const actions = doc.createElement("div");
  actions.className = "msx-cta-actions";
  for (const placement of selected) {
    const destination = context.destinations.get(placement.destinationId);
    const raw = placement as unknown as Record<string, unknown>;
    const label = text(raw.label);
    if (!destination || !label) continue;
    const action = renderDestinationAction(doc, { ...destination, label }, {
      className: "msx-cta-action",
      description: text(raw.description) || undefined,
      arrow: "right",
      mode: context.mode,
      signal: controller.signal,
    });
    if (!action) continue;
    action.setAttribute("data-variant", text(placement.variant) || "primary");
    actions.appendChild(action);
  }
  if (!actions.childElementCount) {
    controller.abort();
    return null;
  }
  root.appendChild(actions);
  return {
    node: renderSectionShell(doc, section, root, { className: "msx-cta-band-section", bg: "dark" }),
    dispose: () => controller.abort(),
  };
};
