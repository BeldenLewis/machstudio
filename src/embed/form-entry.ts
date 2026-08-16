/**
 * 등록 폼 임베드 진입점 — 외부 사이트(아임웹 등) 문서에서 실행된다 (설계 §17).
 *
 * 스니펫:
 *   <!-- 등록 폼 -->
 *   <script async src="https://machstudio.vercel.app/f/SOURCE_ID"></script>
 *   <div data-mach-form></div>
 *
 *   <!-- 등록 확인 (Find My QR) -->
 *   <script async src="https://machstudio.vercel.app/f/SOURCE_ID/check"></script>
 *   <div data-mach-form-check></div>
 *
 * 이 파일은 esbuild 로 IIFE 번들(globalName=__msForm)이 되고, /f/{id} 라우트가 번들 뒤에
 * `__msForm.boot({...})` 를 붙여 내려보낸다. **config 가 스크립트 본문에 실려 오므로**
 * 요청 1회로 최종 화면이 그려진다 — fetch 방식은 실측 10초 넘게 빈 화면이었다(랜딩의 교훈).
 */
import { mountCollectForm, type CollectFormHandle } from "@/lib/collect-form/mount";
import { mountCollectLookup, type LookupHandle } from "@/lib/collect-form/lookup-mount";
import { normalizeCollectForm } from "@/lib/collect-form-config";

export interface FormBootConfig {
  sourceId: string;
  origin: string;
  /** 저장된 formConfig 원본 — 정규화는 런타임이 한다(서버와 같은 함수). */
  formConfig: unknown;
  /** 서버 시각(ISO) — 접수 창 판정을 방문자 시계로 하지 않는다. */
  serverNow: string;
  /** 소스가 비활성이면 폼을 그리지 않는다. */
  active: boolean;
  /**
   * 무엇을 그리는가. `/f/{id}` 는 등록 폼, `/f/{id}/check` 는 등록 확인이다(설계 §17).
   * 한 번들에 둘 다 들어 있다 — 스타일·검증·DOM 빌더를 공유하고, 두 탭을 다 붙이는
   * 사이트에서 두 번째 스크립트는 캐시에서 온다.
   */
  view?: "form" | "check";
}

interface Instance {
  handle: CollectFormHandle | LookupHandle | null;
  mount: HTMLElement | null;
  cfg: FormBootConfig;
  observer: MutationObserver | null;
  remounts: number;
  remountWindowStart: number;
}

type Registry = Record<string, Instance>;
type WindowWithRegistry = Window & { __MACH_FORM__?: Registry };

function registry(): Registry {
  const w = window as WindowWithRegistry;
  return (w.__MACH_FORM__ = w.__MACH_FORM__ ?? {});
}

function warn(msg: string, e?: unknown): void {
  try {
    if (window.console && console.warn) console.warn("[mach form] " + msg, e ?? "");
  } catch {
    /* 호스트 콘솔이 막혀 있어도 진행 */
  }
}

/**
 * 마운트 지점 찾기.
 *
 * 소스 지정(`data-mach-form="ID"`) → 무지정(`data-mach-form`) → **스크립트 태그 자리**.
 * 마지막 폴백이 중요하다 — 붙이는 사람이 `<div>` 를 빠뜨리는 일이 실제로 잦고, 그러면
 * "스크립트는 넣었는데 아무것도 안 나온다" 가 된다(설계 §17 "마운트 <div> 가 없으면
 * 스크립트 태그 위치에 자동 마운트").
 */
function findMount(sourceId: string, view: "form" | "check"): HTMLElement | null {
  // 등록 폼과 등록 확인은 **다른 마운트 속성**을 쓴다 — 한 페이지에 둘 다 붙는 경우가
  // 기본이고(등록 탭 + Registration Check 탭), 같은 속성이면 서로의 자리를 뺏는다.
  const attr = view === "check" ? "data-mach-form-check" : "data-mach-form";

  const exact = document.querySelector<HTMLElement>(
    "[" + attr + '="' + CSS.escape(sourceId) + '"]',
  );
  if (exact) return exact;

  const all = document.querySelectorAll<HTMLElement>("[" + attr + "]");
  for (let i = 0; i < all.length; i++) {
    // 다른 소스에 이미 잡힌 자리는 건너뛴다(한 페이지에 폼 2개를 붙일 수 있다).
    const claimed = all[i].getAttribute("data-mach-form-claimed");
    if (!claimed || claimed === sourceId) return all[i];
  }

  // 스크립트 태그 자리에 직접 만든다.
  const script = document.querySelector<HTMLScriptElement>(
    'script[src*="/f/' + sourceId + (view === "check" ? '/check' : '') + '"]',
  );
  if (script && script.parentNode) {
    const host = document.createElement("div");
    host.setAttribute(attr, sourceId);
    script.parentNode.insertBefore(host, script.nextSibling);
    return host;
  }
  return null;
}

