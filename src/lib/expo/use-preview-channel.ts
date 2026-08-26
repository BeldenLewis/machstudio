"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EXPO_PREVIEW_CODE_READY_MESSAGE,
  EXPO_PREVIEW_SELECT_MESSAGE,
  EXPO_PREVIEW_THEME_MESSAGE,
} from "@/lib/expo/preview-bridge";
import type { ExpoTheme } from "@/lib/expo/types";

/**
 * 미리보기 프레임과 이야기하는 **편집기 쪽 절반**.
 *
 * ── 왜 이 파일이 필요했나 ─────────────────────────────────────────────
 * `preview-bridge.ts` 는 프레임 안쪽에서 이미 완성돼 있었다 — 구획을 누르면 부모에게
 * 알리고, 붙여넣은 코드가 뜨면 알리고, 부모가 보낸 테마를 **리로드 없이** 반영한다.
 * 그런데 **받는 쪽이 어디에도 없었다.** 그래서 미리보기에서 구획을 눌러도 아무 일이
 * 일어나지 않았고, 색은 URL 을 바꿔 프레임을 통째로 다시 띄우는 방식으로만 볼 수 있었다.
 *
 * ── 받을 조건 (네 개 전부) ────────────────────────────────────────────
 * 프레임 쪽과 **같은 네 가지**를 반대 방향으로 확인한다:
 *  ① `event.source === iframe.contentWindow` — 정확히 그 프레임이어야 한다
 *  ② `event.origin === origin`               — 서버가 정한 오리진과 정확히 같아야 한다
 *  ③ `pageId` 가 지금 보고 있는 페이지
 *  ④ `channel` 이 이 프레임에 발급한 값
 * 하나라도 어긋나면 조용히 버린다. 미리보기 문서 안에는 **운영자가 붙여넣은 코드가 도는
 * sandbox iframe** 도 있다 — 그쪽이 부모에게 보내는 메시지를 우리 것으로 착각하면
 * 남이 준 코드가 편집기를 조작하게 된다.
 *
 * ── 채널은 프레임마다 새로 발급한다 ───────────────────────────────────
 * 페이지를 바꾸거나 프레임을 다시 띄우면 새 값이다. 그래야 앞 프레임이 뒤늦게 보낸
 * 메시지가 새 화면에 적용되지 않는다.
 */

export interface ExpoPreviewChannel {
  /** 미리보기 URL 에 실어 보낼 값. 이게 없으면 프레임이 통로를 아예 안 붙인다. */
  channel: string;
  /** 색을 **리로드 없이** 밀어 넣는다. 프레임이 메모리에만 반영한다(저장 없음). */
  pushTheme: (theme: ExpoTheme) => void;
}

export interface UseExpoPreviewChannelOptions {
  /** 지금 보고 있는 페이지. 다른 페이지용 메시지를 적용하지 않는다. */
  pageId: string | null;
  /**
   * 편집기와 미리보기가 공유하는 오리진. **서버가 정한 값**이고 브라우저에서 유도하지 않는다
   * — `window.location.origin` 을 쓰면 프리뷰 배포에서 프레임 쪽 판정과 어긋난다.
   */
  origin: string;
  frameRef: React.RefObject<HTMLIFrameElement | null>;
  /** 미리보기에서 구획을 눌렀다. */
  onSelectSection?: (sid: string) => void;
  /** 붙여넣은 코드가 실제로 떴다 — 그 지문에 대해서만. */
  onCustomCodeReady?: (codeDigest: string) => void;
}

export function useExpoPreviewChannel({
  pageId, origin, frameRef, onSelectSection, onCustomCodeReady,
}: UseExpoPreviewChannelOptions): ExpoPreviewChannel {
  /**
   * 프레임마다 새 채널.
   *
   * `useMemo` 가 아니라 `useState` 인 이유: memo 는 React 가 버릴 수 있다. 이 값은
   * **미리보기 URL 에 이미 실려 나간 값과 같아야** 하므로, 한 번 정해지면 마운트 내내
   * 변하지 않는 것이 계약이다. 달라지는 순간 프레임이 보내는 메시지를 전부 버리게 된다.
   *
   * 페이지가 바뀌면 새 값이어야 하는데, 그건 **호출부가 `key={pageId}` 로 다시 마운트**해서
   * 얻는다(ExpoSiteEditor 의 PreviewPane). 그래야 앞 페이지의 프레임이 뒤늦게 보낸 메시지가
   * 새 화면에 적용되지 않는다.
   */
  const [channel] = useState(() => crypto.randomUUID());

  /** 핸들러는 ref 로 읽는다 — 의존성에 넣으면 리스너가 렌더마다 붙었다 떨어진다. */
  const handlers = useRef({ onSelectSection, onCustomCodeReady });
  useEffect(() => {
    handlers.current = { onSelectSection, onCustomCodeReady };
  }, [onSelectSection, onCustomCodeReady]);

  useEffect(() => {
    if (!pageId) return;
    const controller = new AbortController();

    window.addEventListener("message", (event: MessageEvent) => {
      const frame = frameRef.current;
      // ① 정확히 그 프레임. sandbox 안의 붙여넣은 코드가 보낸 것은 여기서 걸린다.
      if (!frame || event.source !== frame.contentWindow) return;
      // ② 서버가 정한 오리진.
      if (event.origin !== origin) return;

      const data = event.data as {
        type?: unknown; pageId?: unknown; channel?: unknown; sid?: unknown; codeDigest?: unknown;
      } | null;
      if (!data || typeof data !== "object") return;
      // ③④ 지금 페이지의, 이 프레임의 것.
      if (data.pageId !== pageId || data.channel !== channel) return;

      if (data.type === EXPO_PREVIEW_SELECT_MESSAGE && typeof data.sid === "string") {
        handlers.current.onSelectSection?.(data.sid);
        return;
      }
      if (data.type === EXPO_PREVIEW_CODE_READY_MESSAGE && typeof data.codeDigest === "string") {
        handlers.current.onCustomCodeReady?.(data.codeDigest);
      }
    }, { signal: controller.signal });

    return () => controller.abort();
  }, [pageId, origin, channel, frameRef]);

  /**
   * 색을 밀어 넣는다. **프레임을 다시 띄우지 않는다** — URL 로 넣으면 색 선택기를 끄는
   * 동안 초당 수십 번 프레임이 파괴·재생성되고 `/hp` 로 그만큼 요청이 나간다.
   */
  const pushTheme = useCallback((theme: ExpoTheme) => {
    const win = frameRef.current?.contentWindow;
    if (!win || !pageId) return;
    try {
      win.postMessage({ type: EXPO_PREVIEW_THEME_MESSAGE, pageId, channel, theme }, origin);
    } catch {
      // 프레임이 아직 안 떴거나 사라졌다 — 미리보기 편의 기능이라 조용히 넘어간다.
    }
  }, [frameRef, pageId, channel, origin]);

  return { channel, pushTheme };
}
