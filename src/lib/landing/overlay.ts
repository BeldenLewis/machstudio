/**
 * 호스트 문서 위에 뜨는 것(모달)을 위한 3종 유틸.
 *
 * 임베드에서 부딪히는 현실:
 *  - 마운트 조상에 position:relative / transform 이 있다(아임웹은 .section_wrap{position:relative} 실측).
 *    → 랜딩 내부에서 position:fixed 를 써도 조상이 containing block 이 되어 어긋난다.
 *    → fixed 로 떠야 하는 것은 전부 body 직계 레이어로 포털한다.
 *  - 실제 스크롤러가 body 인지 documentElement 인지 호스트마다 다르다(아임웹은 body).
 *    → body{position:fixed;top:-y} 기법은 어느 쪽이든 동작한다.
 *  - 호스트/다른 스크립트도 스크롤을 잠글 수 있다 → refcount + 원본 style 문자열 통째 복원.
 */

const LOCK_STATE = "__machLandingScrollLock";
const LAYER_ATTR = "data-ms-landing-layer";

interface LockState {
  locks: number;
  savedStyle: string | null;
  savedY: number;
  hadModalOpen: boolean;
}

type WithLock = typeof globalThis & { [LOCK_STATE]?: LockState };

/** body 직계 고정 레이어 — 없으면 만들고, 참조 카운트로 공유한다. */
export function acquireLayer(uid: string): HTMLElement {
  const existing = document.querySelector<HTMLElement>(`[${LAYER_ATTR}="${uid}"]`);
  if (existing) return existing;
  const layer = document.createElement("div");
  layer.setAttribute(LAYER_ATTR, uid);
  // .lnd 를 함께 붙여 토큰·리셋을 동일 적용. pointer-events:none 이라 평소엔 호스트 클릭을 막지 않는다.
  layer.className = "lnd lnd-layer";
  document.body.appendChild(layer);
  return layer;
}

export function releaseLayer(uid: string): void {
  const layer = document.querySelector<HTMLElement>(`[${LAYER_ATTR}="${uid}"]`);
  if (layer && !layer.firstChild) layer.remove();
}

export function lockScroll(): void {
  const g = globalThis as WithLock;
  const state = g[LOCK_STATE] ?? (g[LOCK_STATE] = { locks: 0, savedStyle: null, savedY: 0, hadModalOpen: false });
  if (state.locks++ > 0) return;

  const body = document.body;
  const docEl = document.documentElement;
  const y = window.scrollY || docEl.scrollTop || body.scrollTop || 0;
  const scrollbar = window.innerWidth - docEl.clientWidth;

  state.savedStyle = body.getAttribute("style");
  state.savedY = y;
  state.hadModalOpen = body.classList.contains("modal-open");

  body.style.position = "fixed";
  body.style.top = `${-y}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  body.style.overflow = "hidden";
  if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
  if (!state.hadModalOpen) body.classList.add("modal-open"); // 아임웹 자체 관례와 공유
  docEl.setAttribute("data-ms-landing-modal", "open");
}

export function unlockScroll(): void {
  const g = globalThis as WithLock;
  const state = g[LOCK_STATE];
  if (!state || --state.locks > 0) return;

  const body = document.body;
  if (state.savedStyle === null) body.removeAttribute("style");
  else body.setAttribute("style", state.savedStyle);
  if (!state.hadModalOpen) body.classList.remove("modal-open");
  document.documentElement.removeAttribute("data-ms-landing-modal");
  window.scrollTo(0, state.savedY);
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** 모달 안에 포커스를 가둔다. 해제 함수를 돌려준다. */
export function trapFocus(container: HTMLElement, returnTo: HTMLElement | null): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !container.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };
  document.addEventListener("keydown", onKeyDown, true);
  return () => {
    document.removeEventListener("keydown", onKeyDown, true);
    if (returnTo && document.contains(returnTo)) returnTo.focus();
  };
}