/**
 * 아임웹 위젯 애니메이션이 마운트를 숨겨 둔 채로 두는 경우가 있다
 * (_widget_data.wg_animated → visibility:hidden). 폼이 통째로 안 보이는 사고라 풀어 준다.
 * 랜딩 로더가 같은 처리를 하고 있고, 같은 호스트에서 같은 이유로 필요하다.
 */
function unhideWidget(mount: HTMLElement): void {
  try {
    const wd = mount.closest ? (mount.closest("._widget_data") as HTMLElement | null) : null;
    if (!wd) return;
    wd.classList.add("_ds_animated_except");
    wd.classList.remove("wg_animated");
    wd.style.visibility = "visible";
    wd.style.opacity = "1";
  } catch (e) {
    warn("widget unhide 실패", e);
  }
}

function render(inst: Instance): void {
  const view = inst.cfg.view === "check" ? "check" : "form";
  const mount = findMount(inst.cfg.sourceId, view);
  if (!mount) {
    warn("마운트 지점을 찾지 못했습니다: " + inst.cfg.sourceId);
    return;
  }
  mount.setAttribute("data-mach-form-claimed", inst.cfg.sourceId);
  inst.mount = mount;
  unhideWidget(mount);

  if (!inst.cfg.active) {
    // 비활성 소스는 **조용히 아무것도 그리지 않는다**(설계 §17). 방문자에게 오류를 보이면
    // 전시가 취소된 것처럼 읽힌다 — 운영자만 알면 되는 상태다.
    warn("비활성 소스입니다: " + inst.cfg.sourceId);
    return;
  }

  inst.handle?.destroy();
  const config = normalizeCollectForm(inst.cfg.formConfig);
  inst.handle = view === "check"
    ? mountCollectLookup({ mount, config, origin: inst.cfg.origin, sourceId: inst.cfg.sourceId })
    : mountCollectForm({
        mount,
        config,
        origin: inst.cfg.origin,
        sourceId: inst.cfg.sourceId,
        serverNow: inst.cfg.serverNow,
        /**
         * 라우트가 SWR 을 짧게(60초) 잡아 두므로 남는 지연은 작고, 런타임에도 5분 넘게
         * 과거인 serverNow 를 버리는 가드가 있다. 스크립트 태그로는 응답 헤더(Age)를
         * 읽을 수 없어 여기서 보정할 방법이 없다 — 그 사실을 남겨 둔다.
         */
        ageMs: 0,
      });
}

/**
 * 호스트가 위젯을 다시 그리면 우리 폼이 지워진다. 복원된 HTML 안의 <script> 는 innerHTML
 * 경로라 재실행되지 않으므로 직접 감시해 다시 붙인다. 폭주 방지: 1분에 5회까지.
 *
 * **입력값은 잃는다** — 재마운트는 새 폼이다. 그래서 한도를 낮게 잡는다(무한 재마운트가
 * 타이핑 중인 사람의 입력을 계속 날리는 것보다 폼이 사라진 채 두는 편이 낫다).
 */
function watchForRerender(inst: Instance): void {
  if (typeof MutationObserver === "undefined") return;
  const target = inst.mount?.parentElement;
  if (!target) return;

  let timer: ReturnType<typeof setTimeout> | null = null;
  const observer = new MutationObserver(() => {
    const root = inst.mount && inst.mount.querySelector(".msf");
    if (root && document.contains(root)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const now = Date.now();
      if (now - inst.remountWindowStart > 60_000) {
        inst.remountWindowStart = now;
        inst.remounts = 0;
      }
      if (++inst.remounts > 5) {
        warn("재마운트 한도 초과 — 관측만 계속합니다");
        return;
      }
      render(inst);
    }, 200);
  });
  observer.observe(target, { childList: true });
  inst.observer = observer;
}

export function boot(cfg: FormBootConfig): void {
  try {
    const reg = registry();
    // 같은 소스라도 폼과 등록 확인은 별개 인스턴스다 — 한 키를 쓰면 나중에 부트된 쪽이
    // 앞의 것을 destroy 해 버린다(둘 다 붙은 페이지가 기본 구성이다).
    const key = cfg.sourceId + ":" + (cfg.view === "check" ? "check" : "form");
    const prev = reg[key];
    if (prev) {
      // 재진입은 조기 return 이 아니라 재마운트 — 호스트 재렌더 후 스크립트가 다시 돌 수 있다.
      prev.cfg = cfg;
      render(prev);
      return;
    }
    const inst: Instance = {
      handle: null,
      mount: null,
      cfg,
      observer: null,
      remounts: 0,
      remountWindowStart: Date.now(),
    };
    reg[key] = inst;

    const start = () => {
      render(inst);
      watchForRerender(inst);
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  } catch (e) {
    // 호스트 페이지를 절대 깨뜨리지 않는다.
    warn("부트 실패", e);
  }
}
