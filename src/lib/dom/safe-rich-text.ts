const ALLOWED_TAGS = new Set([
  "a", "b", "blockquote", "br", "code", "div", "em", "h2", "h3", "h4", "hr", "i", "li",
  "ol", "p", "pre", "span", "strong", "table", "tbody", "td", "th", "thead", "tr", "u", "ul",
]);
const DROP_WITH_CONTENT = new Set(["iframe", "object", "script", "style", "svg", "template"]);

function safeLink(value: string): string {
  const trimmed = value.trim();
  if (/^(mailto:|tel:)/i.test(trimmed)) return trimmed;
  try {
    const parsed = new URL(trimmed, window.location.href);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
  } catch { return ""; }
}

function copySafeNode(node: Node, target: Node): void {
  if (node.nodeType === Node.TEXT_NODE) {
    target.appendChild(document.createTextNode(node.textContent ?? ""));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const source = node as Element;
  const tag = source.tagName.toLowerCase();
  if (DROP_WITH_CONTENT.has(tag)) return;
  const parent = ALLOWED_TAGS.has(tag) ? document.createElement(tag) : target;
  if (parent !== target) {
    if (tag === "a") {
      const href = safeLink(source.getAttribute("href") ?? "");
      if (href) {
        (parent as HTMLElement).setAttribute("href", href);
        (parent as HTMLElement).setAttribute("target", "_blank");
        (parent as HTMLElement).setAttribute("rel", "noopener noreferrer");
      }
    }
    if ((tag === "td" || tag === "th") && /^\d{1,2}$/.test(source.getAttribute("colspan") ?? "")) {
      (parent as HTMLElement).setAttribute("colspan", source.getAttribute("colspan")!);
    }
    target.appendChild(parent);
  }
  for (const child of Array.from(source.childNodes)) copySafeNode(child, parent);
}

export function safeRichTextFragment(source: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const parsed = new DOMParser().parseFromString(source, "text/html");
  for (const child of Array.from(parsed.body.childNodes)) copySafeNode(child, fragment);
  return fragment;
}
