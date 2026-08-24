/**
 * Shadow 껍데기 — 파트너 문서 안에 **우리 경계**를 세운다.
 *
 * ── 구조 ──────────────────────────────────────────────────────────────
 *   파트너 컨테이너(스니펫이 지목한 그들의 요소)   ← 절대 스타일도 속성도 안 건드린다
 *   └── <mach-expo-section data-msx-host="1" lang="ko" style="…리셋…">
 *       └── #shadow-root (open)
 *           ├── <style data-msx-sheet>        ← 폴백 경로에서만
 *           └── <div class="msx-root" dir="ltr" data-msx-ready="0" style="--msx-*">
 *
 * ── 왜 컨테이너에 직접 attachShadow 하지 않나 ─────────────────────────
 * ① 그 요소에 이미 누가 Shadow 를 붙였으면 `attachShadow` 가 던진다.
 * ② 그 컨테이너의 폭·배치는 **사이트 주인이 정한 계약**이다(아임웹 코드블럭이 테마 래퍼
 *    안에 앉는다). 우리가 손대면 그 계약을 깬다.
 * ③ 우리 호스트는 런타임에 JS 가 만든다 — 붙여넣는 스니펫 마크업에는 없으므로 아임웹의
 *    HTML 살균기를 통과할 걱정이 없다.
 *
 * ── 왜 태그 이름이 `mach-expo-section` 인가 ───────────────────────────
 * 하이픈이 든 커스텀 요소 모양 이름이면 유효한 Shadow 호스트다. 그리고 이 선택 하나로
 * 파트너 테마의 **타입 선택자**가 위협 모델에서 전부 사라진다 — 아임웹 테마는
 * `div{…}`·`section{…}`·`.editor_area p{…}` 로 가득하다. class·id 를 안 붙이므로
 * 남는 것은 `*` 규칙과 상속뿐이고, 그게 정확히 인라인 리셋이 막는 것이다.
 * (등록하지 않은 커스텀 요소는 그냥 HTMLElement 다. display 는 우리가 못 박는다.)
 */
import { clearNode } from "@/lib/dom/h";
import { expoThemeVars } from "@/lib/expo/css";
import { ensureExpoFont } from "@/lib/expo/font";
import { EXPO_HOST_RESET_CSS } from "@/lib/expo/host-reset";
import { ensureExpoStyles, type ExpoStyleMode } from "@/lib/expo/sheet";
import type { ExpoTheme } from "@/lib/expo/types";

export const EXPO_MOUNT_REGISTRY_KEY = "__MACH_EXPO_MOUNTS_V1__";
export const EXPO_HOST_TAG = "mach-expo-section";
export const EXPO_HOST_MARK = "data-msx-host";
export const EXPO_RENDER_ROOT_CLASS = "msx-root";

type MountHost = { [EXPO_MOUNT_REGISTRY_KEY]?: WeakMap<Element, ExpoShellHandle> };

/**
 * 컨테이너를 열쇠로 쓴다 — 호스트가 아니다. 컨테이너는 스니펫이 준 **안정된 신원**이고,
 * 호스트는 우리가 다시 만들 수 있는 것이다. `WeakMap` 이라 파트너 SPA 가 컨테이너를
 * 버려도 떼어진 트리가 쌓이지 않는다.
 */
function registry(host?: MountHost): WeakMap<Element, ExpoShellHandle> {
  const target = host ?? (globalThis as unknown as MountHost);
  return (target[EXPO_MOUNT_REGISTRY_KEY] = target[EXPO_MOUNT_REGISTRY_KEY] ?? new WeakMap());
}

export function findExpoShell(container: Element, host?: MountHost): ExpoShellHandle | null {
  return registry(host).get(container) ?? null;
}

function warn(message: string, error?: unknown): void {
  try {
    if (typeof console !== "undefined" && console.warn) console.warn("[mach expo] " + message, error ?? "");
  } catch {
    /* 호스트 콘솔이 막혀 있어도 진행 */
  }
}

export interface ExpoShellOptions {
  container: HTMLElement;
  pageId: string;
  /** 섹션 단독 임베드면 그 sid. 페이지 통짜면 생략. */
  sectionId?: string | null;
  theme: ExpoTheme;
  /** 서체를 받아 올 절대 주소 — 서버 payload 에서 온다. */
  origin: string;
  /** 테스트에서 문서를 갈아 끼운다(font.ts·form-bridge.ts 관례). */
  doc?: Document;
}

export interface ExpoShellHandle {
  readonly host: HTMLElement;
  readonly root: ShadowRoot;
  readonly renderRoot: HTMLElement;
  readonly styleMode: ExpoStyleMode;
  /** 이 껍데기가 사는 동안 유효한 신호 — 리스너는 전부 `{ signal }` 로 건다. */
  readonly signal: AbortSignal;
  /** 콘텐츠를 다 넣은 뒤 보이게 한다. 두 번 불러도 안전. */
  ready(): void;
  /** 색만 바꾼다 — 미리보기가 쓰기 없이 테마를 미리 보여 줄 때 쓴다. */
  applyTheme(theme: ExpoTheme): void;
  /** 재진입 — 정리를 먼저 돌리고 렌더 루트를 비운다. */
  reset(theme?: ExpoTheme): void;
  /** 정리 등록. **역순으로** 실행된다. */
  addCleanup(fn: () => void): void;
  destroy(): void;
}

