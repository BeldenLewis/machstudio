/**
 * 랜딩 마운트 — 단독 페이지 / 어드민 미리보기 / 외부 사이트(아임웹) 임베드가 모두 이 함수를 탄다.
 *
 * 뷰 모듈들은 "그리기"만 하고, 문서 단위 관심사는 전부 여기서 소유한다:
 *  - 공개 게이트(비공개 랜딩이 외부 사이트에 새지 않게)
 *  - .lnd 루트 + 키컬러 변수 + 스타일/폰트 주입
 *  - dark-zone 래퍼(지브라 밴드 + on-accent 시 하단 섹션을 덮는 불투명 배경)
 *  - 모달 수명주기: body 직계 레이어 포털 + 스크롤 잠금 + 포커스 트랩 + ESC
 *  - 부분 재렌더(FAQ 탭) 후 reveal 재관찰
 *  - destroy(): 붙인 것 전부 원복 (호스트 문서를 더럽힌 채 떠나지 않는다)
 */

import { LANDING_CSS } from "./css";
import { buildLandingModel } from "./build-model";
import { h, clearNode } from "./h";
import { renderHero, renderToc } from "./view-hero";
import { renderIntro, renderPrograms, renderHighlights, renderJoin, renderFaq } from "./view-sections";
import { renderSessions, renderTimetable, createSessionDialog } from "./view-sessions";
import { attachReveal, attachAccentZone, attachTocSpy } from "./effects";
import { acquireLayer, releaseLayer, lockScroll, unlockScroll, trapFocus } from "./overlay";
import type { LandingSession, LandingWebinar } from "./types";

const STYLE_ID = "lnd-css";
const FONT_ID = "lnd-font";
const FONT_HREF =
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css";

let uidCounter = 0;

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
  const uid = `lnd${++uidCounter}`;

  ensureStyles();
  ensureFont();

  const m = buildLandingModel(webinar, { uid, embedded, isPreview, origin: opts.origin });

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

  const toc = renderToc(m);
  if (toc) root.appendChild(toc);
  root.appendChild(body);

  clearNode(mount);
  mount.appendChild(root);

  // ── 호스트 크롬(헤더) 높이 보정 ───────────────────────────────────────
  // 임베드는 호스트 헤더 아래에서 시작하는데 히어로가 100svh 면 바닥의 일시·CTA 가 헤더 높이만큼
  // 화면 밖으로 밀린다(실측: 아임웹 헤더 130px → CTA 가 fold 아래). 최상단일 때의 마운트 top 이
  // 곧 위쪽 점유 높이다. 스크롤 중에는 값이 의미 없으므로 최상단에서만 갱신한다.
  // 단독 페이지는 마운트가 문서 최상단이라 자연히 0 → 기존 동작 그대로.
  const applyTopInset = () => {
    if ((window.scrollY || 0) >= 4) return;
    const top = Math.max(0, Math.min(240, Math.round(mount.getBoundingClientRect().top)));
    root.style.setProperty("--lnd-topinset", `${top}px`);
  };
  applyTopInset();
  let insetRaf = 0;
  const onResize = () => {
    cancelAnimationFrame(insetRaf);
    insetRaf = requestAnimationFrame(applyTopInset);
  };
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);
  cleanups.push(() => {
    cancelAnimationFrame(insetRaf);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("orientationchange", onResize);
  });

  // ── 이펙트 ────────────────────────────────────────────────────────────
  cleanups.push(attachReveal(root));
  const accentZones = [m.sectionId("lnd-sessions"), m.sectionId("lnd-timetable")];
  cleanups.push(attachAccentZone(root, accentZones));
  cleanups.push(attachTocSpy(root, toc, m.tocItems.map((t) => m.sectionId(t.id))));

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
