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

/**
 * 목차 전용 body 직계 고정 레이어. 모달 레이어(acquireLayer)와 **일부러 분리**했다:
 *  - 수명이 다르다(목차는 마운트 내내 / 모달은 열려 있는 동안) → 공유하면 refcount 해제가 엉킨다.
 *  - z-index 를 레이어 단위로 못박아 모달이 항상 목차 위에 온다(한 레이어 안에서 z-index 다툴 필요 없음).
 *  - 키컬러 구간에서 목차 색을 바꾸려면 on-accent 를 레이어에 미러링해야 하는데,
 *    모달과 공유하면 `.lnd.on-accent{background:var(--primary)}` 가 모달 레이어에 번진다.
 * body 직계라 루트의 인라인 키컬러 변수를 못 받으므로 여기서 다시 심는다.
 */
export function createTocLayer(
  uid: string,
  accent: string,
  onPrimary: string,
  bgLight: string,
  bgDark: string,
): HTMLElement {
  const layer = document.createElement("div");
  layer.setAttribute("data-ms-landing-toc", uid);
  layer.className = "lnd lnd-toc-layer";
  layer.style.setProperty("--primary", accent);
  layer.style.setProperty("--on-primary", onPrimary);
  // 배경 키컬러도 심는다 — 이 레이어는 body 직계라 루트의 인라인 변수를 상속받지 못한다.
  // 목차 글자색은 지금 보이는 섹션의 모드를 따라가는데(attachTocSpy), 그 파생이 이 둘을 쓴다.
  layer.style.setProperty("--bg-light", bgLight);
  layer.style.setProperty("--bg-dark", bgDark);
  document.body.appendChild(layer);
  return layer;
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
