import { selectVisibleCtas } from "@/lib/expo/cta";
import { isSafePublicUrl } from "@/lib/expo/destination";
import { renderDestinationAction } from "@/lib/expo/renderers/action";
import { renderImage, renderSectionShell } from "@/lib/expo/renderers/image";
import type { CtaPlacement, ExpoImageValue } from "@/lib/expo/sections/types";
import type { SectionRenderer } from "@/lib/expo/types";

const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const rows = (value: unknown): Array<Record<string, unknown>> => Array.isArray(value) ? value as Array<Record<string, unknown>> : [];

export const renderCampaignHero: SectionRenderer = (section, context) => {
  const content = section.content;
  const lines = Array.isArray(content.typingLines)
    ? (content.typingLines as unknown[]).map(text).filter(Boolean)
    : [];
  const headline = text(content.accessibleHeadline) || lines[0] || "";
  if (!headline) return null;

  const doc = context.doc;
  const view = doc.defaultView;
  const controller = new (view?.AbortController ?? AbortController)();
  const hero = doc.createElement("div");
  hero.className = "msx-hero";
  const overlay = typeof content.overlay === "number" ? Math.max(0, Math.min(0.9, content.overlay)) : 0.45;
  hero.style.setProperty("--msx-hero-overlay", String(overlay));

  const media = doc.createElement("div");
  media.className = "msx-hero-media";
  const video = content.video && typeof content.video === "object" ? content.video as Record<string, unknown> : null;
  const poster = video?.poster as ExpoImageValue | undefined;
  const posterNode = renderImage(doc, poster, { className: "msx-hero-poster", loading: "eager" });
  if (context.reducedMotion) {
    if (posterNode) media.appendChild(posterNode);
  } else if (video && text(video.url) && isSafePublicUrl(text(video.url))) {
    const videoNode = doc.createElement("video");
    videoNode.className = "msx-hero-video";
    videoNode.src = text(video.url);
    videoNode.autoplay = true;
    videoNode.muted = true;
    videoNode.defaultMuted = true;
    videoNode.loop = true;
    videoNode.playsInline = true;
    videoNode.setAttribute("aria-hidden", "true");
    if (posterNode) {
      videoNode.poster = posterNode.src;
      posterNode.hidden = true;
      media.append(videoNode, posterNode);
      videoNode.addEventListener("error", () => {
        videoNode.hidden = true;
        posterNode.hidden = false;
      }, { signal: controller.signal });
    } else media.appendChild(videoNode);
  } else if (posterNode) media.appendChild(posterNode);
  if (media.childElementCount) hero.appendChild(media);

  const body = doc.createElement("div");
  body.className = "msx-hero-body";
  const eyebrow = text(content.eyebrow);
  if (eyebrow) {
    const node = doc.createElement("p");
    node.className = "msx-hero-eyebrow";
    node.textContent = eyebrow;
    body.appendChild(node);
  }
  const heading = doc.createElement("h1");
  heading.className = "msx-hero-heading";
  heading.textContent = headline;
  body.appendChild(heading);

  const typing = content.typing && typeof content.typing === "object" ? content.typing as Record<string, unknown> : {};
  const typed = doc.createElement("p");
  typed.className = "msx-hero-typing";
  typed.setAttribute("aria-hidden", "true");
  typed.textContent = lines[0] ?? headline;
  body.appendChild(typed);

  let timer: number | null = null;
  if (!context.reducedMotion && typing.enabled !== false && lines.length > 1 && view) {
    const speed = typeof typing.speedMs === "number" ? typing.speedMs : 70;
    const hold = typeof typing.holdMs === "number" ? typing.holdMs : 2000;
    let lineIndex = 0;
    let charIndex = lines[0].length;
    let deleting = true;
    const tick = () => {
      const line = lines[lineIndex];
      charIndex += deleting ? -1 : 1;
      typed.textContent = line.slice(0, Math.max(0, charIndex));
      let delay = speed;
      if (charIndex <= 0) {
        deleting = false;
        lineIndex = (lineIndex + 1) % lines.length;
      } else if (!deleting && charIndex >= lines[lineIndex].length) {
        deleting = true;
        delay = hold;
      }
      timer = view.setTimeout(tick, delay);
    };
    timer = view.setTimeout(tick, hold);
  }

  const placements = rows(content.ctas) as unknown as CtaPlacement[];
  const selected = selectVisibleCtas(placements, {
    audience: "all",
    activeCampaignIds: new Set([...context.campaigns.values()].filter((row) => row.active).map((row) => row.id)),
    validDestinationIds: new Set(context.destinations.keys()),
    limit: 2,
  });
  const actions = doc.createElement("div");
  actions.className = "msx-hero-actions";
  for (const placement of selected) {
    const destination = context.destinations.get(placement.destinationId);
    const label = text((placement as unknown as Record<string, unknown>).label);
    if (!destination || !label) continue;
    const action = renderDestinationAction(doc, { ...destination, label }, {
      className: "msx-btn msx-hero-action",
      description: text((placement as unknown as Record<string, unknown>).description) || undefined,
      mode: context.mode,
      signal: controller.signal,
    });
    if (action) actions.appendChild(action);
  }
  if (actions.childElementCount) body.appendChild(actions);
  hero.appendChild(body);

  const shell = renderSectionShell(doc, section, hero, { className: "msx-hero-section", bg: "dark" });
  return {
    node: shell,
    dispose() {
      if (timer !== null && view) view.clearTimeout(timer);
      timer = null;
      controller.abort();
    },
  };
};
