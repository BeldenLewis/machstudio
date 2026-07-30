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
/**
 * "이런 분들께 추천합니다" — 방문자가 **자기 얘기인지 판별**하는 섹션.
 *
 * Programs(아이콘+제목+설명 카드)·Highlights(번호 카드)와 다른 형태를 쓴다: 체크 목록.
 * 세 섹션이 같은 카드 그리드면 스크롤에서 구분되지 않고, 이 섹션의 일은 "읽히는 것" 이 아니라
 * "훑으면서 나에 해당하는 줄을 찾는 것" 이라 목록형이 맞다.
 *
 * 머리글은 다른 섹션과 달리 편집 가능하다 — 이 섹션의 머리글 자체가 카피이기 때문
 * (webinar-config.ts 의 audience.title 주석 참고). 비면 기본 문구.
 */
export function renderAudience(m: LandingModel): HTMLElement | null {
  if (!m.showAudience) return null;
  const titleId = m.sectionId("lnd-audience-title");
  return h(
    "section",
    { class: "section", id: m.sectionId("lnd-audience"), "aria-labelledby": titleId },
    h("h2", { class: "section-title rv", id: titleId }, m.audienceTitle),
    h(
      "ul",
      { class: "audience-list rv" },
      m.lp.audience.items.map((item) =>
        h(
          "li",
          { class: "audience-item" },
          // 아이콘을 비우면 체크 표시. 이모지·짧은 글자를 넣으면 그게 대신 들어간다.
          h("span", { class: "audience-mark", "aria-hidden": "true" }, item.icon.trim() || "✓"),
          h(
            "div",
            { class: "audience-body" },
            h("b", null, item.title),
            item.description && h("p", null, item.description),
          ),
        ),
      ),
    ),
  );
}

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
/**
 * 혜택 — "여기서 내가 얻는 것".
 *
 * 일반 섹션이다 — 자기 배경을 칠하고 지브라 교대에 참여한다. 예전에는 accent-zone 이었지만
 * 키컬러 구간이 셋이나 되어 전환이 잦고 위아래 섹션과의 색 경계가 읽히지 않았다.
 *
 * Programs·Highlights 가 예전에는 둘 다 3열 카드라 스크롤에서 구분되지 않았다(Audience 를
 * 체크 목록으로 만든 것과 같은 이유). 혜택은 카드 평면을 없애고 **번호 + 한 줄**로 눕힌다 —
 * 훑을 때 필요한 건 "몇 가지이고 무엇인가" 뿐이고, 판이 늘어나면 그게 묻힌다.
 */
export function renderHighlights(m: LandingModel): HTMLElement | null {
  if (!m.showHighlights) return null;
  return h(
    "section",
    { class: "section benefit-zone", id: m.sectionId("lnd-highlights"), "aria-labelledby": m.sectionId("lnd-highlights-title") },
    h("h2", { class: "section-title rv", id: m.sectionId("lnd-highlights-title") }, m.highlightsTitle),
    h(
      "ol",
      { class: "benefit-list rv" },
      m.lp.highlights.items.map((item, index) =>
        h(
          "li",
          { class: "benefit-row" },
          // 번호는 장식이라 스크린리더에서 감춘다 — ol 이 이미 순서를 읽어 준다.
          h("span", { class: "benefit-number", "aria-hidden": "true" }, String(index + 1).padStart(2, "0")),
          h(
            "div",
            { class: "benefit-body" },
            h("h3", null, item.title),
            item.description && h("p", null, item.description),
          ),
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
            // data-acc: 아코디언 모션 대상(effects.attachAccordion). 타임테이블과 같은 계약이다 —
            // 답 본문을 래퍼로 감싸야 높이를 잴 수 있다(details 는 닫히면 내용이 즉시 감춰진다).
            { class: "faq-item", "data-acc": "", open: index === 0 ? "" : null },
            h("summary", null, item.question),
            h("div", { class: "faq-body", "data-acc-body": "" }, h("p", null, item.answer)),
          ),
        ),
    ),
  );
}