/** 리셋을 **넣기 전에** 바른다 — 안 그러면 첫 레이아웃 한 번을 파트너 규칙으로 맞는다. */
function createHost(doc: Document, pageId: string, sectionId?: string | null): HTMLElement {
  const host = doc.createElement(EXPO_HOST_TAG);
  host.setAttribute(EXPO_HOST_MARK, "1");
  host.setAttribute("data-msx-page", pageId);
  if (sectionId) host.setAttribute("data-msx-section", sectionId);
  /**
   * `lang` 은 속성이라 `all:initial` 이 되돌릴 수 없고, Shadow 경계를 넘어 상속된다.
   * `<html lang="en">` 인 파트너 페이지에서 이게 없으면 한글이 라틴 우선 폰트 폴백과
   * 라틴 줄바꿈 규칙을 받는다.
   */
  host.setAttribute("lang", "ko");
  // 크롬 자동번역이 우리가 참조를 들고 있는 텍스트 노드를 갈아치우지 않게.
  host.setAttribute("translate", "no");
  host.setAttribute("style", EXPO_HOST_RESET_CSS);
  return host;
}

function createRenderRoot(doc: Document): HTMLElement {
  const el = doc.createElement("div");
  el.className = EXPO_RENDER_ROOT_CLASS;
  /**
   * `dir` 도 속성이다 — 어떤 파트너 CSS 로도 못 덮고, 안에 마운트되는 폼 런타임의
   * 기본 정렬과 `:dir()` 을 결정한다. 시트의 `direction:ltr` 과 이중으로 둔다.
   */
  el.setAttribute("dir", "ltr");
  // 콘텐츠가 다 들어가기 전에는 감춘다 — 스타일 없는 한 프레임이 번쩍이지 않게.
  el.setAttribute("data-msx-ready", "0");
  return el;
}

function applyTokens(renderRoot: HTMLElement, theme: ExpoTheme): void {
  /**
   * 토큰은 **렌더 루트에** 인라인으로 얹는다. 호스트에 얹으면 시트가 `.msx-root` 에
   * 선언해 둔 같은 이름의 기본값에 가려 **조용히 안 먹는다** — 선언값이 상속값을 항상
   * 이기기 때문이다. 그러면 모든 사이트가 기본 남색으로 그려지는데
   * `expoThemeVars()` 는 맞는 값을 돌려주고 단위 테스트도 다 통과한다.
   *
   * `setAttribute("style", ...)` 이 아니라 `setProperty` 다 — 전자는 렌더 루트에 있는
   * 다른 인라인 값을 지운다.
   */
  for (const [key, value] of Object.entries(expoThemeVars(theme))) {
    renderRoot.style.setProperty(key, value);
  }
}

/**
 * 껍데기를 세운다. 콘텐츠는 호출부가 `renderRoot` 에 넣고 `ready()` 를 부른다.
 *
 * **던지지 않는다.** 못 세우면 `null` 이다 — 파트너가 우리를 동기적으로 부르는 경우
 * 예외가 그들의 남은 초기화 코드를 중단시킨다.
 */
