/**
 * 운영자가 **붙여넣은 코드**를 격리해서 실행한다.
 *
 * ── 왜 iframe 인가 ────────────────────────────────────────────────────
 * 이 코드는 우리가 쓴 것도, 검사한 것도 아니다. 지도 위젯·유튜브·뉴스레터 폼·통계
 * 스크립트가 들어온다. 그대로 우리 Shadow 안에 넣으면 **파트너 도메인의 스크립트**로
 * 실행되어 그 페이지의 쿠키와 DOM 에 전부 닿는다. 그래서 `sandbox` iframe 에 가둔다.
 *
 * `allow-same-origin` 을 **주지 않는다.** 주면 프레임이 부모와 같은 출처가 되어
 * `parent.document` 로 파트너 페이지를 마음대로 읽고 고칠 수 있다 — 격리가 사라진다.
 * `allow-scripts` 와 `allow-same-origin` 을 같이 주는 것이 이 API 의 대표적 오용이다.
 *
 * `allow-popups`·`allow-forms` 는 준다. 붙여넣는 것의 절반이 새 탭으로 여는 링크이거나
 * 폼(뉴스레터 구독)이고, 그것까지 막으면 기능이 아니라 고장으로 보인다.
 *
 * ── 이 파일이 `innerHTML` 금지의 유일한 예외다 ────────────────────────
 * `iframe.srcdoc` 은 **일부러** 쓴다. 그게 격리의 수단이다. 반면 호스트 문서 쪽에는
 * 문자열 HTML 을 한 줄도 쓰지 않는다(`h()` 만).
 */
import { h } from "@/lib/dom/h";

/** 보고된 높이의 상·하한. 밖의 값은 버린다. */
export const EXPO_CODE_MIN_HEIGHT = 40;
export const EXPO_CODE_MAX_HEIGHT = 5000;

/**
 * 높이를 실제로 적용하는 횟수 상한.
 *
 * 부모가 높이를 바꾸면 자식의 뷰포트가 바뀌고, 자식 콘텐츠가 `height:100%` 류면
 * 다시 보고한다 — **되먹임 고리**다. 자식 쪽 디바운스와 2px 무시로 대부분 끊기지만,
 * 그래도 끊기지 않는 콘텐츠가 있으므로 마지막 방어로 횟수를 센다.
 */
const MAX_APPLIES = 30;

/** 1px 떨림에 레이아웃을 다시 시키지 않는다. */
const MIN_DELTA = 2;

function randomChannel(): string {
  try {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    // 난수를 못 얻으면 채널의 뜻이 약해지지만, source 검사가 남는다.
    return "fallback";
  }
}

/**
 * 프레임 안에서 돌 문서.
 *
 * **우리 보고 스크립트가 운영자 코드보다 앞이다.** 뒤에 두면, 운영자 코드에 닫히지 않은
 * `<script>` 가 있을 때 우리 스크립트 소스가 그 스크립트 본문으로 삼켜지고 우리
 * `</script>` 가 그걸 닫는다 — 우리 보고기는 아예 실행되지 않는다. 앞에 두면 그 경우에도
 * 우리는 이미 등록돼 있다.
 *
 * 운영자 코드는 **이스케이프하지 않는다.** 그건 설계다 — 원본 HTML 이어야 위젯이 산다.
 * 안전은 이스케이프가 아니라 `sandbox` 가 만든다.
 */
function buildSrcdoc(code: string, channel: string): string {
  const reporter = [
    "(function(){",
    "var CH=" + JSON.stringify(channel) + ";",
    "var last=-1,timer=null;",
    "function send(){",
    "  var d=document.documentElement,b=document.body;",
    "  var hArr=[d?d.scrollHeight:0,b?b.scrollHeight:0,b?b.offsetHeight:0];",
    "  var h=Math.max.apply(null,hArr);",
    // 자식 쪽에서도 떨림을 흘려 보낸다 — 부모까지 갈 필요가 없다.
    "  if(Math.abs(h-last)<2)return;",
    "  last=h;",
    "  try{parent.postMessage({__msxCode:CH,height:h},'*');}catch(e){}",
    "}",
    // rAF 로 한 프레임에 한 번만 — 이미지가 줄줄이 로드될 때 폭주하지 않게.
    "function schedule(){if(timer)return;timer=(window.requestAnimationFrame||setTimeout)(function(){timer=null;send();},16);}",
    "document.addEventListener('DOMContentLoaded',schedule);",
    "window.addEventListener('load',schedule);",
    "if(window.ResizeObserver){try{new ResizeObserver(schedule).observe(document.documentElement);}catch(e){}}",
    "schedule();",
    "})();",
  ].join("");

  return [
    "<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\">",
    // 붙여넣은 링크는 새 탭으로 — 프레임 안에서 열리면 위젯 자리에 남의 사이트가 뜬다.
    "<base target=\"_blank\">",
    // 프레임 자체의 여백을 0으로. 안쪽 스타일은 운영자 것이다.
    "<style>html,body{margin:0;padding:0;height:auto}</style>",
    "</head><body>",
    "<script>", reporter, "</", "script>",
    code,
    "</body></html>",
  ].join("");
}

export interface ExpoCustomCodeOptions {
  /** 운영자가 붙여넣은 원본. */
  code: string;
  /**
   * 실행해도 되는가. 라이브는 항상 true, 미리보기는 운영자가 그 세션에서
   * 명시적으로 고른 경우에만 true 다.
   */
  allowRun: boolean;
  /** 미리보기 자리표에서 "실행" 을 눌렀을 때. 없으면 버튼을 그리지 않는다. */
  onRequestRun?: () => void;
  doc?: Document;
}

