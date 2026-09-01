import { isSafePublicUrl } from "@/lib/expo/destination";
import { renderImage, renderSectionShell } from "@/lib/expo/renderers/image";
import type { ExpoImageValue } from "@/lib/expo/sections/types";
import type { SectionRenderer } from "@/lib/expo/types";

const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const rows = (value: unknown): Array<Record<string, unknown>> => Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
const ordered = (value: unknown) => rows(value).map((item, index) => ({ item, index }))
  .sort((a, b) => (Number(a.item.order) || 0) - (Number(b.item.order) || 0) || a.index - b.index)
  .map(({ item }) => item);

export const renderSponsorMarquee: SectionRenderer = (section, context) => {
  const doc = context.doc;
  const sponsors = ordered(section.content.sponsors).filter((sponsor) => sponsor.enabled !== false && text(sponsor.name));
  const root = doc.createElement("div");
  root.className = "msx-sponsors";
  const headingText = text(section.content.heading);
  if (headingText) {
    const heading = doc.createElement("h2");
    heading.className = "msx-heading";
    heading.textContent = headingText;
    root.appendChild(heading);
  }

  for (const group of ordered(section.content.groups)) {
    const members = sponsors.filter((sponsor) => text(sponsor.groupId) === text(group.id));
    if (!members.length) continue;
    const block = doc.createElement("div");
    block.className = "msx-sponsor-group";
    const titleText = text(group.title);
    if (titleText) {
      const title = doc.createElement("h3");
      title.className = "msx-sponsor-title";
      title.textContent = titleText;
      block.appendChild(title);
    }
    const viewport = doc.createElement("div");
    viewport.className = group.marquee !== false && !context.reducedMotion ? "msx-sponsor-viewport is-marquee" : "msx-sponsor-viewport msx-sponsor-grid";
    const track = doc.createElement("div");
    track.className = "msx-sponsor-track";
    for (const sponsor of members) {
      const item = doc.createElement("div");
      item.className = "msx-sponsor-item";
      const logo = renderImage(doc, sponsor.logo as ExpoImageValue | undefined, { className: "msx-sponsor-logo" });
      const homepage = text(sponsor.homepageUrl);
      if (homepage && isSafePublicUrl(homepage)) {
        const anchor = doc.createElement("a");
        anchor.className = "msx-sponsor-link";
        anchor.href = homepage;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.setAttribute("aria-label", text(sponsor.name));
        if (logo) anchor.appendChild(logo);
        else anchor.textContent = text(sponsor.name);
        item.appendChild(anchor);
      } else if (logo) item.appendChild(logo);
      else item.textContent = text(sponsor.name);
      track.appendChild(item);
    }
    viewport.appendChild(track);
    if (group.marquee !== false && !context.reducedMotion) {
      const duration = typeof group.durationSeconds === "number" ? Math.max(8, Math.min(120, group.durationSeconds)) : 30;
      viewport.style.setProperty("--msx-marquee-duration", `${duration}s`);
      const clone = track.cloneNode(true) as HTMLElement;
      clone.setAttribute("aria-hidden", "true");
      clone.setAttribute("inert", "");
      clone.setAttribute("data-clone", "true");
      clone.querySelectorAll<HTMLElement>("a,button,input,select,textarea,[tabindex]")
        .forEach((control) => { control.tabIndex = -1; });
      viewport.appendChild(clone);
    }
    block.appendChild(viewport);
    root.appendChild(block);
  }
  if (!root.querySelector(".msx-sponsor-item")) return null;
  return { node: renderSectionShell(doc, section, root, { className: "msx-sponsor-section" }) };
};
