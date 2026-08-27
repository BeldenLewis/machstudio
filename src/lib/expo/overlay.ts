/**
 * body 직계 **Shadow 포털** — 모달이 사는 곳.
 *
 * ── 왜 섹션의 Shadow 안에 못 두나 ─────────────────────────────────────
 * 마운트 조상에 `position:relative` 나 `transform` 이 있으면(아임웹은
 * `.section_wrap{position:relative}` 실측) 그것이 컨테이닝 블록이 되어 안쪽의
 * `position:fixed` 가 화면 기준이 아니라 그 박스 기준으로 계산된다. 모달이 구획 안
 * 어딘가에 잘려 앉는다. 그래서 화면 위에 떠야 하는 것은 **전부 body 직계로 포털한다.**
 *
 * ── 하지만 라이트 DOM 에는 두지 않는다 ───────────────────────────────
 * body 직계 노드도 자기 ShadowRoot 를 갖는다. 파트너 문서의 라이트 DOM 에 우리 모달
 * 마크업이 놓이면 그들의 `body > div` 규칙과 그들의 정리 스크립트에 그대로 노출된다.
 *
 * ── 0×0 호스트를 고른 이유 ────────────────────────────────────────────
 * 호스트를 전체 화면으로 깔고 `pointer-events:none` 으로 클릭을 통과시키는 방법도 있다.
 * 그러면 그 한 속성을 파트너가 이기는 순간 **파트너 페이지 전체가 클릭 불능**이 된다.
 * 0×0 고정 박스는 애초에 아무것도 가로막을 수 없고, 시트의
 * `.msx-portal{position:fixed;inset:0}` 이 화면을 덮는다(`position:fixed` 만으로는
 * 컨테이닝 블록이 되지 않으므로 화면 기준으로 계산된다 — 그래서 호스트 리셋이
 * transform 계열을 none 으로 못 박는 것이 여기서는 **장식이 아니다**).
 */
import { h } from "@/lib/dom/h";
import { collectTabbables, containsDeep, deepActiveElement, isRestorableTarget } from "@/lib/dom/focus";
import { lockScroll, unlockScroll } from "@/lib/dom/scroll-lock";
import { EXPO_PORTAL_RESET_CSS } from "@/lib/expo/host-reset";
import { ensureExpoStyles } from "@/lib/expo/sheet";

export const EXPO_PORTAL_REGISTRY_KEY = "__MACH_EXPO_PORTAL_V1__";
export const EXPO_PORTAL_ATTR = "data-msx-portal";
export const EXPO_PORTAL_VERSION = "v1";
export const EXPO_PORTAL_TAG = "mach-expo-overlay";

interface PortalHolder {
  layer: HTMLElement;
  onLost(): void;
}

interface PortalRecord {
  host: HTMLElement;
  root: ShadowRoot;
  renderRoot: HTMLElement;
  observer: MutationObserver | null;
  /**
   * 참조 카운트를 **숫자로 두지 않는다.** 호스트가 사라진 경로에서 모든 보유자의
   * `onLost` 를 불러야 하고, Set 이면 이중 해제가 언더플로가 아니라 무해한 no-op 이 된다.
   * 삽입 순서가 곧 z 순서다.
   */
  holders: Set<PortalHolder>;
}

type PortalHost = { [EXPO_PORTAL_REGISTRY_KEY]?: PortalRecord };

function warn(message: string, error?: unknown): void {
  try {
    if (typeof console !== "undefined" && console.warn) console.warn("[mach expo] " + message, error ?? "");
  } catch {
    /* 호스트 콘솔이 막혀 있어도 진행 */
  }
}

/**
 * 호스트가 사라졌다 — 논리적 정리를 끝까지 한다.
 *
 * **먼저 스냅샷, 그 다음 비우기, 마지막에 통지.** `onLost` 핸들러가 동기적으로
 * `acquireExpoPortal` 을 다시 부를 수 있다(다시 열려는 섹션). 등록부를 미리 지워 두면
 * 그 호출이 **우리가 순회 중인 Set 을 고치는 대신** 새 호스트를 만든다.
 */
