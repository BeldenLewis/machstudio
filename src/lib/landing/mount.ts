/**
 * 랜딩 마운트 — 단독 페이지 / 어드민 미리보기 / 외부 사이트(아임웹) 임베드가 모두 이 함수를 탄다.
 *
 * 뷰 모듈들은 "그리기"만 하고, 문서 단위 관심사는 전부 여기서 소유한다:
 *  - 공개 게이트(비공개 랜딩이 외부 사이트에 새지 않게)
 *  - .lnd 루트 + 키컬러 변수 + 스타일/폰트 주입
 *  - dark-zone 래퍼(지브라 밴드 + on-accent 시 하단 섹션을 덮는 불투명 배경)
 *  - 모달 수명주기: body 직계 레이어 포털 + 스크롤 잠금 + 포커스 트랩 + ESC
 *  - 목차: 별도 body 직계 레이어 포털 + 랜딩 이탈 시 감춤 (fixed 가 호스트 조상에 안 걸리게)
 *  - 부분 재렌더(FAQ 탭) 후 reveal 재관찰
 *  - destroy(): 붙인 것 전부 원복 (호스트 문서를 더럽힌 채 떠나지 않는다)
 */

import { LANDING_CSS } from "./css";
import { buildLandingModel } from "./build-model";
import { h, clearNode } from "./h";
import { renderHero, renderToc, scrollToSectionIn } from "./view-hero";
import { renderIntro, renderPrograms, renderHighlights, renderJoin, renderFaq } from "./view-sections";
import { renderSessions, renderTimetable, createSessionDialog } from "./view-sessions";
import { attachReveal, attachAccentZone, attachTocSpy, attachTocVisibility } from "./effects";
import { acquireLayer, createTocLayer, releaseLayer, lockScroll, unlockScroll, trapFocus } from "./overlay";
import type { LandingSession, LandingWebinar } from "./types";

const STYLE_ID = "lnd-css";
const FONT_ID = "lnd-font";
const FONT_HREF =
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css";

/**
 * uid 카운터는 **문서 전역**에 둔다. 임베드는 소비처마다 별도 IIFE 번들이라 모듈 스코프
 * 변수가 각자 0 에서 시작해, 랜딩 2개를 붙이면 둘 다 uid="lnd1" 을 받았다.
 * 그러면 섹션 id·aria-labelledby 가 중복되고 모달 레이어(uid 셀렉터)를 공유해 키컬러가 섞인다.
 */
function nextUid(): string {
  const w = globalThis as typeof globalThis & { __machLandingUid?: number };
  w.__machLandingUid = (w.__machLandingUid ?? 0) + 1;
  return `lnd${w.__machLandingUid}`;
}

export interface MountLandingOptions {
  mount: HTMLElement;
  webinar: LandingWebinar;
  embedded: boolean;
  isPreview: boolean;
  /** 임베드는 호스트 도메인이 달라 상대경로가 깨진다 → 절대 URL 생성용. */
  origin?: string;
  /** 레거시 iframe 임베드 경로에서만 true — 히어로 높이를 --lnd-vh 로 잡는다. */
  legacyIframe?: boolean;
}

export interface LandingHandle {
  destroy(): void;
}

/** 스타일은 문서당 1회. 여러 랜딩이 붙어도 한 벌만 쓴다. */
function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = LANDING_CSS;
  document.head.appendChild(style);
}

/**
 * 히어로 이미지를 DOM 조립보다 먼저 받기 시작한다.
 * 임베드는 페이로드가 스크립트에 실려 와 URL 을 즉시 알 수 있으므로, 트리를 다 만든 뒤
 * <img> 가 붙기를 기다릴 이유가 없다. 첫 화면에서 배경이 비어 보이는 시간을 줄인다.
 */
function preloadHeroImage(url: string): void {
  if (document.querySelector(`link[rel="preload"][href="${CSS.escape(url)}"]`)) return;
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "image";
  link.href = url;
  link.setAttribute("fetchpriority", "high");
  document.head.appendChild(link);
}

/** Pretendard — 호스트가 이미 로드했을 수 있으니 중복 주입만 피한다. */
function ensureFont(): void {
  if (document.getElementById(FONT_ID)) return;
  const link = document.createElement("link");
  link.id = FONT_ID;
  link.rel = "stylesheet";
  link.href = FONT_HREF;
  document.head.appendChild(link);
}

