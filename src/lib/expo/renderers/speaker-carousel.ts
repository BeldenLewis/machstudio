import { isSafePublicUrl } from "@/lib/expo/destination";
import { renderImage, renderSectionShell } from "@/lib/expo/renderers/image";
import { createRendererLifecycle } from "@/lib/expo/renderers/lifecycle";
import type { ExpoImageValue, ImageCrop, SpeakerToken } from "@/lib/expo/sections/types";
import type { SectionRenderer } from "@/lib/expo/types";

const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const rows = (value: unknown): Array<Record<string, unknown>> => Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
const TOKENS: Record<SpeakerToken, { start: string; end: string; badgeInk: string }> = {
  robotics: { start: "#2F9B63", end: "#104D2D", badgeInk: "#FFFFFF" },
  ai: { start: "#3468D9", end: "#12306C", badgeInk: "#FFFFFF" },
  "autonomous-manufacturing": { start: "#65D5BD", end: "#125B4C", badgeInk: "#071B16" },
};
const token = (value: unknown): SpeakerToken => value === "ai" || value === "autonomous-manufacturing" ? value : "robotics";
const ordered = (value: unknown) => rows(value).map((item, index) => ({ item, index }))
  .sort((a, b) => (Number(a.item.order) || 0) - (Number(b.item.order) || 0) || a.index - b.index)
  .map(({ item }) => item);

