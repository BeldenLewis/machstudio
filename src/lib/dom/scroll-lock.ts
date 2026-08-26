/**
 * `<body>` 스크롤 잠금 — **참조 카운트 하나를 문서 전체가 공유한다.**
 *
 * ── 왜 공유해야 하나 ──────────────────────────────────────────────────
 * 한 아임웹 사이트에 웨비나 랜딩 임베드와 홈페이지 임베드가 같이 붙을 수 있다. 각자
 * 자기 카운트를 들고 있으면 서로 파괴적으로 끼어든다:
 *   A 잠금 → 원래 style 저장 · B 잠금 → **A가 고친 style** 을 원본으로 저장
 *   A 해제 → 원래대로 복원 · B 해제 → `position:fixed` 를 **다시** 바름
 * 결과: 모달은 하나도 안 열려 있는데 파트너 사이트가 영영 스크롤되지 않는다.
 *
 * ── 그래서 열쇠 문자열을 바꾸지 않는다 ────────────────────────────────
 * 전역 키는 `"__machLandingScrollLock"` 그대로다. 이름이 랜딩에서 왔다는 이유로 고치면,
 * 두 버전의 번들이 한 페이지에 있는 동안 위 버그가 조용히 되살아난다.
 * **이 문자열은 계약이다.**
 */

const LOCK_STATE = "__machLandingScrollLock";

interface LockState {
  locks: number;
  savedStyle: string | null;
  savedY: number;
  hadModalOpen: boolean;
}

type WithLock = typeof globalThis & { [LOCK_STATE]?: LockState };

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

  // 실제 스크롤러가 body 인지 documentElement 인지는 호스트마다 다르다(아임웹은 body).
  // body{position:fixed;top:-y} 기법은 어느 쪽이든 동작한다.
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
  /**
   * 개별 속성을 되돌리지 않고 **원본 문자열을 통째로** 복원한다. 우리가 쓴 일곱 속성이
   * 잔재 없이 사라지는 것을 이 한 줄이 보장한다 — 잠금 전 상태와 바이트가 같다.
   *
   * **대가: 잠금 중에 호스트가 body 에 넣은 인라인 값도 함께 지워진다.** 앞 판의 주석은
   * "우리가 지운 것만 정확히 되돌아간다" 고 했는데 그건 속성별 복원의 설명이지 이 코드의
   * 설명이 아니었다(이 로직은 처음부터 통째 복원이었다 — `landing/overlay.ts` 머리말 참고).
   *
   * 그럼에도 통째 복원을 유지한다: 잃는 것은 모달이 열려 있던 동안(폼 작성 수십 초)의
   * 호스트 인라인 값이고, 막는 것은 **파트너 body 가 `position:fixed` 로 굳어 사이트 전체가
   * 영영 스크롤 안 되는 것**이다. 교환이 한쪽으로 명백하다.
   */
  if (state.savedStyle === null) body.removeAttribute("style");
  else body.setAttribute("style", state.savedStyle);
  if (!state.hadModalOpen) body.classList.remove("modal-open");
  document.documentElement.removeAttribute("data-ms-landing-modal");
  window.scrollTo(0, state.savedY);
}

/** 지금 잠겨 있는가 — 진단·테스트용. */
export function scrollLockDepth(): number {
  return (globalThis as WithLock)[LOCK_STATE]?.locks ?? 0;
}