function onPortalLost(store: PortalHost, record: PortalRecord): void {
  const holders = Array.from(record.holders);
  record.holders.clear();
  record.observer?.disconnect();
  record.observer = null;
  delete store[EXPO_PORTAL_REGISTRY_KEY];
  for (const holder of holders) {
    try {
      holder.onLost();
    } catch (error) {
      warn("포털 정리 중 오류", error);
    }
  }
}

function buildPortal(doc: Document, store: PortalHost): PortalRecord | null {
  const view = doc.defaultView as (Window & typeof globalThis) | null;
  if (!view || !doc.body) return null;

  const host = doc.createElement(EXPO_PORTAL_TAG);
  host.setAttribute(EXPO_PORTAL_ATTR, EXPO_PORTAL_VERSION);
  host.setAttribute("lang", "ko");
  host.setAttribute("translate", "no");
  // 넣기 전에 바른다 — 안 그러면 첫 레이아웃 한 번을 파트너 규칙으로 맞는다.
  host.setAttribute("style", EXPO_PORTAL_RESET_CSS);

  const root = host.attachShadow({ mode: "open", delegatesFocus: false });
  // 시트가 렌더 루트보다 먼저다 — 준비 게이트가 시트 없이는 동작하지 않는다.
  ensureExpoStyles(root, view);

  const renderRoot = doc.createElement("div");
  renderRoot.className = "msx-root";
  renderRoot.setAttribute("dir", "ltr");
  renderRoot.setAttribute("data-msx-portal-root", "1");
  // 포털은 열릴 때 이미 완성된 상태다 — 감출 단계가 없다.
  renderRoot.setAttribute("data-msx-ready", "1");
  root.appendChild(renderRoot);

  doc.body.appendChild(host);

  /**
   * 호스트가 사라지는 것을 감시한다. `subtree` 는 **쓰지 않는다** — 파트너의 모든 DOM
   * 쓰기마다 콜백이 돌아 우리 것이 아닌 페이지의 메인 스레드를 태운다. body 의
   * childList 만으로 중요한 경우(호스트 재렌더가 body 자식을 갈아치우는 것)를 잡는다.
   *
   * 이걸 놓치면 최악이 남는다: 스크롤 잠금 카운트가 영영 안 내려가서 파트너의 body 가
   * `position:fixed; top:-800px` 로 **모달도 없이** 굳는다.
   */
  let observer: MutationObserver | null = null;
  if (typeof view.MutationObserver === "function") {
    observer = new view.MutationObserver(() => {
      const current = store[EXPO_PORTAL_REGISTRY_KEY];
      if (!current || current.host.isConnected) return;
      onPortalLost(store, current);
    });
    observer.observe(doc.body, { childList: true });
  }

  const record: PortalRecord = { host, root, renderRoot, observer, holders: new Set() };
  store[EXPO_PORTAL_REGISTRY_KEY] = record;
  return record;
}

export interface ExpoPortalLease {
  /** `.msx-portal` — 이미 렌더 루트에 붙어 있다. */
  readonly layer: HTMLElement;
  /** `attachExpoForm({ styleRoot })` 에 이걸 넘긴다. */
  readonly root: ShadowRoot;
  /** 이 임대가 맨 위인가 — Tab·Escape 를 처리해도 되는지 판단한다. */
  isTopmost(): boolean;
  /** 여러 번 불러도 안전. */
  release(): void;
}

