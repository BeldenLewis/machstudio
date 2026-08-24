/**
 * 홈페이지 임베드의 **부트와 수명**.
 *
 * ── 두 가지 크기 ──────────────────────────────────────────────────────
 * 페이지 통짜(`pageId:page`)와 섹션 단독(`pageId:{sid}`) — 조립 규칙은 같고 열쇠만
 * 다르다. 열쇠는 재진입에도 **안정**해야 한다: 파트너 사이트에 박힌 스니펫이 그 자리를
 * 다시 부를 때 같은 자리를 찾아야 하고, 폼 예약 열쇠의 접두사도 이 값이다.
 *
 * ── 절대 파트너 페이지를 깨지 않는다 ──────────────────────────────────
 * 어떤 실패도 던지지 않는다. 섹션 렌더러 하나가 던져도 **나머지는 보이고**
 * 준비 표시는 `finally` 에서 켜진다 — 안 그러면 그들 홈페이지에 영구히 빈 칸이 남는다.
 */
import { expoThemeVars } from "@/lib/expo/css";
import { mountExpoShell, type ExpoShellHandle } from "@/lib/expo/shadow";
import { renderExpoSections } from "@/lib/expo/view-page";
import { reportExpoSeen } from "@/lib/expo/seen";
import { attachExpoPreviewBridge } from "@/lib/expo/preview-bridge";
import type { PayloadSection } from "@/lib/expo/view-sections";
import type { FormMountMode } from "@/lib/collect-form/target-registry";
import type { ExpoTheme } from "@/lib/expo/types";

/** 로더가 스크립트 본문에 실어 보내는 것. */
export interface ExpoRuntimePayload {
  pageId: string;
  /** 섹션 단독 임베드면 그 sid. 페이지 통짜면 없다. */
  sectionId?: string | null;
  theme: ExpoTheme;
  /** 서체·폼 스크립트를 받아 올 절대 주소. 서버가 정한다. */
  origin: string;
  sections: PayloadSection[];
  /**
   * 발행은 됐지만 공개 스위치가 꺼져 있다 — **의도한 호스트만 확보하고 아무것도 안 그린다.**
   * 그래야 운영자가 전환일 전에 스니펫을 미리 붙여 두고 "붙었는지" 를 확인할 수 있다.
   */
  connectionOnly?: boolean;
  /** 부작용을 내도 되는가. 없으면 라이브다. */
  mode?: FormMountMode;
  preview?: {
    allowCustomCode?: boolean;
    /**
     * 편집기와 주고받을 통로. 서버가 정한 오리진과 URL 로 받은 채널이다.
     * **라이브에는 이 값이 없다** — 있어도 mode 가 live 면 붙지 않는다.
     */
    parentOrigin?: string;
    channel?: string;
    /** 붙여넣은 코드의 서버 계산 digest — 떴다고 알릴 때 그대로 되돌려 보낸다. */
    codeDigest?: string;
  };
}

export interface ExpoMountOptions {
  container: HTMLElement;
  payload: ExpoRuntimePayload;
  /** 미리보기 자리표의 "실행" 버튼이 부를 것. */
  onRequestCustomCodeRun?: () => void;
  doc?: Document;
}

export interface ExpoMountHandle {
  destroy(): void;
}

/** 1분에 다섯 번까지. 그 뒤로는 보기만 한다. */
const REMOUNT_LIMIT = 5;
const REMOUNT_WINDOW_MS = 60_000;
const REMOUNT_DEBOUNCE_MS = 200;

function warn(message: string, error?: unknown): void {
  try {
    if (typeof console !== "undefined" && console.warn) console.warn("[mach expo] " + message, error ?? "");
  } catch {
    /* 호스트 콘솔이 막혀 있어도 진행 */
  }
}

