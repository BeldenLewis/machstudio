import { DOMParser } from "@xmldom/xmldom";

export type SvgInspection =
  | { ok: true; width?: number; height?: number }
  | { ok: false; reason: string };

const BLOCKED_ELEMENTS = new Set(["script", "foreignobject", "iframe", "object", "embed"]);
const BLOCKED_CSS = /@import\b|@font-face\b|expression\s*\(|javascript\s*:/i;
const URL_FUNCTION = /url\(\s*([^)]+?)\s*\)/gi;

function safeCssReferences(value: string): boolean {
  // CSS escape로 url/javascript 토큰을 쪼개 우회하는 입력도 받지 않는다.
  if (BLOCKED_CSS.test(value) || value.includes("\\")) return false;
  URL_FUNCTION.lastIndex = 0;
  for (let match = URL_FUNCTION.exec(value); match; match = URL_FUNCTION.exec(value)) {
    const target = match[1].trim().replace(/^(?:['"])(.*)(?:['"])$/, "$1");
    if (!/^#[A-Za-z_][A-Za-z0-9_.:-]*$/.test(target)) return false;
  }
  return true;
}

function numericDimension(value: string | null): number | undefined {
  if (!value || !/^\d+(?:\.\d+)?(?:px)?$/i.test(value.trim())) return undefined;
  const number = Number.parseFloat(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

/** XML 구조를 파싱해 실행·외부 로드 가능성이 있는 SVG 구문을 전부 fail-closed 한다. */
export function inspectSvg(bytes: Uint8Array): SvgInspection {
  if (bytes.length === 0) return { ok: false, reason: "empty-svg" };
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, reason: "invalid-encoding" };
  }
  if (/<!DOCTYPE\b/i.test(source)) return { ok: false, reason: "doctype" };
  if (/<\?(?!xml(?:\s|\?>))/i.test(source) || /<\?xml[\s\S]*?\?>[\s\S]*?<\?/i.test(source)) {
    return { ok: false, reason: "processing-instruction" };
  }

  let parseError = "";
  let doc: ReturnType<DOMParser["parseFromString"]>;
  try {
    doc = new DOMParser({
      onError: (_level, message) => { parseError ||= String(message); },
    }).parseFromString(source, "image/svg+xml");
  } catch {
    return { ok: false, reason: "malformed-svg" };
  }
  if (parseError || !doc?.documentElement) return { ok: false, reason: "malformed-svg" };
  const root = doc.documentElement;
  if (root.localName?.toLowerCase() !== "svg" || root.namespaceURI !== "http://www.w3.org/2000/svg") {
    return { ok: false, reason: "invalid-root" };
  }

  const elements = [root, ...Array.from(root.getElementsByTagName("*"))];
  for (const element of elements) {
    const name = (element.localName || element.nodeName).toLowerCase();
    if (BLOCKED_ELEMENTS.has(name)) return { ok: false, reason: `blocked-element:${name}` };

    for (let index = 0; index < element.attributes.length; index++) {
      const attribute = element.attributes.item(index);
      if (!attribute) continue;
      const attrName = (attribute.localName || attribute.name).toLowerCase();
      const qualified = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (attrName.startsWith("on")) return { ok: false, reason: "event-attribute" };
      if (attrName === "href" || qualified === "xlink:href") {
        if (!/^#[A-Za-z_][A-Za-z0-9_.:-]*$/.test(value)) return { ok: false, reason: "external-reference" };
      }
      if (!safeCssReferences(value)) return { ok: false, reason: "unsafe-css" };
    }

    if (name === "style" && !safeCssReferences(element.textContent ?? "")) {
      return { ok: false, reason: "unsafe-css" };
    }
  }

  return {
    ok: true,
    width: numericDimension(root.getAttribute("width")),
    height: numericDimension(root.getAttribute("height")),
  };
}
