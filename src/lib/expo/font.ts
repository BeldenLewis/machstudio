/**
 * 서체 등록 — **문서마다 딱 한 번**.
 *
 * ── 왜 @font-face 가 아니라 FontFace API 인가 ─────────────────────────
 * 우리 스타일은 Shadow 안에만 있어야 하는데, `@font-face` 는 **문서 전역 규칙**이라
 * Shadow 안에 써도 무시되거나(구현에 따라) 문서로 새어 나간다. 그래서 시트에는
 * `@font-face` 를 한 줄도 두지 않고, 여기서 `document.fonts` 에 직접 등록한다.
 * (정적 테스트가 시트의 `@font-face` 를 막는다.)
 *
 * ── 왜 window 에 매다나 ───────────────────────────────────────────────
 * 한 페이지에 우리 섹션이 여러 개 박힐 수 있고, 각각은 **따로 번들된 IIFE** 가 실행한다.
 * 모듈 지역 변수로 캐시하면 번들마다 따로 잡혀 같은 폰트를 네다섯 번 받는다.
 * 그래서 창에 매단다 — 그게 이 파일들이 공유하는 유일한 공간이다.
 *
 * ── 실패해도 화면은 나온다 ────────────────────────────────────────────
 * 폰트가 못 오면 대체 서체로 그린다. 폰트를 기다리느라 콘텐츠를 숨기지 않는다 —
 * 파트너 사이트에서 우리 영역만 영영 빈 채로 남는 게 최악이다. 대신 상태를 `failed` 로
 * 돌려주어 런타임이 진단에 쓴다.
 */
import { EXPO_FONT_FAMILY, EXPO_FONT_PATH } from "@/lib/expo/css";

export const EXPO_FONT_REGISTRY_KEY = "__MACH_EXPO_FONT_V1__";

/** 가변 폰트라 굵기 범위를 한 번에 등록한다. */
const FONT_WEIGHT = "400 900";

/** 넘기면 대체 서체로 간다. 네트워크가 멎어도 화면이 멎지 않게. */
const DEFAULT_TIMEOUT_MS = 4000;

export type ExpoFontStatus =
  /** 등록됐다. */
  | "ready"
  /** 못 받았거나 시간이 지났다 — 대체 서체로 그린다. */
  | "failed"
  /** 이 브라우저에 FontFace API 가 없다 — 대체 서체로 그린다. */
  | "unsupported"
  /** 서버가 준 주소가 절대 http(s) 가 아니다 — 아무것도 받지 않는다. */
  | "bad-origin";

interface FontHost {
  FontFace?: typeof FontFace;
  document?: Document;
  [EXPO_FONT_REGISTRY_KEY]?: Promise<ExpoFontStatus>;
}

/** 서버 payload 의 주소만 쓴다. `local()` 도 CDN 도 쓰지 않는다. */
function fontUrl(origin: string): string | null {
  try {
    const url = new URL(EXPO_FONT_PATH, origin);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    // 상대주소가 들어오면 `new URL` 이 던지거나 현재 문서 기준이 된다 — 둘 다 막는다.
    if (!/^https?:\/\//i.test(origin)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * 등록을 보장한다. 여러 번 불러도 **받는 것은 한 번**이다.
 * 실패한 결과도 캐시한다 — 실패를 반복하면 같은 요청이 섹션 수만큼 날아간다.
 */
export function ensureExpoFont(
  origin: string,
  options: { timeoutMs?: number; host?: FontHost } = {},
): Promise<ExpoFontStatus> {
  const host = options.host ?? (globalThis as unknown as FontHost);
  const cached = host[EXPO_FONT_REGISTRY_KEY];
  if (cached) return cached;

  const promise = load(origin, host, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  host[EXPO_FONT_REGISTRY_KEY] = promise;
  return promise;
}

async function load(origin: string, host: FontHost, timeoutMs: number): Promise<ExpoFontStatus> {
  const url = fontUrl(origin);
  if (!url) return "bad-origin";

  const FontFaceCtor = host.FontFace;
  const fonts = host.document?.fonts;
  if (typeof FontFaceCtor !== "function" || !fonts) return "unsupported";

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const face = new FontFaceCtor(EXPO_FONT_FAMILY, `url(${url}) format("woff2")`, {
      weight: FONT_WEIGHT,
      // 글자가 먼저 나오고 폰트가 뒤따른다 — 빈 화면보다 낫다.
      display: "swap",
    });

    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("font timeout")), timeoutMs);
    });

    const loaded = await Promise.race([face.load(), timeout]);
    // 등록은 로드가 실제로 끝난 뒤 한 번만. 시간이 지난 뒤 늦게 와도 여기 오지 않는다.
    fonts.add(loaded);
    return "ready";
  } catch {
    return "failed";
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 테스트·재진입 검증용 — 창에 매단 약속을 비운다. */
export function resetExpoFontRegistry(host?: FontHost): void {
  const target = host ?? (globalThis as unknown as FontHost);
  delete target[EXPO_FONT_REGISTRY_KEY];
}
