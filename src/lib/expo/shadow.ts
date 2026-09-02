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

export interface ExpoShellStage {
  shell: ExpoShellHandle;
  /** 문서 연결 뒤, 공개 전 실행할 lifecycle. */
  addAttach(fn: () => void): void;
  commit(): ExpoShellHandle;
  abort(): void;
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
function createShellHandle(options: ExpoShellOptions, host: HTMLElement): ExpoShellHandle {
  const doc = options.doc ?? document;
  const view = doc.defaultView as (Window & typeof globalThis) | null;
  if (!view) throw new Error("missing-window");
  const { container, theme } = options;

  host.setAttribute("style", EXPO_HOST_RESET_CSS);
  const root = host.shadowRoot ?? host.attachShadow({ mode: "open", delegatesFocus: false });
  const styleMode = ensureExpoStyles(root, view);
  const renderRoot = root.querySelector<HTMLElement>("." + EXPO_RENDER_ROOT_CLASS)
    ?? createRenderRoot(doc);
  applyTokens(renderRoot, theme);
  if (!renderRoot.parentNode) root.appendChild(renderRoot);

  const controller = new AbortController();
  const cleanups: Array<() => void> = [];
  let destroyed = false;

  const runCleanups = () => {
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
      host.setAttribute("style", EXPO_HOST_RESET_CSS);
      runCleanups();
      clearNode(renderRoot);
      renderRoot.setAttribute("data-msx-ready", "0");
      applyTokens(renderRoot, nextTheme ?? theme);
    },

    addCleanup(fn: () => void) {
      cleanups.push(fn);
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      try {
        renderRoot.setAttribute("data-msx-ready", "0");
      } catch (error) {
        warn("숨김 실패", error);
      }
      runCleanups();
      controller.abort();
      try {
        clearNode(renderRoot);
      } catch (error) {
        warn("내용 정리 실패", error);
      }
      try {
        host.remove();
      } catch (error) {
        warn("호스트 정리 실패", error);
      }
      // 미커밋 후보가 이전 shell의 등록을 지우면 실패 보존 계약이 깨진다.
      if (registry().get(container) === handle) registry().delete(container);
    },
  };
  return handle;
}

/** 기존 직접 호출 계약. 런타임 교체는 stageExpoShell을 사용한다. */
export function mountExpoShell(options: ExpoShellOptions): ExpoShellHandle | null {
  const doc = options.doc ?? (typeof document !== "undefined" ? document : null);
  if (!doc || !options.container?.isConnected || !doc.defaultView) return null;
  const { container, pageId, theme } = options;
  const sectionId = options.sectionId ?? null;
  let created: HTMLElement | null = null;

  try {
    const previous = findExpoShell(container);
    if (previous) {
      const sameTarget = previous.host.getAttribute("data-msx-section") === sectionId;
      if (previous.host.isConnected && sameTarget) {
        previous.reset(theme);
        return previous;
      }
      previous.destroy();
    }

    const adopted = container.querySelector<HTMLElement>(`${EXPO_HOST_TAG}[${EXPO_HOST_MARK}]`);
    const host = adopted ?? createHost(doc, pageId, sectionId);
    if (!adopted) {
      created = host;
      container.appendChild(host);
    }
    const handle = createShellHandle({ ...options, doc }, host);
    void ensureExpoFont(options.origin);
    registry().set(container, handle);
    return handle;
  } catch (error) {
    created?.remove();
    warn("껍데기를 세우지 못했어요", error);
    return null;
  }
}

const EXPO_STAGED_HOST_CSS = EXPO_HOST_RESET_CSS + [
  "position:absolute!important",
  "left:-100000px!important",
  "top:0!important",
  "width:1px!important",
  "height:1px!important",
  "overflow:hidden!important",
  "visibility:hidden!important",
  "pointer-events:none!important",
].join(";") + ";";

/** 새 shell을 분리 조립하고 lifecycle 성공 뒤에만 기존 shell과 교체한다. */
export function stageExpoShell(options: ExpoShellOptions): ExpoShellStage | null {
  const doc = options.doc ?? (typeof document !== "undefined" ? document : null);
  if (!doc || !options.container?.isConnected || !doc.defaultView) return null;
  const { container, pageId } = options;
  const sectionId = options.sectionId ?? null;
  const previous = findExpoShell(container);
  const orphan = previous ? null
    : container.querySelector<HTMLElement>(`${EXPO_HOST_TAG}[${EXPO_HOST_MARK}]`);
  const host = createHost(doc, pageId, sectionId);
  let shell: ExpoShellHandle;
  try {
    shell = createShellHandle({ ...options, doc }, host);
  } catch (error) {
    host.remove();
    warn("후보 껍데기를 세우지 못했어요", error);
    return null;
  }

  const attachments: Array<() => void> = [];
  let committed = false;
  let aborted = false;

  const abortCandidate = () => {
    if (committed || aborted) return;
    aborted = true;
    shell.destroy();
  };

  return {
    shell,

    addAttach(fn: () => void) {
      if (!committed && !aborted) attachments.push(fn);
    },

    commit() {
      if (committed) return shell;
      if (aborted) throw new Error("expo-stage-aborted");
      if (!container.isConnected) {
        abortCandidate();
        throw new Error("expo-container-detached");
      }

      const oldHost = previous?.host.parentElement === container ? previous.host : orphan;
      host.setAttribute("style", EXPO_STAGED_HOST_CSS);
      host.setAttribute("inert", "");
      host.setAttribute("aria-hidden", "true");
      if (oldHost) container.insertBefore(host, oldHost);
      else container.appendChild(host);

      try {
        for (const attach of attachments.splice(0)) attach();
        shell.ready();
        // 같은 동기 commit 안에서 공개·등록 교체·이전 정리를 끝내 paint 사이 공백을 없앤다.
        host.setAttribute("style", EXPO_HOST_RESET_CSS);
        host.removeAttribute("inert");
        host.removeAttribute("aria-hidden");
        registry().set(container, shell);
        committed = true;
        if (previous) previous.destroy();
        else orphan?.remove();
        void ensureExpoFont(options.origin);
        return shell;
      } catch (error) {
        abortCandidate();
        throw error;
      }
    },

    abort: abortCandidate,
  };
}
