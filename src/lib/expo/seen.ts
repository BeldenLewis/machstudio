/**
 * "코드가 실제로 붙어 있다" 비콘.
 *
 * ── 무엇을 위한 값인가 ────────────────────────────────────────────────
 * 운영자는 아임웹 편집기에 스니펫을 붙여 넣고 나서 **그게 실제로 붙었는지 알 수 없다.**
 * 붙여넣기를 빠뜨렸는지, 엉뚱한 페이지에 넣었는지, 테마가 지웠는지 구분이 안 된다.
 * 이 비콘 하나로 어드민이 "확인됨" 배지를 보여 줄 수 있다.
 *
 * ── 프리플라이트를 만들지 않는 것이 전부다 ────────────────────────────
 * 이 저장소는 이걸로 실제 장애를 겪었다: 수집 스크립트가 `Blob`(application/json)으로
 * `sendBeacon` 을 불렀고, 그건 **안전 목록에 없는 Content-Type** 이라 프리플라이트가
 * 필요해진다. 프리플라이트는 credentials 모드와 `Allow-Origin: *` 조합에서 막히고,
 * 그래서 **콘솔을 직접 열어야만 보이는 조용한 실패**가 됐다(2026-08-24 수정).
 *
 * 그래서 여기서는:
 *  · JSON 을 **평문 문자열**로 만들어 `sendBeacon(url, string)` 에 넘긴다
 *    → `text/plain` 이라 CORS 단순 요청이고 프리플라이트가 없다.
 *  · `Blob` 을 쓰지 않는다. 커스텀 헤더를 **하나도** 붙이지 않는다.
 *  · 폴백 `fetch` 도 헤더 없이, `keepalive: true`, `credentials: "omit"` 로 보낸다.
 * 응답은 읽지 않는다 — 단순 요청이면 브라우저가 응답을 막아도 **서버에는 도착한다.**
 */

export interface ExpoSeenInput {
  /** 절대 주소 — 서버 payload 에서 온다. */
  origin: string;
  pageId: string;
  /** 구획 단독 임베드면 그 sid. */
  sectionId?: string | null;
}

interface SeenTransport {
  sendBeacon?: (url: string, data?: BodyInit | null) => boolean;
  fetch?: typeof fetch;
}

/**
 * 한 번만 보낸다. 재마운트마다 보내면 아임웹 재렌더가 잦은 사이트에서 같은 값이
 * 초당 여러 번 갱신된다 — 알려 주는 정보는 같고 쓰기만 늘어난다.
 */
export const EXPO_SEEN_REGISTRY_KEY = "__MACH_EXPO_SEEN_V1__";
type SeenHost = { [EXPO_SEEN_REGISTRY_KEY]?: Record<string, true> };

export function reportExpoSeen(
  input: ExpoSeenInput,
  options: { transport?: SeenTransport; host?: SeenHost } = {},
): boolean {
  const transport = options.transport ?? (typeof navigator !== "undefined"
    ? { sendBeacon: navigator.sendBeacon?.bind(navigator), fetch: globalThis.fetch }
    : {});
  const host = options.host ?? (globalThis as unknown as SeenHost);

  // 상대주소가 들어오면 파트너 도메인으로 쏜다 — 아무 데도 안 닿는다.
  if (!/^https?:\/\//i.test(input.origin)) return false;

  const key = `${input.pageId}:${input.sectionId ?? "page"}`;
  const sent = (host[EXPO_SEEN_REGISTRY_KEY] = host[EXPO_SEEN_REGISTRY_KEY] ?? {});
  if (sent[key]) return false;

  let url: string;
  try {
    url = new URL("/api/expo-embed/seen", input.origin).toString();
  } catch {
    return false;
  }

  // 평문 문자열. Blob 도, 헤더도 없다 — 그게 프리플라이트를 없애는 유일한 방법이다.
  const body = JSON.stringify({
    pageId: input.pageId,
    ...(input.sectionId ? { sectionId: input.sectionId } : {}),
  });

  sent[key] = true;
  try {
    if (transport.sendBeacon && transport.sendBeacon(url, body)) return true;
  } catch {
    /* 아래 폴백으로 */
  }
  try {
    // 헤더를 **주지 않는다**. 하나라도 붙이면 단순 요청이 아니게 된다.
    const pending = transport.fetch?.(url, { method: "POST", body, keepalive: true, credentials: "omit" });
    /**
     * 거절을 **반드시 삼킨다.** 비콘은 fire-and-forget 인데, 잡지 않은 거절은 파트너
     * 페이지의 콘솔에 "Unhandled Promise Rejection" 으로 뜬다 — 우리 진단 값 하나 때문에
     * 남의 사이트에 에러가 찍히면 안 되고, 그들의 에러 리포터에도 잡힌다.
     */
    if (pending && typeof pending.catch === "function") pending.catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/** 테스트용. */
export function resetExpoSeen(host?: SeenHost): void {
  const target = host ?? (globalThis as unknown as SeenHost);
  delete target[EXPO_SEEN_REGISTRY_KEY];
}
