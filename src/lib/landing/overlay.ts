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

const LAYER_ATTR = "data-ms-landing-layer";

/**
 * 스크롤 잠금은 **문서 하나에 카운트 하나**여야 한다. 한 아임웹 사이트에 랜딩 임베드와
 * 홈페이지 임베드가 같이 붙을 수 있고, 각자 카운트를 들면 서로 파괴적으로 끼어들어
 * 파트너 사이트가 영영 스크롤되지 않는다(src/lib/dom/scroll-lock.ts 머리말).
 * 그래서 구현을 공용 모듈로 옮기고 여기서는 그대로 다시 내보낸다 — 소비처의 import
 * 경로는 바뀌지 않는다.
 */
export { lockScroll, unlockScroll } from "@/lib/dom/scroll-lock";

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