export const renderSpeakerCarousel: SectionRenderer = (section, context) => {
  const doc = context.doc;
  const speakers = ordered(section.content.speakers).filter((speaker) => speaker.enabled !== false && text(speaker.name) && text(speaker.categoryId));
  const occupied = new Set(speakers.map((speaker) => text(speaker.categoryId)));
  const categories = ordered(section.content.categories).filter((category) => category.enabled !== false && text(category.label) && occupied.has(text(category.id)));
  const categoryIds = new Set(categories.map((category) => text(category.id)));
  const publicSpeakers = speakers.filter((speaker) => categoryIds.has(text(speaker.categoryId)));
  if (!categories.length || !publicSpeakers.length) return null;

  const lifecycle = createRendererLifecycle(doc);
  return lifecycle.guard(() => {
  const root = doc.createElement("div");
  root.className = "msx-speakers";
  const headingText = text(section.content.heading);
  if (headingText) {
    const heading = doc.createElement("h2");
    heading.className = "msx-heading";
    heading.textContent = headingText;
    root.appendChild(heading);
  }
  const description = text(section.content.description);
  if (description) {
    const prose = doc.createElement("p");
    prose.className = "msx-speaker-description";
    prose.textContent = description;
    root.appendChild(prose);
  }

  const filters = doc.createElement("div");
  filters.className = "msx-speaker-filters";
  filters.setAttribute("role", "group");
  filters.setAttribute("aria-label", "Speaker categories");
  const track = doc.createElement("div");
  track.className = "msx-speaker-track msx-pointer-track";
  track.setAttribute("role", "list");
  const cards = new Map<string, HTMLElement[]>();
  const tabs: HTMLButtonElement[] = [];
  let activeId = text(categories[0].id);

  const applyActive = (nextId: string, focus = false) => {
    activeId = nextId;
    tabs.forEach((tab) => {
      const active = tab.dataset.category === activeId;
      tab.tabIndex = active ? 0 : -1;
      tab.setAttribute("aria-pressed", String(active));
      if (active && focus) tab.focus();
    });
    for (const [categoryId, list] of cards) for (const card of list) card.hidden = categoryId !== activeId;
  };

  categories.forEach((category) => {
    const categoryId = text(category.id);
    const tab = doc.createElement("button");
    tab.className = "msx-speaker-filter";
    tab.type = "button";
    tab.dataset.category = categoryId;
    tab.textContent = text(category.label);
    tab.addEventListener("click", () => applyActive(categoryId), { signal: lifecycle.signal });
    tab.addEventListener("keydown", (event) => {
      const current = tabs.indexOf(tab);
      let next = current;
      if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
      else if (event.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else return;
      event.preventDefault();
      applyActive(tabs[next].dataset.category ?? activeId, true);
    }, { signal: lifecycle.signal });
    tabs.push(tab);
    filters.appendChild(tab);
  });

  for (const speaker of publicSpeakers) {
    const categoryId = text(speaker.categoryId);
    const category = categories.find((row) => text(row.id) === categoryId)!;
    const colors = TOKENS[token(category.gradientToken)];
    const card = doc.createElement("article");
    card.className = "msx-speaker-card";
    card.setAttribute("role", "listitem");
    card.style.setProperty("--msx-speaker-surface", "#0B0C0E");
    card.style.setProperty("--msx-speaker-gradient-start", colors.start);
    card.style.setProperty("--msx-speaker-gradient-end", colors.end);
    const badgeColors = TOKENS[token(category.badgeToken)];
    card.style.setProperty("--msx-speaker-badge", badgeColors.start);
    card.style.setProperty("--msx-speaker-badge-ink", badgeColors.badgeInk);
    const image = renderImage(doc, speaker.image as ExpoImageValue | undefined, {
      className: "msx-speaker-image",
      loading: "lazy",
      crop: speaker.crop as ImageCrop,
    });
    if (image) card.appendChild(image);
    const badge = doc.createElement("span");
    badge.className = "msx-speaker-badge";
    badge.textContent = text(category.label);
    card.appendChild(badge);
    const info = doc.createElement("div");
    info.className = "msx-speaker-info";
    const name = doc.createElement("h3");
    name.className = "msx-speaker-name";
    name.textContent = text(speaker.name);
    info.appendChild(name);
    const meta = doc.createElement("p");
    meta.className = "msx-speaker-meta";
    meta.textContent = [text(speaker.role), text(speaker.company)].filter(Boolean).join(" · ");
    info.appendChild(meta);
    card.appendChild(info);
    const profileUrl = text(speaker.profileUrl);
    if (profileUrl && isSafePublicUrl(profileUrl)) {
      const profile = doc.createElement("a");
      profile.className = "msx-speaker-profile";
      profile.href = profileUrl;
      profile.target = "_blank";
      profile.rel = "noopener noreferrer";
      profile.textContent = text(speaker.name);
      profile.setAttribute("aria-label", `${text(speaker.name)} profile`);
      card.appendChild(profile);
    }
    const list = cards.get(categoryId) ?? [];
    list.push(card);
    cards.set(categoryId, list);
    track.appendChild(card);
  }

  let pointerId: number | null = null;
  let startX = 0;
  let startScroll = 0;
  track.addEventListener("pointerdown", (event) => {
    pointerId = event.pointerId;
    startX = event.clientX;
    startScroll = track.scrollLeft;
    track.classList.add("is-dragging");
    track.setPointerCapture?.(event.pointerId);
  }, { signal: lifecycle.signal });
  // Chrome가 카드의 링크·이미지 drag를 먼저 시작하면 native pointermove가 끊긴다.
  // 브라우저 기본 drag만 막고 click은 남겨 carousel drag와 프로필 링크를 함께 보존한다.
  track.addEventListener("dragstart", (event) => event.preventDefault(), { signal: lifecycle.signal });
  track.addEventListener("pointermove", (event) => {
    if (pointerId !== event.pointerId) return;
    track.scrollLeft = startScroll - (event.clientX - startX);
  }, { signal: lifecycle.signal });
  const endPointer = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    track.releasePointerCapture?.(event.pointerId);
    pointerId = null;
    track.classList.remove("is-dragging");
  };
  track.addEventListener("pointerup", endPointer, { signal: lifecycle.signal });
  track.addEventListener("pointercancel", endPointer, { signal: lifecycle.signal });

  root.append(filters, track);
  applyActive(activeId);
  return {
    node: renderSectionShell(doc, section, root, { className: "msx-speaker-section", bg: "dark" }),
    dispose: lifecycle.dispose,
  };
  });
};
