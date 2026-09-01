/**
 * 복구용 단일 HTML의 브라우저 진입점.
 *
 * live mount를 재사용하지 않는다. 그 경로에는 seen beacon, preview bridge, 원격 폰트,
 * 등록 폼, stored custom-code가 들어 있기 때문이다. 이 번들은 정적 managed section만
 * DOM API로 그리고, 이미지·영상 외에는 어떤 네트워크 부작용도 만들지 않는다.
 */
import { clearNode } from "@/lib/dom/h";
import { expoThemeVars } from "@/lib/expo/css";
import { renderStaticSectionResult } from "@/lib/expo/view-sections";
import type { StandaloneExpoRuntimePayload } from "@/lib/expo/types";

const ROOT_SELECTOR = "[data-mach-expo-standalone]";

function warn(error: unknown): void {
  try { console.warn("[mach expo standalone] 렌더 실패", error); } catch { /* 파일은 계속 읽힌다 */ }
}

function render(payload: StandaloneExpoRuntimePayload): void {
  const root = document.querySelector<HTMLElement>(ROOT_SELECTOR);
  if (!root) return;
  clearNode(root);
  root.classList.add("msx-root");
  root.setAttribute("dir", "ltr");
  root.setAttribute("lang", payload.locale || "ko");
  for (const [key, value] of Object.entries(expoThemeVars(payload.theme))) {
    root.style.setProperty(key, value);
  }

  const context = {
    locale: payload.locale || "ko",
    campaigns: new Map(payload.campaigns.map((row) => [row.id, row])),
    destinations: new Map(payload.destinations.map((row) => [row.id, row])),
    mode: "standalone" as const,
    reducedMotion: Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches),
    doc: document,
  };

  for (const section of payload.sections) {
    try {
      const output = renderStaticSectionResult(section, context);
      if (!output) continue;
      root.appendChild(output.node);
      output.attach?.();
    } catch (error) {
      warn(error);
    }
  }
  root.setAttribute("data-msx-ready", "1");
}

export function boot(payload: StandaloneExpoRuntimePayload): void {
  const run = () => {
    try { render(payload); } catch (error) { warn(error); }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
  else run();
}