export function mountExpoShell(options: ExpoShellOptions): ExpoShellHandle | null {
  const doc = options.doc ?? (typeof document !== "undefined" ? document : null);
  if (!doc) return null;
  const { container, pageId, theme } = options;
  const sectionId = options.sectionId ?? null;

  // 떼어진 컨테이너에 붙이면 아무도 못 찾는 보이지 않는 구획이 생긴다.
  if (!container || !container.isConnected) return null;

  const view = doc.defaultView as (Window & typeof globalThis) | null;
  if (!view) return null;

  try {
    const previous = findExpoShell(container);
    if (previous) {
      const sameTarget = previous.host.getAttribute("data-msx-section") === (sectionId ?? null);
      if (previous.host.isConnected && sameTarget) {
        // 재진입 — 같은 자리를 다시 쓴다. 시트도 폰트도 다시 받지 않는다.
        previous.reset(theme);
        return previous;
      }
      // 대상이 달라졌으면 통째로 버린다 — 옛 design 속성이 남으면 섞인 화면이 된다.
      previous.destroy();
    }

    /**
     * 등록부가 없어도 지난 로드의 호스트가 남아 있을 수 있다(다른 번들이 만든 것).
     * 그걸 새로 만들면 컨테이너 안에 호스트가 둘이 된다.
     */
    const adopted = container.querySelector<HTMLElement>(`${EXPO_HOST_TAG}[${EXPO_HOST_MARK}]`);
    const host = adopted ?? createHost(doc, pageId, sectionId);
    // 파트너 스크립트가 그 사이 style 을 지웠거나 고쳤을 수 있다 — 무조건 다시 바른다.
    host.setAttribute("style", EXPO_HOST_RESET_CSS);
    if (!adopted) container.appendChild(host);

    // **맨손 attachShadow 를 절대 쓰지 않는다** — 두 번째 호출은 던진다.
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open", delegatesFocus: false });

    /**
     * 시트를 **렌더 루트보다 먼저** 붙인다. `[data-msx-ready="0"]{visibility:hidden}`
     * 게이트는 시트가 살아 있어야 동작한다 — 순서가 바뀌면 느린 파트너 페이지에서
     * 스타일 없는 전폭 16px 콘텐츠가 한 프레임 보인다.
     */
    const styleMode = ensureExpoStyles(root, view);

    const renderRoot = root.querySelector<HTMLElement>("." + EXPO_RENDER_ROOT_CLASS)
      ?? createRenderRoot(doc);
    applyTokens(renderRoot, theme);
    if (!renderRoot.parentNode) root.appendChild(renderRoot);

    /**
     * 서체는 **기다리지 않는다.** 문서 전역 약속이고 최대 4초까지 걸린다 — 기다리면
     * 느린 회선에서 구획이 4초간 감춰진 채 남는다. `display:swap` 과 폴백 스택이 덮는다.
     */
    void ensureExpoFont(options.origin);

    const controller = new AbortController();
    const cleanups: Array<() => void> = [];
    let destroyed = false;

    const runCleanups = () => {
      /**
       * **역순**이다. 포털은 보통 마지막에 열리므로 역순이면 가장 먼저 닫힌다 —
       * 그게 중요하다. 포털을 안 닫고 떠나면 파트너의 `<body>` 가
       * `position:fixed; top:-1234px` 로 남아 **그들의 사이트 전체가 스크롤되지 않는다.**
       */
      while (cleanups.length > 0) {
        const fn = cleanups.pop()!;
        try {
          fn();
        } catch (error) {
          warn("정리 중 오류", error);
        }
      }
    };

    const handle: ExpoShellHandle = {
      host,
      root,
      renderRoot,
      styleMode,
      signal: controller.signal,

      ready() {
        renderRoot.setAttribute("data-msx-ready", "1");
      },

      applyTheme(next: ExpoTheme) {
        applyTokens(renderRoot, next);
      },

      reset(nextTheme?: ExpoTheme) {
        /**
         * 파트너 스크립트가 그 사이 `style` 을 지웠거나 고쳤을 수 있다. 재진입은
         * 호스트가 위젯을 다시 그린 뒤에 오는 것이 보통이라, 그 확률이 낮지 않다.
         * 무조건 다시 바른다 — 덧붙이지 않고 **덮어쓴다**.
         */
        host.setAttribute("style", EXPO_HOST_RESET_CSS);
        /**
         * 정리를 **비우기보다 먼저** 돌린다.
         *
         * `attachExpoForm` 은 특정 컨테이너 요소에 자리를 예약해 뒀다. DOM 을 먼저
         * 비우면, 날아오던 `/f/{sourceId}` 스크립트가 도착해 예약을 찾고 → 컨테이너가
         * 떼어진 것을 보고 → 예약을 지우고 → **문서 탐색 경로로 떨어진다.** 그러면
         * 폼이 다른 섹션이나 라이브 등록 자리에 앉는다(중복 제출).
         */
        runCleanups();
        clearNode(renderRoot);
        renderRoot.setAttribute("data-msx-ready", "0");
        applyTokens(renderRoot, nextTheme ?? theme);
      },

      addCleanup(fn: () => void) {
        cleanups.push(fn);
      },

      destroy() {
        // 호스트가 두 번 부른다.
        if (destroyed) return;
        destroyed = true;
        try {
          // 시트가 아직 붙어 있는 동안 감춘다 — 눈앞에서 해체되는 걸 보이지 않게.
          renderRoot.setAttribute("data-msx-ready", "0");
          runCleanups();
          controller.abort();
          clearNode(renderRoot);
          /**
           * ShadowRoot 는 떼어낼 수 없다 — 호스트를 지우는 것이 유일한 방법이다.
           * 파트너 컨테이너는 지우지도, 청소하지도 않는다.
           */
          host.remove();
        } catch (error) {
          warn("정리 실패", error);
        } finally {
          registry().delete(container);
        }
        /**
         * 공용 시트와 폰트 약속은 **놓지 않는다.** 둘 다 이 문서의 다른 섹션들과
         * 공유하는 문서 단위 단일체다 — 한 섹션이 치우면 다음 마운트가 8KB 를 다시
         * 파싱하고 폰트를 다시 받는다.
         */
      },
    };

    registry().set(container, handle);
    return handle;
  } catch (error) {
    warn("껍데기를 세우지 못했어요", error);
    return null;
  }
}
