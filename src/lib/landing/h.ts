/**
 * 랜딩 DOM 빌더 — createElement / textContent 만 사용한다.
 *
 * 왜 문자열 HTML 을 안 쓰는가: 랜딩은 외부 사이트(아임웹 등) 문서 안에 직접 마운트된다.
 * 서버에서 이스케이프한 HTML 을 innerHTML 로 넣는 방식이면 렌더 함수 한 곳에서 esc() 를
 * 빠뜨리는 순간 파트너 도메인 전체가 XSS 에 노출된다. 이 파일과 view* 파일에서
 * innerHTML/outerHTML/insertAdjacentHTML 을 절대 쓰지 않는다(landing-safety 테스트가 강제).
 */

import { safeHttpUrl } from "@/lib/webinar-config";

export type Child = Node | string | number | false | null | undefined | Child[];

export interface Props {
  class?: string | false | null;
  style?: Record<string, string | number | null | undefined>;
  /** on* 은 함수만 허용 — 문자열 핸들러(=코드 주입 경로)는 거부한다. */
  [key: string]: unknown;
}

/** href/src 류는 http(s) 만 통과. javascript: · data: 스킴 차단. */
const URL_ATTRS = new Set(["href", "src", "action", "formaction", "xlink:href", "poster"]);

export function setAttrSafe(el: Element, name: string, value: unknown): void {
  if (value === null || value === undefined || value === false) return;
  if (/^on/i.test(name)) return; // 문자열 이벤트 핸들러 금지
  if (URL_ATTRS.has(name)) {
    const safe = safeHttpUrl(String(value));
    if (!safe) return; // 위험하거나 비어 있으면 속성 자체를 생략
    el.setAttribute(name, safe);
    return;
  }
  el.setAttribute(name, String(value));
}

function appendChildren(el: Element, kids: Child[]): void {
  for (const kid of kids) {
    if (kid === null || kid === undefined || kid === false || kid === "") continue;
    if (Array.isArray(kid)) {
      appendChildren(el, kid);
    } else if (kid instanceof Node) {
      el.appendChild(kid);
    } else {
      el.appendChild(document.createTextNode(String(kid)));
    }
  }
}

function applyProps(el: Element, props: Props | null | undefined): void {
  if (!props) return;
  for (const [key, raw] of Object.entries(props)) {
    if (raw === null || raw === undefined || raw === false) continue;
    if (key === "class") {
      el.setAttribute("class", String(raw));
    } else if (key === "style" && typeof raw === "object") {
      const style = (el as HTMLElement).style;
      for (const [prop, val] of Object.entries(raw as Record<string, unknown>)) {
        if (val === null || val === undefined) continue;
        if (prop.startsWith("--")) style.setProperty(prop, String(val));
        else style.setProperty(prop, String(val));
      }
    } else if (/^on/i.test(key)) {
      // 함수만 리스너로 등록. 문자열이면 조용히 무시(setAttrSafe 로 새지 않게 여기서 끊는다).
      if (typeof raw === "function") {
        el.addEventListener(key.slice(2).toLowerCase(), raw as EventListener);
      }
    } else {
      setAttrSafe(el, key, raw);
    }
  }
}

export function h(tag: string, props?: Props | null, ...kids: Child[]): HTMLElement {
  const el = document.createElement(tag);
  applyProps(el, props);
  appendChildren(el, kids);
  return el;
}

export function svg(tag: string, props?: Props | null, ...kids: Child[]): SVGElement {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  applyProps(el, props);
  appendChildren(el, kids);
  return el;
}

export function frag(...kids: Child[]): DocumentFragment {
  const f = document.createDocumentFragment();
  const holder = document.createElement("div");
  appendChildren(holder, kids);
  while (holder.firstChild) f.appendChild(holder.firstChild);
  return f;
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function clearNode(el: Node): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}
