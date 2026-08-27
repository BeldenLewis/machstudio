/**
 * 편집기 ↔ 미리보기 프레임의 **좁은 통로**.
 *
 * 미리보기는 `/hp/{token}` 문서이고 편집기는 그걸 iframe 으로 띄운다. 둘은 같은
 * 오리진이지만, **그렇다고 아무 메시지나 받지 않는다** — 그 프레임 안에는 운영자가
 * 붙여넣은 코드가 실행되는 sandbox iframe 도 있고, 파트너 페이지에서 열릴 수도 있다.
 *
 * ── 들어오는 것을 받을 조건 (네 개 전부) ──────────────────────────────
 * ① `event.source === window.parent` — 정확히 부모여야 한다
 * ② `event.origin === parentOrigin`  — 서버가 정한 Mach 오리진과 정확히 같아야 한다
 * ③ `pageId` 가 지금 그리는 페이지    — 다른 페이지용 메시지를 적용하지 않는다
 * ④ `channel` 이 URL 로 받은 값        — 이 미리보기 세션의 것이어야 한다
 * 하나라도 어긋나면 조용히 버린다.
 *
 * ── 나가는 것 ─────────────────────────────────────────────────────────
 * 구획 선택과 "붙여넣은 코드가 떴다" 알림. `targetOrigin` 을 **정확히** 지정한다 —
 * `"*"` 로 보내면 미리보기가 남의 사이트 iframe 에 있을 때 그쪽이 내용을 읽는다.
 *
 * ── 라이브에서는 아예 붙지 않는다 ─────────────────────────────────────
 * 이 파일의 어떤 것도 라이브 임베드에서 동작해서는 안 된다. 호출부(mount.ts)가
 * `mode === "live"` 면 부르지 않는다.
 */
import { normalizeExpoTheme } from "@/lib/expo/config";
import type { ExpoTheme } from "@/lib/expo/types";

export const EXPO_PREVIEW_THEME_MESSAGE = "mach-expo-preview-theme";
export const EXPO_PREVIEW_SELECT_MESSAGE = "mach-expo-select-section";
export const EXPO_PREVIEW_CODE_READY_MESSAGE = "mach-expo-custom-code-ready";

export interface ExpoPreviewBridgeOptions {
  /** 편집기의 오리진. **서버가 정한 값**이고, 요청에서 유도하지 않는다. */
  parentOrigin: string;
  pageId: string;
  /** 미리보기 URL 이 준 채널. 되돌려 보낼 때 그대로 실어 준다. */
  channel: string;
  /** 테마 메시지가 통과했을 때 — **메모리에만** 적용한다(쓰기 없음). */
  onTheme(theme: ExpoTheme): void;
  win?: Window;
}

export interface ExpoPreviewBridgeHandle {
  /** 구획을 눌렀다고 알린다. */
  notifySelect(sid: string): void;
  /** 붙여넣은 코드 프레임이 떴다고 알린다 — 편집기가 그 후보에 대해서만 발행을 열어 준다. */
  notifyCustomCodeReady(codeDigest: string): void;
  destroy(): void;
}

export function attachExpoPreviewBridge(
  options: ExpoPreviewBridgeOptions,
): ExpoPreviewBridgeHandle | null {
  const win = options.win ?? (typeof window !== "undefined" ? window : null);
  if (!win) return null;

  const parent = win.parent;
  // 부모가 자기 자신이면 iframe 이 아니다 — 보낼 곳도 받을 곳도 없다.
  if (!parent || parent === win) return null;
  // 오리진이 절대 http(s) 가 아니면 `postMessage` 의 targetOrigin 으로 쓸 수 없다.
  if (!/^https?:\/\//i.test(options.parentOrigin)) return null;

  const controller = new AbortController();

  win.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== parent) return;
    if (event.origin !== options.parentOrigin) return;
    const data = event.data as { type?: unknown; pageId?: unknown; channel?: unknown; theme?: unknown } | null;
    if (!data || typeof data !== "object") return;
    if (data.type !== EXPO_PREVIEW_THEME_MESSAGE) return;
    if (data.pageId !== options.pageId) return;
    if (data.channel !== options.channel) return;
    // 정규화를 거친 값만 적용한다 — 편집기가 보낸 문자열을 그대로 CSS 에 넣지 않는다.
    options.onTheme(normalizeExpoTheme(data.theme));
  }, { signal: controller.signal });

  const send = (type: string, extra: Record<string, unknown>) => {
    try {
      parent.postMessage({ type, pageId: options.pageId, channel: options.channel, ...extra }, options.parentOrigin);
    } catch {
      // 부모가 사라졌거나 오리진이 안 맞는다 — 미리보기 편의 기능이므로 조용히 넘어간다.
    }
  };

  return {
    notifySelect(sid: string) {
      send(EXPO_PREVIEW_SELECT_MESSAGE, { sid });
    },
    notifyCustomCodeReady(codeDigest: string) {
      send(EXPO_PREVIEW_CODE_READY_MESSAGE, { codeDigest });
    },
    destroy() {
      controller.abort();
    },
  };
}