export function acquireExpoPortal(options: {
  /** `expoThemeVars(theme)` — 공용 렌더 루트가 아니라 **이 레이어**에 얹는다. */
  themeVars: Record<string, string>;
  sid: string;
  /** 호스트가 사라져 우리가 강제로 정리해야 할 때. */
  onLost: () => void;
  doc?: Document;
}): ExpoPortalLease | null {
  const doc = options.doc ?? (typeof document !== "undefined" ? document : null);
  if (!doc || !doc.body) return null;
  const store = (doc.defaultView ?? globalThis) as unknown as PortalHost;

  try {
    let record = store[EXPO_PORTAL_REGISTRY_KEY] ?? null;
    if (record && !record.host.isConnected) {
      onPortalLost(store, record);
      record = null;
    }
    if (!record) {
      /**
       * 다른 번들 사본이 이미 만들어 뒀을 수 있다. **우리 것임을 증명할 수 있을 때만**
       * 물려받는다 — 증명 못 하는 노드는 건드리지 않고 우리 것을 따로 만든다.
       */
      const found = doc.querySelector<HTMLElement>(`[${EXPO_PORTAL_ATTR}="${EXPO_PORTAL_VERSION}"]`);
      const foundRoot = found?.shadowRoot ?? null;
      const foundRender = foundRoot?.querySelector<HTMLElement>(".msx-root[data-msx-portal-root]") ?? null;
      if (found && foundRoot && foundRender) {
        record = { host: found, root: foundRoot, renderRoot: foundRender, observer: null, holders: new Set() };
        store[EXPO_PORTAL_REGISTRY_KEY] = record;
      } else {
        record = buildPortal(doc, store);
      }
    }
    if (!record) return null;
    const live = record;

    /**
     * 테마 토큰을 **레이어에** 얹는다. 한 파트너 페이지에 두 전시 홈페이지가 있으면
     * 강조색이 다르다 — 공용 `.msx-root` 에 얹으면 마지막에 쓴 쪽이 이겨서 이미 열려
     * 있는 다른 사이트의 오버레이 색이 조용히 바뀐다.
     */
    const layer = h("div", { class: "msx-portal", "data-msx-overlay": options.sid });
    for (const [key, value] of Object.entries(options.themeVars)) layer.style.setProperty(key, value);
    live.renderRoot.appendChild(layer);

    const holder: PortalHolder = { layer, onLost: options.onLost };
    live.holders.add(holder);

    let released = false;
    return {
      layer,
      root: live.root,
      isTopmost: () => live.renderRoot.lastElementChild === layer,
      release() {
        if (released) return;
        released = true;
        layer.remove();
        live.holders.delete(holder);
        if (live.holders.size > 0) return;
        /**
         * 마지막 임대가 끝나면 호스트까지 지운다. 화면 전체를 덮는 고정 노드를 파트너의
         * body 에 남겨 두면 그들의 `body > div` 규칙과 그들의 정리 스크립트에 계속
         * 걸린다 — 잔여물은 0이어야 한다.
         */
        live.observer?.disconnect();
        live.observer = null;
        live.host.remove();
        if (store[EXPO_PORTAL_REGISTRY_KEY] === live) delete store[EXPO_PORTAL_REGISTRY_KEY];
      },
    };
  } catch (error) {
    warn("포털을 만들지 못했어요", error);
    return null;
  }
}

/** 테스트용 — 창에 매단 포털 기록을 비운다. */
export function resetExpoPortal(host?: PortalHost): void {
  const target = host ?? (globalThis as unknown as PortalHost);
  const record = target[EXPO_PORTAL_REGISTRY_KEY];
  record?.observer?.disconnect();
  record?.host.remove();
  delete target[EXPO_PORTAL_REGISTRY_KEY];
}

// ── 모달 ────────────────────────────────────────────────────────────────

export interface ExpoModalOptions {
  themeVars: Record<string, string>;
  sid: string;
  /** 스크린리더가 읽는 이름. 섹션 제목에서 온다. */
  label: string;
  /**
   * 되돌릴 포커스가 아무것도 안 남았을 때의 마지막 후보(보통 섹션의 렌더 루트).
   * **`document.body.focus()` 는 절대 하지 않는다** — 파트너 문서 맨 위로 튄다.
   */
  fallbackFocus?: HTMLElement | null;
  /** 닫히기 직전 — DOM 을 지우기 **전에** 부른다(폼 예약을 먼저 끊어야 한다). */
  onClose?: () => void;
  doc?: Document;
}

export interface ExpoModalHandle {
  /** 내용이 들어갈 자리. */
  readonly body: HTMLElement;
  /** `attachExpoForm({ styleRoot })` 에 넘길 값. */
  readonly styleRoot: ShadowRoot;
  close(): void;
}

