/**
 * Shadow 경계를 **넘어서** 포커스를 다루는 도구들.
 *
 * ── 왜 표준 API 로 안 되나 ────────────────────────────────────────────
 * Shadow 안의 버튼에 포커스가 있을 때 `document.activeElement` 는 그 버튼이 아니라
 * **호스트 요소**를 준다(리타게팅). 그래서 다음 세 관용구가 전부 조용히 틀린다:
 *   `document.activeElement === el`      → 항상 false
 *   `container.contains(activeElement)`  → 항상 false
 *   `el.offsetParent !== null`           → fixed 조상 아래에서 항상 null
 *
 * 랜딩의 `trapFocus`(src/lib/landing/overlay.ts)가 정확히 이 셋을 쓴다. 그래서 그대로
 * 가져오면 **우리 모달의 모든 요소를 "바깥" 으로 분류하고** Tab 마다 자기와 싸운다.
 * 여기서 다시 만든다.
 */

/**
 * 진짜 포커스된 요소. `activeElement` 는 **한 단계씩만** 리타게팅하므로 반복해야 한다.
 *
 * 닫힌 루트에서는 `shadowRoot` 가 null 이라 그 호스트에서 멈춘다 — 안을 볼 수 없으니
 * 호스트를 포커스된 요소로 다루는 것이 정직한 답이다. 우회하지 않는다.
 */
export function deepActiveElement(doc: Document): Element | null {
  let el: Element | null = doc.activeElement;
  while (el) {
    const inner = (el as HTMLElement).shadowRoot?.activeElement ?? null;
    if (!inner || inner === el) return el;
    el = inner;
  }
  return null;
}

/**
 * `container` 안에 있는가 — Shadow 를 통과해서 본다.
 * `container.contains(node)` 는 컨테이너의 Shadow 안 노드에 대해 **false** 다.
 */
export function containsDeep(container: Node, node: Node | null): boolean {
  let current: Node | null = node;
  while (current) {
    if (current === container) return true;
    const parent = current.parentNode;
    current = parent instanceof ShadowRoot ? parent.host : parent;
  }
  return false;
}

const FOCUSABLE_SELECTOR = [
  // `a[href]` 다 — href 없는 <a> 는 브라우저가 tabIndex -1 로 보는데 jsdom 은 0 으로 본다.
  // `a` 로 쓰면 **테스트에서만** 포커스 못 받는 노드가 링에 들어간다.
  "a[href]", "area[href]", "button", "input", "select", "textarea",
  "iframe", "object", "embed", "summary",
  "audio[controls]", "video[controls]",
  "[contenteditable]", '[contenteditable=""]', '[contenteditable="true"]',
  "[tabindex]",
].join(",");

/**
 * 보이는가. **`offsetParent` 를 쓰지 않는다** — jsdom 에서는 항상 null 이고,
 * 실제 브라우저에서도 `position:fixed` 조상 아래 모든 요소에서 null 이다.
 * 우리 오버레이는 통째로 그 안에 있으므로 그 필터는 링을 **프로덕션에서도** 비운다.
 *
 * 환경이 답을 못 주면 "보인다" 로 기운다 — 링이 비어 Tab 이 전부 막히는 것보다 낫다.
 */
function isVisible(el: HTMLElement): boolean {
  const view = el.ownerDocument.defaultView;
  if (!view || typeof view.getComputedStyle !== "function") return true;
  let node: Element | null = el;
  while (node) {
    const style = view.getComputedStyle(node as HTMLElement);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
    const parent: Node | null = node.parentNode;
    const next: Node | null = parent instanceof ShadowRoot ? parent.host : parent;
    node = next && next.nodeType === 1 ? (next as Element) : null;
  }
  return true;
}

function isTabbable(el: HTMLElement): boolean {
  if (!el.matches(FOCUSABLE_SELECTOR)) return false;
  if (el.hasAttribute("disabled") || (el as HTMLInputElement).disabled === true) return false;
  // **속성**을 본다 — `.tabIndex` 를 보면 tabindex 가 아예 없는 <button> 까지 걸러진다.
  if (el.getAttribute("tabindex") === "-1") return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  if ((el as HTMLInputElement).type === "hidden") return false;
  return isVisible(el);
}

/**
 * 합성(composed) 탭 순서로 모은다.
 *
 * `querySelectorAll` 은 **한 루트 안의** 평면 순서만 준다 — Shadow 호스트의 내용이
 * 호스트의 라이트 서브트리 **전체 뒤**에 붙는다. 실제 탭 순서는 호스트와 그 다음
 * 형제 사이다. 자식을 걸어 내려가는 이 모양만 그 순서를 만든다.
 *
 * `shadowRoot` 가 있으면 **그쪽만** 내려간다. 우리는 `<slot>` 을 노출하지 않으므로
 * 호스트의 라이트 자식은 그려지지도 않고 탭도 안 된다 — 둘 다 내려가면 보이지 않는
 * 요소가 링에 섞인다.
 */
export function collectTabbables(root: ParentNode): HTMLElement[] {
  const out: HTMLElement[] = [];
  const walk = (node: ParentNode) => {
    for (const el of Array.from(node.children) as HTMLElement[]) {
      if (isTabbable(el)) out.push(el);
      if (el.shadowRoot) walk(el.shadowRoot);
      else walk(el);
    }
  };
  walk(root);
  return out;
}

/** 포커스를 되돌려도 되는 대상인가. `isConnected` 다 — `document.contains` 는 Shadow 를 못 본다. */
export function isRestorableTarget(el: Element | null): el is HTMLElement {
  return Boolean(el)
    && (el as HTMLElement).isConnected
    && typeof (el as HTMLElement).focus === "function"
    && (el as HTMLInputElement).disabled !== true;
}
