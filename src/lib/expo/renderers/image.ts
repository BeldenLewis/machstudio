import { isSafePublicUrl } from "@/lib/expo/destination";
import { imageCropStyle, type ExpoImageValue, type ImageCrop } from "@/lib/expo/sections/types";
import type { PayloadSection } from "@/lib/expo/view-sections";

export interface ImageRenderOptions {
  className: string;
  loading?: "eager" | "lazy";
  crop?: ImageCrop;
}
export function renderImage(doc: Document, image: ExpoImageValue | undefined, options: ImageRenderOptions): HTMLImageElement | null {
  if (!image || !isSafePublicUrl(image.url)) return null;
  const node = doc.createElement("img");
  node.className = options.className;
  node.src = image.url;
  node.alt = image.decorative ? "" : (image.alt ?? "");
  node.loading = options.loading ?? "lazy";
  node.decoding = "async";
  if (image.width) node.width = image.width;
  if (image.height) node.height = image.height;
  if (options.crop) Object.assign(node.style, imageCropStyle(options.crop));
  return node;
}

export function renderSectionShell(
  doc: Document,
  section: PayloadSection,
  content: HTMLElement,
  options: { className?: string; bg?: string } = {},
): HTMLElement {
  const shell = doc.createElement("section");
  shell.className = ["msx-section", options.className].filter(Boolean).join(" ");
  shell.setAttribute("data-msx-sid", section.sid);
  shell.setAttribute("data-type", section.type);
  shell.setAttribute("data-variant", section.variant);
  const bg = options.bg ?? section.design.bg;
  if (bg) shell.setAttribute("data-bg", bg);
  const inner = doc.createElement("div");
  inner.className = "msx-inner";
  inner.appendChild(content);
  shell.appendChild(inner);
  return shell;
}