export function openExpoModal(options: ExpoModalOptions): ExpoModalHandle | null {
  const doc = options.doc ?? (typeof document !== "undefined" ? document : null);
  if (!doc) return null;

  /**
   * **DOM 을 만들기 전에** 지금 포커스를 잡아 둔다. 파트너의 MutationObserver 가 우리
   * 삽입에 반응해 무언가에 `focus()` 를 걸 수 있고, 여는 버튼 자체가 파트너 재렌더로
   * 사라질 수도 있다.
   */
  const savedDeep = deepActiveElement(doc);

  let lease: ExpoPortalLease | null = null;
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    try {
      controller.abort();
      /**
       * DOM 을 지우기 **전에** 알린다. 폼 다리가 예약을 먼저 끊어야, 날아오던
       * `/f/{sourceId}` 스크립트가 떼어진 자리를 보고 문서 탐색으로 떨어지는 창이 닫힌다.
       */
      options.onClose?.();
      lease?.release();
      unlockScroll();
      /**
       * 포커스는 **DOM 제거와 잠금 해제 뒤에** 되돌린다. 잠금 해제가 방금
       * `window.scrollTo` 를 했으므로 `preventScroll` 이 필수다 — 없으면 그 복원과
       * 싸워서 방문자를 파트너 페이지의 엉뚱한 곳에 데려다 놓는다.
       */
      const target = isRestorableTarget(savedDeep) ? savedDeep
        : isRestorableTarget(options.fallbackFocus ?? null) ? options.fallbackFocus!
        : null;
      if (target) {
        try {
          const needsTemporaryTabIndex = !target.hasAttribute("tabindex") && target.tabIndex < 0;
          if (needsTemporaryTabIndex) {
            // 영구 tabindex 는 클릭 포커스가 큰 블록에 앉게 만들고 잔여물로 남는다.
            target.setAttribute("tabindex", "-1");
            target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
          }
          target.focus({ preventScroll: true });
        } catch {
          /* 포커스는 최선 노력이다 */
        }
      }
    } catch (error) {
      warn("모달을 닫는 중 오류", error);
    }
  };

  const controller = new AbortController();

  lease = acquireExpoPortal({
    themeVars: options.themeVars,
    sid: options.sid,
    // 호스트가 사라졌다 — 우리 몫의 논리적 정리(잠금 해제·포커스 복원)는 그대로 한다.
    onLost: () => { lease = null; close(); },
    doc,
  });
  if (!lease) return null;

  const closeButton = h("button", {
    class: "msx-modal-close",
    type: "button",
    "aria-label": "닫기",
    onClick: () => close(),
  }, "×");

  const body = h("div", { class: "msx-modal-body" });
  const modal = h(
    "div",
    {
      class: "msx-modal",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": options.label,
      // 링이 비었을 때 포커스가 갈 곳. Tab 순서에는 들어가지 않는다(속성이 -1).
      tabindex: "-1",
    },
    closeButton,
    body,
  );
  lease.layer.appendChild(modal);

  lockScroll();

  // 키 이벤트는 composed 라, 문서 캡처 리스너가 Shadow 안에서 온 것도 본다.
  doc.addEventListener("keydown", (event: KeyboardEvent) => {
    if (closed || !lease || !lease.isTopmost()) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab" || event.defaultPrevented) return;

    const layer = lease.layer;
    const active = deepActiveElement(doc);
    const inside = typeof event.composedPath === "function"
      ? event.composedPath().includes(layer)
      : containsDeep(layer, active);

    // 링은 **매번 다시 모은다** — 폼 런타임이 트랩 설치 뒤에 자기 DOM 을 넣는다.
    const ring = collectTabbables(layer);
    if (ring.length === 0) {
      event.preventDefault();
      try { modal.focus({ preventScroll: true }); } catch { /* 최선 노력 */ }
      return;
    }
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (!inside) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus({ preventScroll: true });
      return;
    }
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }, { capture: true, signal: controller.signal });

  // 스크림 클릭으로 닫기 — 모달 **안쪽** 클릭은 통과시킨다.
  lease.layer.addEventListener("click", (event) => {
    if (event.target === lease?.layer) close();
  }, { signal: controller.signal });

  try {
    modal.focus({ preventScroll: true });
  } catch {
    /* 최선 노력 */
  }

  return { body, styleRoot: lease.root, close };
}
