/**
 * 홈페이지 섹션 ↔ 등록 폼 런타임의 **다리**.
 *
 * ── 왜 그냥 폼을 그리지 않나 ──────────────────────────────────────────
 * 등록 폼은 이미 자기 런타임(`/f/{sourceId}`)이 있고, 검증·중복확인·QR·전환추적이 전부
 * 거기 들어 있다. 홈페이지가 그걸 다시 구현하면 두 벌이 갈라진다 — 한쪽만 고친 날
 * 파트너 사이트의 폼이 다른 규칙으로 돈다. 그래서 **같은 런타임을 불러다 쓴다.**
 *
 * ── 순서가 규칙이다 ───────────────────────────────────────────────────
 * ① 자리를 먼저 예약하고 ② 그 열쇠를 실은 스크립트를 문서 head 에 붙인다.
 * 반대로 하면 스크립트가 먼저 실행돼 예약을 못 찾고, 폼이 문서 탐색 경로로 떨어져
 * **엉뚱한 자리**(다른 섹션, 혹은 라이브 자리)에 앉는다.
 *
 * ── 스크립트를 Shadow 안에 넣지 않는다 ────────────────────────────────
 * ShadowRoot 안의 스크립트는 실행돼도 `document.currentScript` 가 null 이다. 그러면 열쇠를
 * 읽을 수 없어 같은 사고로 되돌아온다. 그리고 `type="module"` 도 안 된다 — 모듈 스크립트는
 * 실행 중에 `currentScript` 가 null 이다. **문서 head 의 클래식 스크립트**여야 한다.
 */
import {
  formTargetKey, registerFormTarget, unregisterFormTarget,
  type FormMountMode,
} from "@/lib/collect-form/target-registry";

export interface ExpoFormBridgeOptions {
  /** 어느 사전등록 소스인가. */
  sourceId: string;
  /** 등록 폼인가 등록 확인인가. 기본은 등록 폼. */
  view?: "form" | "check";
  /** 부작용을 내도 되는가. 미리보기면 저장·추적이 전부 꺼진다. */
  mode: FormMountMode;
  /** 폼이 들어갈 자리(Shadow 안). */
  container: HTMLElement;
  /** 스타일을 넣을 루트. 보통 그 섹션의 ShadowRoot. */
  styleRoot: Document | ShadowRoot;
  /** 스크립트를 받아 올 절대 주소 — 서버 payload 에서 온다. */
  origin: string;
  /** 같은 소스를 한 페이지에 두 번 놓을 수 있다(섹션 두 개, 폼 + 모달). */
  instanceKey: string;
  /** 테스트에서 문서를 갈아 끼운다. */
  doc?: Document;
}

export interface ExpoFormBridgeHandle {
  key: string;
  destroy(): void;
}

function scriptSrc(origin: string, sourceId: string, view: "form" | "check"): string | null {
  try {
    const path = `/f/${encodeURIComponent(sourceId)}${view === "check" ? "/check" : ""}`;
    const url = new URL(path, origin);
    // 상대주소가 들어오면 파트너 도메인에서 우리 스크립트를 찾는다 — 404 다.
    if (!/^https?:\/\//i.test(origin)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * 자리를 예약하고 폼 스크립트를 붙인다.
 * 실패해도 던지지 않는다 — 섹션 하나가 호스트 페이지를 깨뜨리면 안 된다.
 */
export function attachExpoForm(options: ExpoFormBridgeOptions): ExpoFormBridgeHandle | null {
  const doc = options.doc ?? (typeof document !== "undefined" ? document : null);
  if (!doc) return null;

  const view = options.view === "check" ? "check" : "form";
  const src = scriptSrc(options.origin, options.sourceId, view);
  if (!src) return null;

  const key = formTargetKey({
    sourceId: options.sourceId, view, mode: options.mode, instanceKey: options.instanceKey,
  });

  const controller = new AbortController();
  // ① 예약이 먼저다.
  registerFormTarget(key, {
    container: options.container,
    styleRoot: options.styleRoot,
    mode: options.mode,
    disposeSignal: controller.signal,
  });

  // ② 그 다음 스크립트.
  const script = doc.createElement("script");
  script.src = src;
  script.async = true;
  script.dataset.msFormTarget = key;

  // 다 쓴 태그는 치운다 — head 에 같은 스크립트가 쌓이면 무엇이 살아 있는지 알 수 없다.
  const drop = () => { script.remove(); };
  script.addEventListener("load", drop, { once: true });
  script.addEventListener("error", drop, { once: true });

  doc.head.appendChild(script);

  return {
    key,
    destroy() {
      // 예약을 먼저 끊는다 — 아직 실행 전인 스크립트가 죽은 자리에 붙지 않게.
      controller.abort();
      unregisterFormTarget(key);
      script.remove();
    },
  };
}
