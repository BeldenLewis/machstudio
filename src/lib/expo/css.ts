/**
 * 사이트 테마 → **렌더 루트에 얹는 색 토큰**.
 *
 * ── 왜 CSS 를 다시 만들지 않나 ────────────────────────────────────────
 * 스타일시트는 사이트마다 같다(`shell-css.ts`). 다른 것은 색뿐이라, 시트를 사이트 수만큼
 * 만드는 대신 **토큰만 인라인으로** 얹는다. 그래야 같은 문서 안의 여러 섹션이 하나의
 * `CSSStyleSheet` 를 공유하고, 브라우저가 파싱을 한 번만 한다.
 *
 * ── 색을 여기서 계산하지 않는다 ───────────────────────────────────────
 * 대비·글자색 판정은 `lib/color.ts` 한 벌만 쓴다. 이 파일은 그 결과를 CSS 속성 이름에
 * 붙이기만 한다 — 계산이 두 벌이 되면 같은 키컬러가 화면마다 다른 글자색을 받는다.
 */
import { onAccentColor, paperFor, withAlpha } from "@/lib/color";
import type { ExpoTheme } from "@/lib/expo/types";

/**
 * 서체 별칭. **의도적으로 이상한 이름**이다 — 파트너 사이트가 `Pretendard` 라는 이름으로
 * 자기 폰트를 이미 등록해 뒀을 수 있고, 그러면 우리 화면이 남의 파일을 쓰게 된다.
 */
export const EXPO_FONT_FAMILY = "__mach_expo_pretendard_v1";

/** 고정 버전. 경로에 버전이 들어가야 캐시를 1년으로 잡아도 안전하다. */
export const EXPO_FONT_VERSION = "v1.3.9";
export const EXPO_FONT_DIR = `/fonts/pretendard/${EXPO_FONT_VERSION}`;
export const EXPO_FONT_FILE = "PretendardVariable.woff2";
export const EXPO_FONT_PATH = `${EXPO_FONT_DIR}/${EXPO_FONT_FILE}`;

/** 보조 문구의 흐림 정도 — 한 곳에서만 정한다. */
const MUTED_ALPHA = 0.68;

/**
 * 런타임이 렌더 루트에 `style.setProperty` 로 얹을 값들.
 * 여기 없는 토큰(반경·그림자·서체)은 시트 안에 고정값으로 있다.
 */
export function expoThemeVars(theme: ExpoTheme): Record<string, string> {
  const text = paperFor(theme.lightBg);
  const darkText = paperFor(theme.darkBg);
  return {
    "--msx-accent": theme.accent,
    "--msx-on-accent": onAccentColor(theme.accent),
    "--msx-surface": theme.lightBg,
    "--msx-text": text,
    "--msx-muted": withAlpha(text, MUTED_ALPHA),
    "--msx-dark-bg": theme.darkBg,
    "--msx-dark-text": darkText,
    "--msx-dark-muted": withAlpha(darkText, MUTED_ALPHA),
  };
}

/** 같은 값을 문자열로 — 미리보기가 서버에서 HTML 을 직접 낼 때 쓴다. */
export function expoThemeVarsCss(theme: ExpoTheme): string {
  return Object.entries(expoThemeVars(theme))
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
}