export function mountExpo(options: ExpoMountOptions): ExpoMountHandle | null {
  const doc = options.doc ?? (typeof document !== "undefined" ? document : null);
  if (!doc) return null;

  const { container, payload } = options;
  const mode: FormMountMode = payload.mode ?? "live";
  /**
   * 라이브는 자동으로 돈다. 미리보기는 운영자가 **그 세션에서 명시적으로 고른** 경우만 —
   * 미리보기를 열 때마다 남의 추적 스크립트가 발화하면 통계가 오염된다.
   */
  const allowCustomCode = mode === "live" ? true : payload.preview?.allowCustomCode === true;
  const instancePrefix = `${payload.pageId}:${payload.sectionId ?? "page"}`;

  let shell: ExpoShellHandle | null = null;
  let observer: MutationObserver | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let remounts = 0;
  let windowStart = 0;
  let capped = false;
  let destroyed = false;

  const build = (): boolean => {
    const next = mountExpoShell({
      container,
      pageId: payload.pageId,
      sectionId: payload.sectionId ?? null,
      theme: payload.theme,
      origin: payload.origin,
      doc,
    });
    if (!next) return false;
    shell = next;

    try {
      // 연결 확인 상태에서는 내용을 한 글자도 그리지 않는다.
      const list = payload.connectionOnly ? [] : (payload.sections ?? []);
      const output = renderExpoSections(list, {
        origin: payload.origin,
        mode,
        themeVars: expoThemeVars(payload.theme),
        styleRoot: next.root,
        instancePrefix,
        allowCustomCode,
        onRequestCustomCodeRun: options.onRequestCustomCodeRun,
        fallbackFocus: next.renderRoot,
        doc,
      });
      // 껍데기가 정리될 때 같이 정리된다 — 재진입의 reset() 도 이걸 돌린다.
      next.addCleanup(() => output.dispose());

      for (const node of output.nodes) next.renderRoot.appendChild(node);
      // 예약은 **붙은 뒤**다.
      output.attach();
    } catch (error) {
      warn("구획을 그리는 중 오류", error);
    } finally {
      /**
       * **항상** 켠다. 렌더러 하나가 던졌다고 감춰 두면 파트너 홈페이지에 영구히
       * 빈 칸이 남는다. rAF·IntersectionObserver 뒤로 미루지도 않는다 — 배경 탭에서는
       * 둘 다 안 돌아서 방문자가 탭을 볼 때까지 구획이 안 보인다.
       */
      next.ready();
    }

    /**
     * "코드가 실제로 붙었다" 를 한 번 알린다 — 운영자가 아임웹에 붙여 넣고 나서
     * 확인할 방법이 이것뿐이다. **미리보기에서는 절대 보내지 않는다**: 운영자가
     * 편집기를 열어 본 것이 "붙어 있음" 으로 기록되면 그 배지가 거짓이 된다.
     *
     * 내용이 없는 연결 확인 상태(발행됐지만 공개 스위치가 꺼짐)에서도 보낸다 —
     * 그게 이 값의 뜻이다: 붙어 있는지이지, 보이는지가 아니다.
     */
    if (mode === "live") {
      reportExpoSeen({ origin: payload.origin, pageId: payload.pageId, sectionId: payload.sectionId ?? null });
      return true;
    }

    /**
     * 미리보기 전용 통로. **라이브에서는 이 아래로 오지 않는다** — 구획 클릭이 편집기로
     * 새어 나가거나 부모가 색을 바꿀 수 있는 경로를 방문자 화면에 두지 않는다.
     */
    const parentOrigin = payload.preview?.parentOrigin;
    const channel = payload.preview?.channel;
    if (!parentOrigin || !channel) return true;

    const bridge = attachExpoPreviewBridge({
      parentOrigin,
      channel,
      pageId: payload.pageId,
      // 색만 바꾼다 — 저장하지 않는다.
      onTheme: (theme) => next.applyTheme(theme),
    });
    if (!bridge) return true;
    next.addCleanup(() => bridge.destroy());

    // 구획을 누르면 편집기가 그 구획으로 이동한다. 기본 동작은 막지 않는다.
    next.renderRoot.addEventListener("click", (event) => {
      const target = event.target as Element | null;
      const section = target?.closest?.(".msx-section") as HTMLElement | null;
      const sid = section?.getAttribute("data-msx-sid");
      if (sid) bridge.notifySelect(sid);
    }, { signal: next.signal });

    // 붙여넣은 코드를 실제로 실행한 경우에만 알린다 — 편집기가 그 후보에 대해서만 발행을 연다.
    if (allowCustomCode && payload.preview?.codeDigest) {
      bridge.notifyCustomCodeReady(payload.preview.codeDigest);
    }
    return true;
  };

  if (!build()) return null;

  /**
   * 호스트가 위젯을 다시 그리면 우리 호스트가 사라진다. 복원된 HTML 안의 `<script>` 는
   * innerHTML 경로라 재실행되지 않으므로 직접 감시해 다시 붙인다.
   *
   * 생존 판정은 **`host.isConnected`** 다. `document.contains` 는 Shadow 를 못 봐서
   * 우리 콘텐츠에 대해 **항상 false** 이고, 그걸 쓰면 재마운트가 끝없이 돌며 방문자가
   * 타이핑 중인 입력을 계속 날린다(폼 런타임이 실제로 겪은 버그다).
   */
  const target = container.parentElement;
  const view = doc.defaultView;
  if (target && view && typeof view.MutationObserver === "function") {
    windowStart = 0;
    observer = new view.MutationObserver(() => {
      if (destroyed) return;
      if (shell && shell.host.isConnected) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (destroyed) return;
        if (shell && shell.host.isConnected) return;
        // 컨테이너까지 사라졌으면 붙일 자리가 없다 — 관측만 계속한다.
        if (!container.isConnected) return;

        const now = performance.now();
        if (now - windowStart > REMOUNT_WINDOW_MS) {
          windowStart = now;
          remounts = 0;
          capped = false;
        }
        if (++remounts > REMOUNT_LIMIT) {
          if (!capped) {
            capped = true;
            warn("재마운트 한도 초과 — 관측만 계속합니다");
          }
          return;
        }
        build();
      }, REMOUNT_DEBOUNCE_MS);
    });
    observer.observe(target, { childList: true });
  }

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (timer) clearTimeout(timer);
      observer?.disconnect();
      observer = null;
      // 껍데기가 등록된 정리(모달·폼·iframe)를 역순으로 돌린 뒤 호스트를 지운다.
      shell?.destroy();
      shell = null;
    },
  };
}