export function mountLanding(opts: MountLandingOptions): LandingHandle {
  const { mount, webinar, embedded, isPreview } = opts;
  const uid = nextUid();

  ensureStyles();
  ensureFont();

  const m = buildLandingModel(webinar, { uid, embedded, isPreview, origin: opts.origin });

  // 장식 링을 안 그리는 대신(첫 화면 교체 방지) 이미지가 최대한 빨리 오게 한다.
  if (m.lp.heroMedia?.type === "image" && m.lp.heroMedia.url) preloadHeroImage(m.lp.heroMedia.url);

  const root = h("div", {
    class: `lnd${embedded ? " embedded" : ""}`,
    lang: "ko",
    style: { "--primary": m.accent, "--on-primary": m.onPrimary },
  });
  if (opts.legacyIframe) root.setAttribute("data-legacy-iframe", "");

  // 공개 게이트 — 미공개 랜딩이 외부 사이트에 그대로 노출되면 안 된다.
  if (!m.lp.enabled && !isPreview) {
    root.appendChild(
      h(
        "div",
        { style: { minHeight: "60vh", display: "grid", placeItems: "center", color: "#abb5c7", padding: "24px", textAlign: "center" } },
        "아직 공개되지 않은 페이지예요.",
      ),
    );
    clearNode(mount);
    mount.appendChild(root);
    return { destroy: () => root.remove() };
  }

  if (!m.lp.enabled && isPreview) {
    root.appendChild(h("div", { class: "preview-badge" }, "비공개 상태 · 미리보기"));
  }

  const cleanups: Array<() => void> = [];

  // ── 모달 ──────────────────────────────────────────────────────────────
  let closeActive: (() => void) | null = null;

  const openSession = (session: LandingSession, opener: HTMLElement) => {
    closeActive?.();
    const layer = acquireLayer(uid);
    // 레이어는 body 직계라 루트의 인라인 키컬러 변수를 못 받는다 → 여기서 다시 심는다.
    layer.style.setProperty("--primary", m.accent);
    layer.style.setProperty("--on-primary", m.onPrimary);

    const close = () => {
      closeActive = null;
      document.removeEventListener("keydown", onKey, true);
      releaseTrap();
      unlockScroll();
      dialog.remove();
      releaseLayer(uid);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };

    const dialog = createSessionDialog(m, session, { onClose: () => close() });
    layer.appendChild(dialog);
    lockScroll();
    document.addEventListener("keydown", onKey, true);
    const releaseTrap = trapFocus(dialog, opener);
    dialog.querySelector<HTMLElement>("[data-ms-modal-close]")?.focus();
    closeActive = close;
  };
  cleanups.push(() => closeActive?.());

  // ── 본문 조립 ─────────────────────────────────────────────────────────
  // 임베드에선 호스트에 이미 <main> 이 있으므로 랜드마크를 중복시키지 않는다.
  const body = h(embedded ? "div" : "main", null);

  body.appendChild(renderHero(m));
  const intro = renderIntro(m);
  if (intro) body.appendChild(intro);
  const sessions = renderSessions(m, openSession);
  if (sessions) body.appendChild(sessions);
  const timetable = renderTimetable(m);
  if (timetable) body.appendChild(timetable);

  // dark-zone: 지브라 밴드(nth-of-type)와 on-accent 시 불투명 배경이 여기 걸린다.
  const darkZone = h("div", { class: "dark-zone" });
  const programs = renderPrograms(m);
  if (programs) darkZone.appendChild(programs);
  const highlights = renderHighlights(m);
  if (highlights) darkZone.appendChild(highlights);
  const join = renderJoin(m);
  if (join) darkZone.appendChild(join);

  // FAQ 는 카테고리 탭 상태가 있어 부분 재렌더된다.
  let faqCategory: string | null = null;
  const faqSlot = h("div", null);
  const paintFaq = () => {
    clearNode(faqSlot);
    const faq = renderFaq(m, {
      activeCategory: faqCategory,
      onSelectCategory: (c) => {
        faqCategory = c;
        paintFaq();
        // 새로 생긴 .rv 노드는 관찰 대상이 아니므로 즉시 노출시킨다
        // (안 그러면 translateY(12px) 상태로 굳는다).
        faqSlot.querySelectorAll(".rv").forEach((el) => el.classList.add("in"));
      },
    });
    if (faq) faqSlot.appendChild(faq);
  };
  paintFaq();
  darkZone.appendChild(faqSlot);

  if (darkZone.firstChild) body.appendChild(darkZone);

  // 목차는 body 직계 전용 레이어로 포털한다. 지금 아임웹에는 fixed 를 가로채는 조상이 없지만
  // (실측: transform/filter/contain 조상 0개), 호스트가 섹션 애니메이션을 켜면 조상에 transform 이
  // 생겨 목차가 조용히 엉뚱한 곳에 떠 버린다. 모달과 같은 방식으로 미리 격리해 둔다.
  // 포털하면 closest('.lnd') 가 레이어를 가리켜 섹션을 못 찾으므로 onNavigate 로 실제 루트를 넘긴다.
  const toc = renderToc(m, (fullId) => scrollToSectionIn(root, fullId));
  let tocLayer: HTMLElement | null = null;
  if (toc) {
    tocLayer = createTocLayer(uid, m.accent, m.onPrimary);
    tocLayer.appendChild(toc);
    // root.remove() 로는 안 지워진다(루트 밖에 있다) → 명시적으로 정리.
    cleanups.push(() => {
      toc.remove();
      tocLayer?.remove();
    });
  }
  root.appendChild(body);

  clearNode(mount);
  mount.appendChild(root);

  // ── 호스트 크롬(헤더) 높이 보정 ───────────────────────────────────────
  // 임베드는 호스트 헤더 아래에서 시작하는데 히어로가 100svh 면 바닥의 일시·CTA 가 헤더 높이만큼
  // 화면 밖으로 밀린다(실측: 아임웹 헤더 130px → CTA 가 fold 아래).
  // 단독 페이지는 마운트가 문서 최상단이라 자연히 0 → 기존 동작 그대로.
  // 마운트의 **문서상 절대 Y** 를 쓴다(뷰포트 상대 top + 현재 스크롤). 스크롤 위치와 무관하게
  // 항상 같은 값이 나오므로, 사용자가 스크롤한 상태에서 창을 최대화해도 정확히 재측정된다.
  // (뷰포트 상대 top 만 쓰고 "최상단일 때만 갱신" 가드를 두면, 스크롤 중 리사이즈가 통째로
  //  건너뛰어져 낡은 값이 남는다 — 실제로 창 최대화 시 히어로 하단이 잘리는 버그였다.)
  const applyTopInset = () => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    const absTop = mount.getBoundingClientRect().top + scrollTop;
    const top = Math.max(0, Math.min(240, Math.round(absTop)));
    root.style.setProperty("--lnd-topinset", `${top}px`);
  };
  applyTopInset();
  // 동기로 즉시 반영한다. requestAnimationFrame 으로만 미루면 rAF 가 스로틀되는 상황
  // (백그라운드 탭·절전·일부 자동화 환경)에서 재측정이 통째로 유실된다 — 실제로 그렇게 재현됐다.
  // resize/ResizeObserver 는 이미 레이아웃 이후에 오므로 여기서 바로 재도 정확하다.
  window.addEventListener("resize", applyTopInset);
  window.addEventListener("orientationchange", applyTopInset);
  // 창 크기 변화 없이 호스트 헤더만 다시 접히는 경우(반응형 내비 등)도 잡는다.
  const insetRo = typeof ResizeObserver !== "undefined" ? new ResizeObserver(applyTopInset) : null;
  insetRo?.observe(document.body);
  cleanups.push(() => {
    window.removeEventListener("resize", applyTopInset);
    window.removeEventListener("orientationchange", applyTopInset);
    insetRo?.disconnect();
  });

  // ── 이펙트 ────────────────────────────────────────────────────────────
  cleanups.push(attachReveal(root));
  const accentZones = [m.sectionId("lnd-sessions"), m.sectionId("lnd-timetable")];
  // 목차 레이어에도 on-accent 를 미러링한다 — 루트 밖으로 나갔으니 후손 선택자가 안 걸린다.
  cleanups.push(attachAccentZone(root, accentZones, tocLayer ? [tocLayer] : []));
  cleanups.push(attachTocSpy(root, toc, m.tocItems.map((t) => m.sectionId(t.id))));
  // 임베드는 랜딩 위아래로 호스트 콘텐츠가 있다 → 랜딩을 벗어나면 고정 목차를 감춘다.
  cleanups.push(attachTocVisibility(body, toc));

  return {
    destroy() {
      for (const fn of cleanups.splice(0)) {
        try {
          fn();
        } catch {
          /* 정리 중 예외가 나머지 정리를 막지 않게 */
        }
      }
      releaseLayer(uid);
      root.remove();
    },
  };
}
