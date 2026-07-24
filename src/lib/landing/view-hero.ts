/**
 * 히어로 + 좌측 목차 뷰 — 원본 랜딩 page.tsx 의 <section className="hero"> / <nav className="toc"> 을
 * 프레임워크 없이 그대로 옮긴 것. 클래스명·DOM 구조·접근성 속성은 1:1 유지가 목표(시각 회귀 0).
 *
 * 이 파일이 원본과 의도적으로 다른 두 지점:
 *  - 임베드에선 호스트 문서에 이미 <h1> 이 있다 → 히어로 제목만 h2 로 낮춘다(문서 개요 중복 방지).
 *    시각은 같아야 하므로 css.ts 의 히어로 제목 규칙에 h2 를 함께 걸어 두었다.
 *  - 섹션 앵커는 전부 m.sectionId() 를 통과시킨다. 한 페이지에 랜딩이 둘 붙어도 id 가 안 부딪히게.
 *
 * aria-current 갱신(스크롤 스파이)은 effects 담당이라 여기서 하지 않는다. 대신 스파이가 링크를
 * 찾을 수 있게 각 링크에 data-toc-id(= 실제 섹션 DOM id)를 달아 둔다.
 */

import { safeHttpUrl } from "@/lib/webinar-config";
import { cx, h, svg } from "./h";
import type { LandingModel } from "./types";

/**
 * h() 의 href 검증(safeHttpUrl)은 "절대 http(s) URL" 만 통과시킨다. 랜딩 링크는
 * "#lnd-about"(목차 앵커) · "/webinar/{slug}/live?view=signup"(단독 페이지 등록 링크)처럼
 * 상대 형태라 props 로 넘기면 href 속성이 통째로 사라진다 → 여기서만 따로 허용한다.
 * 허용: 프래그먼트(#...), 사이트 루트 상대경로(/...), http(s) 절대 URL.
 * 거부: //호스트(오프사이트 프로토콜 상대), javascript:·data: 등 나머지 전부.
 */
function setLinkHref(el: HTMLElement, url: string): void {
  const raw = (url ?? "").trim();
  if (!raw) return;
  if (raw.startsWith("#") || (raw.startsWith("/") && !raw.startsWith("//"))) {
    el.setAttribute("href", raw);
    return;
  }
  const safe = safeHttpUrl(raw);
  if (safe) el.setAttribute("href", safe);
}

/** 목차 클릭 기본 동작 — 문서 전역이 아니라 자기 랜딩 루트 안에서만 대상 섹션을 찾는다. */
function scrollWithinRoot(from: HTMLElement, fullId: string): void {
  const root = from.closest<HTMLElement>(".lnd");
  const selector =
    typeof CSS !== "undefined" && typeof CSS.escape === "function" ? `#${CSS.escape(fullId)}` : `[id="${fullId}"]`;
  const target = root ? root.querySelector<HTMLElement>(selector) : null;
  if (!target) return;
  const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

/** 히어로 배경 영상 — muted 는 속성만으로 자동재생이 막히는 브라우저가 있어 프로퍼티도 함께 세팅. */
function renderHeroVideo(url: string): HTMLElement {
  const video = h("video", { src: url, autoplay: "", muted: "", loop: "", playsinline: "" });
  (video as HTMLVideoElement).muted = true;
  return video;
}

/** 화살표 아이콘 — 원본 hero-cta 안의 인라인 svg 와 동일. */
function arrowIcon(): SVGElement {
  return svg(
    "svg",
    { viewBox: "0 0 24 24", "aria-hidden": "true" },
    svg("path", {
      d: "M5 12h13M13 6l6 6-6 6",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
  );
}

export function renderHero(m: LandingModel): HTMLElement {
  const media = m.lp.heroMedia;

  const mediaBox = h(
    "div",
    { class: cx("hero-media", media ? "has-media" : null), "aria-hidden": "true" },
    media
      ? media.type === "video"
        ? renderHeroVideo(media.url)
        : // 외부 임의 호스트 이미지(어드민 입력 URL) — normalize 단계에서 http(s) 만 통과
          h("img", { src: media.url, alt: "", loading: "eager" })
      : null,
  );

  // 임베드에선 호스트에 이미 h1 이 있으므로 h2 로 낮춘다(클래스 없음 — 원본과 동일).
  const heading = h(
    m.embedded ? "h2" : "h1",
    null,
    m.titleLines.map((line) => h("span", null, line)),
  );

  const cta = h(
    "a",
    {
      class: "hero-cta",
      // 임베드는 호스트 문서 안이라 등록 페이지를 새 탭으로 연다
      target: m.embedded ? "_blank" : null,
      rel: m.embedded ? "noopener" : null,
    },
    h("span", null, m.lp.ctaLabel),
    arrowIcon(),
  );
  setLinkHref(cta, m.registerUrl);

  return h(
    "section",
    { class: "hero", "aria-label": "웨비나 소개" },
    mediaBox,
    h(
      "div",
      { class: "hero-inner" },
      h(
        "div",
        { class: "hero-copy" },
        h("p", { class: "eyebrow" }, m.brand),
        heading,
        m.subtitle ? h("p", { class: "hero-subtitle" }, m.subtitle) : null,
      ),
      // 일시 + 장소는 한 문단 두 줄 — CSS white-space:pre-line 이 줄바꿈을 살린다
      h("p", { class: "hero-meta" }, m.dateStr, "\n", m.lp.venue),
      cta,
    ),
  );
}

/**
 * 좌측 세로 목차. 항목이 2개 미만이면(=이동할 곳이 사실상 없음) 렌더하지 않는다.
 * 임베드에선 원본과 마찬가지로 아예 만들지 않는다 — position:fixed 가 호스트 조상 transform 에
 * 걸려 엉뚱한 위치에 떠 버린다.
 *
 * onNavigate 를 주면 스크롤 대상 결정을 호출자(마운트/effects)에게 넘긴다. 안 주면 자기
 * 랜딩 루트 안에서만 섹션을 찾아 스크롤한다(document.getElementById 를 쓰지 않는 이유:
 * 한 호스트 문서에 랜딩이 둘 붙으면 남의 섹션으로 튈 수 있다).
 */
export function renderToc(m: LandingModel, onNavigate?: (sectionId: string) => void): HTMLElement | null {
  if (m.embedded || m.tocItems.length < 2) return null;

  const nav = h("nav", { class: "toc", "aria-label": "섹션 목차" });

  for (const item of m.tocItems) {
    const fullId = m.sectionId(item.id);
    const link = h(
      "a",
      {
        class: "toc-link",
        // 스크롤 스파이(effects)가 aria-current 를 걸 대상을 찾는 열쇠 — 값은 실제 섹션 DOM id
        "data-toc-id": fullId,
        onclick: (e: Event) => {
          e.preventDefault();
          if (onNavigate) onNavigate(fullId);
          else scrollWithinRoot(nav, fullId);
        },
      },
      h("span", { class: "toc-mark", "aria-hidden": "true" }),
      h("span", null, item.label),
    );
    setLinkHref(link, `#${fullId}`);
    nav.appendChild(link);
  }

  return nav;
}
