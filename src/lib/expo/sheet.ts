/**
 * 스타일시트를 **문서당 한 벌**만 만든다.
 *
 * 한 페이지에 우리 섹션이 여러 개 박히고, 각각은 따로 번들된 IIFE 가 실행한다. 모듈
 * 지역 변수로 캐시하면 번들마다 따로 잡혀 같은 8KB 를 다섯 번 파싱한다 — 그래서 창에
 * 매단다(font.ts·target-registry.ts 와 같은 이유·같은 관례).
 *
 * ── 왜 문서 head 가 아닌가 ────────────────────────────────────────────
 * head 에 넣은 스타일은 **파트너 문서 전역 규칙**이다. 이 시트가 존재하는 이유가 바로
 * 그걸 막는 것이다. 그래서 시트는 각 ShadowRoot 안에만 들어간다.
 */
import { EXPO_SHELL_CSS } from "@/lib/expo/shell-css";

export const EXPO_SHEET_REGISTRY_KEY = "__MACH_EXPO_SHEET_V1__";
export const EXPO_SHEET_MARK = "data-msx-sheet";

type View = Window & typeof globalThis;
/** 실패(null)도 담는다 — 섹션마다 다시 시도하면 같은 실패를 N번 한다. */
interface SheetSlot { sheet: CSSStyleSheet | null }
type SheetHost = { [EXPO_SHEET_REGISTRY_KEY]?: SheetSlot };

export type ExpoStyleMode = "adopted" | "style-el" | "failed";

/**
 * 생성 가능한 시트를 **채택**할 수 있는가.
 *
 * `"adoptedStyleSheets" in root` 가 결정적이다. jsdom 29 는 `new CSSStyleSheet()` 와
 * `replaceSync()` 를 지원하지만 **`adoptedStyleSheets` 접근자가 없다** — 대입하면 조용히
 * expando 가 생긴다. 생성 가능성만 보고 판정하면 jsdom 에서 채택 경로를 타고
 * **스타일이 하나도 안 붙은 채 모든 테스트가 통과한다.**
 */
export function canAdoptStyleSheets(root: Document | ShadowRoot, view: View): boolean {
  return typeof view.CSSStyleSheet === "function"
    && typeof view.CSSStyleSheet.prototype?.replaceSync === "function"
    && "adoptedStyleSheets" in root;
}

/**
 * 이 문서용 공용 시트. 못 만들면 null 이고, 그 결과도 캐시한다.
 *
 * `new view.CSSStyleSheet()` 로 만든다 — **앰비언트 생성자를 쓰지 않는다.** 시트는 만든
 * realm 의 문서에 묶이므로, 부모 realm 의 시트를 같은 출처 iframe(어드민 미리보기)에
 * 채택하려 하면 대입에서 던지고 그 섹션은 스타일 없이 전폭으로 그려진다.
 */
export function sharedExpoSheet(view: View, host?: SheetHost): CSSStyleSheet | null {
  const target = host ?? (view as unknown as SheetHost);
  const cached = target[EXPO_SHEET_REGISTRY_KEY];
  if (cached) return cached.sheet;

  let sheet: CSSStyleSheet | null = null;
  try {
    sheet = new view.CSSStyleSheet();
    sheet.replaceSync(EXPO_SHELL_CSS);
  } catch {
    sheet = null;
  }
  target[EXPO_SHEET_REGISTRY_KEY] = { sheet };
  return sheet;
}

/**
 * 이 ShadowRoot 에 스타일을 붙인다. 여러 번 불러도 한 벌이다.
 *
 * 두 경로 다 실패하면 `"failed"` 를 돌려주고 **그래도 그린다** — 파트너 홈페이지에
 * 빈 구멍을 남기는 것보다 스타일 없이라도 읽히는 편이 낫다. 대신 그 모드에서는
 * `[data-msx-ready="0"]{visibility:hidden}` 게이트도 죽어 있으므로, 어떤 정확성도
 * 그 게이트에 기대서는 안 된다.
 */
export function ensureExpoStyles(root: ShadowRoot, view: View, host?: SheetHost): ExpoStyleMode {
  if (canAdoptStyleSheets(root, view)) {
    const sheet = sharedExpoSheet(view, host);
    if (sheet) {
      // 이미 있으면 다시 넣지 않는다 — 재진입이 공짜가 된다.
      let present = false;
      for (const s of root.adoptedStyleSheets) if (s === sheet) { present = true; break; }
      if (!present) {
        // **대입**한다. `.push()` 는 Chrome 73~98 의 얼린 배열에서 TypeError 를 던진다.
        root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      }
      return "adopted";
    }
  }

  // 폴백 — 이 루트 안의 <style>. 루트마다 한 번씩 파싱한다(그게 폴백의 값이다).
  try {
    if (root.querySelector("style[" + EXPO_SHEET_MARK + "]")) return "style-el";
    const doc = root.ownerDocument;
    const el = doc.createElement("style");
    el.setAttribute(EXPO_SHEET_MARK, "1");
    // 문자열 HTML 이 아니다 — 텍스트 노드로 넣는다.
    el.textContent = EXPO_SHELL_CSS;
    root.insertBefore(el, root.firstChild);
    return "style-el";
  } catch {
    return "failed";
  }
}

/** 테스트용 — 창에 매단 시트를 비운다. */
export function resetExpoSheetRegistry(host?: SheetHost): void {
  const target = host ?? (globalThis as unknown as SheetHost);
  delete target[EXPO_SHEET_REGISTRY_KEY];
}
