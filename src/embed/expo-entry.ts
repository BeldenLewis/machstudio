/**
 * 홈페이지 임베드 진입점 — 파트너 사이트(아임웹 등) 문서에서 실행된다.
 *
 * 스니펫:
 *   <!-- 페이지 통짜 -->
 *   <script async src="https://machstudio.vercel.app/h/PAGE_ID"></script>
 *   <div data-mach-expo></div>
 *
 *   <!-- 구획 하나만 -->
 *   <script async src="https://machstudio.vercel.app/h/PAGE_ID/SECTION_ID"></script>
 *   <div data-mach-expo-section></div>
 *
 * 이 파일은 esbuild 로 IIFE 번들(globalName=__msExpo)이 되고, `/h/...` 라우트가 번들 뒤에
 * `__msExpo.boot({...})` 를 붙여 내려보낸다. **payload 가 스크립트 본문에 실려 오므로**
 * 요청 1회로 최종 화면이 그려진다 — fetch 방식은 실측 10초 넘게 빈 화면이었다.
 *
 * ── 생성물 순서에 대한 기록 ───────────────────────────────────────────
 * 설계 문서는 홈페이지를 **다섯 번째 제품 파이프라인**이라 부른다. 그런데 main 에는 이미
 * 생성 IIFE 가 다섯 개 있다(랜딩 · 폼 · 대회 신청 · 대회 투표 · 대회 결과). 그래서
 * 홈페이지는 **여섯 번째 생성물**이다. 두 숫자가 다른 것은 착오가 아니다.
 */
import { mountExpo, type ExpoMountHandle, type ExpoRuntimePayload } from "@/lib/expo/mount";

export type ExpoBootConfig = ExpoRuntimePayload;

interface Instance {
  handle: ExpoMountHandle | null;
  payload: ExpoBootConfig;
}

type Registry = Record<string, Instance>;
type WindowWithRegistry = Window & { __MACH_EXPO__?: Registry };

const REGISTRY_KEY = "__MACH_EXPO__";

function registry(): Registry {
  const w = window as WindowWithRegistry;
  return (w[REGISTRY_KEY] = w[REGISTRY_KEY] ?? {});
}

function warn(message: string, error?: unknown): void {
  try {
    if (window.console && console.warn) console.warn("[mach expo] " + message, error ?? "");
  } catch {
    /* 호스트 콘솔이 막혀 있어도 진행 */
  }
}

/**
 * 마운트 자리 찾기.
 *
 * 지정(`data-mach-expo="ID"`) → 무지정(`data-mach-expo`) → **스크립트 태그 자리**.
 * 마지막 폴백이 중요하다 — 붙이는 사람이 `<div>` 를 빠뜨리는 일이 실제로 잦고,
 * 그러면 "스크립트는 넣었는데 아무것도 안 나온다" 가 된다(폼 로더와 같은 규칙).
 */
function findContainer(payload: ExpoBootConfig, script: HTMLScriptElement | null): HTMLElement | null {
  const attr = payload.sectionId ? "data-mach-expo-section" : "data-mach-expo";
  const key = payload.sectionId ?? payload.pageId;

  const exact = document.querySelector<HTMLElement>(`[${attr}="${CSS.escape(key)}"]`);
  if (exact) return exact;

  const all = document.querySelectorAll<HTMLElement>(`[${attr}]`);
  for (let i = 0; i < all.length; i++) {
    // 다른 페이지·구획이 이미 잡은 자리는 건너뛴다(한 문서에 여러 개를 붙일 수 있다).
    const claimed = all[i].getAttribute("data-mach-expo-claimed");
    if (!claimed || claimed === key) return all[i];
  }

  if (script && script.parentNode) {
    const host = document.createElement("div");
    host.setAttribute(attr, key);
    script.parentNode.insertBefore(host, script.nextSibling);
    return host;
  }
  return null;
}

/**
 * 아임웹 위젯 애니메이션이 마운트를 숨겨 둔 채로 두는 경우가 있다
 * (`_widget_data.wg_animated` → visibility:hidden). 랜딩·폼 로더가 같은 처리를 하고 있고,
 * 같은 호스트에서 같은 이유로 필요하다.
 *
 * 호스트 리셋(`host-reset.ts`)이 **우리 호스트의** visibility 를 못 박지만, 그건 우리
 * 요소에만 해당한다 — 우리를 담은 **파트너의 래퍼**가 숨겨져 있으면 그 안이 다 안 보인다.
 */
function unhideWidget(container: HTMLElement): void {
  try {
    const widget = container.closest ? (container.closest("._widget_data") as HTMLElement | null) : null;
    if (!widget) return;
    widget.classList.add("_ds_animated_except");
    widget.classList.remove("wg_animated");
    widget.style.visibility = "visible";
    widget.style.opacity = "1";
  } catch (error) {
    warn("widget unhide 실패", error);
  }
}

/** 재진입에도 **안정된** 열쇠. 폼 예약 열쇠의 접두사도 이 값이다. */
function instanceKey(payload: ExpoBootConfig): string {
  return `${payload.pageId}:${payload.sectionId ?? "page"}`;
}

function render(instance: Instance, script: HTMLScriptElement | null): void {
  const container = findContainer(instance.payload, script);
  if (!container) {
    warn("마운트 자리를 찾지 못했습니다: " + instanceKey(instance.payload));
    return;
  }
  container.setAttribute("data-mach-expo-claimed", instance.payload.sectionId ?? instance.payload.pageId);
  unhideWidget(container);

  // `mountExpoShell` 이 같은 컨테이너의 재진입을 스스로 처리한다 — 여기서 먼저 지우지 않는다.
  instance.handle = mountExpo({ container, payload: instance.payload });
  if (!instance.handle) warn("마운트하지 못했습니다: " + instanceKey(instance.payload));
}

export function boot(payload: ExpoBootConfig, bootScript?: HTMLScriptElement | null): void {
  try {
    /**
     * `document.currentScript` 는 **동기 실행 중에만** 값이 있다. 아래 어디서든 await 나
     * setTimeout 을 한 번 거치면 null 이 된다 — 그래서 제일 먼저 읽는다.
     */
    const script = bootScript ?? (document.currentScript as HTMLScriptElement | null);

    const key = instanceKey(payload);
    const reg = registry();
    const previous = reg[key];
    if (previous) {
      // 재진입은 조기 return 이 아니라 재마운트 — 호스트 재렌더 후 스크립트가 다시 돌 수 있다.
      previous.payload = payload;
      render(previous, script);
      return;
    }

    const instance: Instance = { handle: null, payload };
    reg[key] = instance;

    const run = () => render(instance, script);
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
      run();
    }
  } catch (error) {
    // 호스트 페이지를 절대 깨뜨리지 않는다.
    warn("부트 실패", error);
  }
}

/** 붙인 것을 전부 되돌린다 — 어드민 미리보기가 다시 그릴 때 쓴다. */
export function destroy(payload: Pick<ExpoBootConfig, "pageId" | "sectionId">): void {
  try {
    const reg = registry();
    const key = instanceKey(payload as ExpoBootConfig);
    reg[key]?.handle?.destroy();
    delete reg[key];
  } catch (error) {
    warn("정리 실패", error);
  }
}
