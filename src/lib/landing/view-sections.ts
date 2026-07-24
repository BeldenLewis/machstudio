/**
 * 랜딩 본문 섹션 뷰 — intro(about) / programs / highlights / join / faq.
 *
 * 원본 `app/webinar/[slug]/landing/page.tsx` 의 JSX 를 클래스명·DOM 구조·속성·텍스트
 * 1:1 로 옮긴 것이다(시각 회귀 0 이 목표). 파생·조건 판단은 전부 LandingModel 에서 끝났다고
 * 보고 여기서는 값을 읽기만 한다 — 단독 페이지 / 어드민 미리보기 / 외부 사이트 임베드가
 * 같은 결론을 보게 하려는 목적.
 *
 * - 섹션 노출은 model 의 show* 게이트만 신뢰한다(false → null). "토글 ON + 데이터 있음"
 *   이중 게이트는 이미 model 에서 계산됨.
 * - DOM id 는 전부 m.sectionId() 를 통과시킨다. 한 호스트 문서에 랜딩이 둘 이상 붙어도
 *   id 와 aria-labelledby 가 안 부딪히게.
 * - FAQ 카테고리 탭은 상태를 여기서 들지 않는다(제어형). 활성 카테고리는 인자로 받고,
 *   선택은 콜백으로 올려보낸다 — 재렌더 시점은 통합자가 결정한다.
 * - 문자열 HTML 금지: 사용자 입력(제목/설명/질문/답변 등)은 전부 자식 텍스트노드로만 들어간다.
 */

import { h } from "./h";
import type { LandingModel } from "./types";

/** FAQ 는 제어형 — 활성 탭 상태는 통합자가 보관하고, 여기엔 값과 콜백만 내려온다. */
export interface FaqViewCtx {
  /** 현재 활성 카테고리. null/미보유 값이면 첫 카테고리로 폴백한다. */
  activeCategory: string | null;
  /** 탭 클릭. 생략하면 data-faq-category 위임 처리(통합자 쪽 리스너)만 남는다. */
  onSelectCategory?: (category: string) => void;
}

/** ABOUT — 인트로 카피 + 스크롤 큐 */
export function renderIntro(m: LandingModel): HTMLElement | null {
  if (!m.showIntro) return null;
  return h(
    "section",
    { class: "intro", id: m.sectionId("lnd-about"), "aria-labelledby": m.sectionId("lnd-about-title") },
    h(
      "div",
      { class: "intro-copy rv" },
      h("h2", { id: m.sectionId("lnd-about-title") }, m.introTitle),
      m.introBody && h("p", null, m.introBody),
    ),
    h("span", { class: "scroll-cue", "aria-hidden": "true" }),
  );
}

/** PROGRAMS — 아이콘 + 제목 + 설명 카드 그리드 */
export function renderPrograms(m: LandingModel): HTMLElement | null {
  if (!m.showPrograms) return null;
  return h(
    "section",
    { class: "section", id: m.sectionId("lnd-programs"), "aria-labelledby": m.sectionId("lnd-programs-title") },
    h("h2", { class: "section-title rv", id: m.sectionId("lnd-programs-title") }, "Programs"),
    h(
      "div",
      { class: "program-grid rv" },
      m.lp.programs.items.map((item) =>
        h(
          "article",
          { class: "program-card" },
          h(
            "div",
            { class: "program-heading" },
            item.icon.trim() && h("span", { class: "program-icon", "aria-hidden": "true" }, item.icon),
            h("h3", null, item.title),
          ),
          item.description && h("p", null, item.description),
        ),
      ),
    ),
  );
}

/** HIGHLIGHTS — 번호가 붙은 베네핏 카드 */
export function renderHighlights(m: LandingModel): HTMLElement | null {
  if (!m.showHighlights) return null;
  return h(
    "section",
    { class: "section", id: m.sectionId("lnd-highlights"), "aria-labelledby": m.sectionId("lnd-highlights-title") },
    h("h2", { class: "section-title rv", id: m.sectionId("lnd-highlights-title") }, "Highlights"),
    h(
      "div",
      { class: "benefit-grid rv" },
      m.lp.highlights.items.map((item, index) =>
        h(
          "article",
          { class: "benefit-card" },
          h("span", { class: "benefit-number" }, String(index + 1).padStart(2, "0")),
          h("h3", null, item.title),
          item.description && h("p", null, item.description),
        ),
      ),
    ),
  );
}

/** HOW TO JOIN — 참여 절차 스텝 + 마감 안내 */
export function renderJoin(m: LandingModel): HTMLElement | null {
  if (!m.showJoin) return null;
  return h(
    "section",
    { class: "section", id: m.sectionId("lnd-join"), "aria-labelledby": m.sectionId("lnd-join-title") },
    h("h2", { class: "section-title rv", id: m.sectionId("lnd-join-title") }, "How to Join"),
    h(
      "div",
      { class: "join-grid rv" },
      m.lp.join.steps.map((step, index) =>
        h(
          "article",
          { class: "join-step" },
          h("span", { class: "join-k" }, `Step ${index + 1}`),
          h("h3", null, step.title),
          step.description && h("p", null, step.description),
        ),
      ),
    ),
    h(
      "p",
      { class: "deadline rv" },
      h("b", null, m.dateStr),
      " 라이브 시작 · 사전 등록 후 입장 안내를 보내드려요",
    ),
  );
}

/** FAQ — 카테고리 탭(제어형) + details 아코디언. 첫 항목만 열린 채로 시작한다. */
export function renderFaq(m: LandingModel, ctx: FaqViewCtx): HTMLElement | null {
  if (!m.showFaq) return null;
  // 활성 카테고리 폴백 — 편집으로 카테고리가 사라져도 빈 목록이 남지 않게(원본과 동일 규칙)
  const active =
    ctx.activeCategory && m.faqCategories.includes(ctx.activeCategory) ? ctx.activeCategory : m.faqCategories[0];

  return h(
    "section",
    { class: "section", id: m.sectionId("lnd-faq"), "aria-labelledby": m.sectionId("lnd-faq-title") },
    h("h2", { class: "section-title rv", id: m.sectionId("lnd-faq-title") }, "FAQ"),
    m.faqCategories.length > 1 &&
      h(
        "div",
        { class: "faq-tabs rv", role: "group", "aria-label": "FAQ 카테고리" },
        m.faqCategories.map((category) =>
          h(
            "button",
            {
              type: "button",
              class: "faq-tab",
              "aria-pressed": category === active ? "true" : "false",
              "data-faq-category": category,
              onclick: () => ctx.onSelectCategory?.(category),
            },
            category,
          ),
        ),
      ),
    h(
      "div",
      { class: "faq-list rv" },
      m.lp.faq.items
        .filter((item) => item.category === active)
        .map((item, index) =>
          h(
            "details",
            { class: "faq-item", open: index === 0 ? "" : null },
            h("summary", null, item.question),
            h("p", null, item.answer),
          ),
        ),
    ),
  );
}