export interface ExpoCustomCodeHandle {
  /** 섹션에 넣을 요소. */
  readonly el: HTMLElement;
  destroy(): void;
}

/**
 * 미리보기 자리표 — **실행하지 않은 상태**를 보여 준다.
 *
 * 샌드박스가 파트너 페이지를 지켜 주지만, 프레임 안에서 나가는 요청은 막지 않는다.
 * 운영자가 자기 브라우저에서 미리보기를 열 때마다 남의 추적 스크립트가 발화하고
 * 통계가 오염된다. 그래서 미리보기에서는 **누를 때까지 안 돈다.**
 */
function placeholder(doc: Document, onRequestRun?: () => void): HTMLElement {
  return h(
    "div",
    { class: "msx-code-placeholder" },
    h("strong", null, "직접 넣은 코드는 미리보기에서 자동 실행하지 않아요"),
    h("span", null, "실행하면 그 코드가 보내는 요청·추적 스크립트도 함께 동작해요. 통계가 섞일 수 있어요."),
    onRequestRun
      ? h("button", { class: "msx-btn", type: "button", "data-tone": "quiet", onClick: onRequestRun }, "외부 코드 미리보기 실행")
      : null,
  );
}

export function mountExpoCustomCode(options: ExpoCustomCodeOptions): ExpoCustomCodeHandle | null {
  const doc = options.doc ?? (typeof document !== "undefined" ? document : null);
  if (!doc) return null;

  const code = String(options.code ?? "");
  if (code.trim() === "") return null;

  if (!options.allowRun) {
    return { el: placeholder(doc, options.onRequestRun), destroy() { /* 자리표는 정리할 것이 없다 */ } };
  }

  const view = doc.defaultView;
  // 채널은 **srcdoc 을 넣을 때마다 새로** 발급한다 — 아래 검사의 근거다.
  const channel = randomChannel();
  const frame = doc.createElement("iframe");
  frame.className = "msx-code-frame";
  frame.setAttribute("sandbox", "allow-scripts allow-popups allow-forms");
  frame.setAttribute("loading", "lazy");
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.setAttribute("title", "직접 넣은 코드");
  // 원본을 **여기에만** 넣는다.
  frame.srcdoc = buildSrcdoc(code, channel);

  const controller = new AbortController();
  let applies = 0;
  let applied = -1;
  let capped = false;

  if (view) {
    view.addEventListener("message", (event: MessageEvent) => {
      /**
       * 두 검사를 **둘 다** 한다.
       *
       * `source` 만으로 부족한 이유: `contentWindow` 는 `srcdoc` 을 다시 넣어도 **같은
       * window 객체**다. 이전 문서가 늦게 보낸 메시지가 새 문서의 높이로 적용된다.
       * 넣을 때마다 새 채널을 발급하면 그 늦은 메시지가 무해해진다.
       *
       * `channel` 만으로 부족한 이유: `srcdoc` 속성은 부모 문서에서 **읽을 수 있다** —
       * 파트너 스크립트가 토큰을 꺼내 자기 창에서 그대로 보낼 수 있다. 토큰은 이
       * 프레임에서 왔다는 증거가 아니다.
       *
       * `origin` 은 검사하지 않는다. `allow-same-origin` 없는 srcdoc 프레임의 출처는
       * 불투명(opaque)해서 `"null"` 로 오는데, 그 문자열에 기대는 것은 구현 세부에
       * 기대는 것이다 — 두 검사로 충분하다.
       */
      const frameWindow = frame.contentWindow;
      /**
       * `contentWindow` 가 없으면(아직 문서에 없거나 이미 지워졌다) **아무것도 받지
       * 않는다.** 이 검사가 없으면 `source: null` 로 온 메시지가 `null === null` 로
       * 통과한다 — 지워진 프레임에 늦게 도착한 보고나 위조된 메시지가 그 경로로 들어온다.
       */
      if (!frameWindow || event.source !== frameWindow) return;
      const data = event.data as { __msxCode?: unknown; height?: unknown } | null;
      if (!data || typeof data !== "object") return;
      if (data.__msxCode !== channel) return;

      /**
       * 숫자 **타입**을 요구한다. `Number()` 로 넓히면 `null` 이 0 이 되어 유효한 값처럼
       * 통과하고, 프레임이 최소 높이로 조용히 줄어든다 — 잘못된 payload 는 무시가 맞다.
       */
      if (typeof data.height !== "number" || !Number.isFinite(data.height)) return;
      const height = Math.min(EXPO_CODE_MAX_HEIGHT, Math.max(EXPO_CODE_MIN_HEIGHT, Math.round(data.height)));
      if (Math.abs(height - applied) < MIN_DELTA) return;

      if (applies >= MAX_APPLIES) {
        if (!capped) {
          capped = true;
          try {
            console.warn("[mach expo] 붙여넣은 코드의 높이가 계속 바뀌어 고정했어요");
          } catch { /* 콘솔이 막혀 있어도 진행 */ }
        }
        return;
      }
      applies += 1;
      applied = height;
      frame.style.height = height + "px";
    }, { signal: controller.signal });
  }

  return {
    el: frame,
    destroy() {
      controller.abort();
      frame.remove();
    },
  };
}
