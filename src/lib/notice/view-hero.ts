/**
 * 공고 히어로 + 세로 목차.
 *
 * 랜딩 껍데기의 클래스(.hero / .toc / [data-bg])를 그대로 쓴다 — CSS 를 추출해 왔으므로
 * 구조를 맞춰야 그 규칙들이 걸린다. 새 클래스는 대회 고유 요소(팩트 줄)에만 붙인다.
 *
 * 문자열 HTML 을 쓰지 않는다: 이 코드는 외부 사이트(아임웹) 문서 안에서 돈다.
 * 운영자가 넣은 문구는 전부 텍스트 노드로만 들어간다.
 */
import { h } from "@/lib/landing/h";
import { IMAGE_PRESETS, transformedImageUrl } from "@/lib/webinar-image";
import type { NoticeModel } from "./types";

/**
 * 왼쪽 세로 목차 — 켠 섹션만 올라간다. 넓은 화면 전용(CSS 가 1280px 미만에서 숨긴다).
 *
 * 링크에 `data-toc-id`(= 실제 섹션 DOM id)를 단다. 껍데기의 스크롤 스파이(attachTocSpy)가
 * 이 속성으로 활성 항목을 찾으므로, 빠지면 목차가 현재 위치를 못 따라간다.
 * 항목이 하나뿐이면 그리지 않는다 — 목차의 일은 "어디쯤인지" 알려주는 것이라 한 칸은 의미가 없다.
 */
export function renderToc(m: NoticeModel, onNavigate?: (sectionId: string) => void): HTMLElement | null {
  if (m.tocItems.length < 2) return null;
  return h(
    "nav",
    { class: "toc", "aria-label": "섹션 목차" },
    m.tocItems.map((item) => {
      const fullId = m.sectionId(item.id);
      return h(
        "a",
        {
          class: "toc-link",
          href: `#${fullId}`,
          "data-toc-id": fullId,
          onclick: (event: Event) => {
            event.preventDefault();
            if (onNavigate) onNavigate(fullId);
            else document.getElementById(fullId)?.scrollIntoView({ behavior: "smooth", block: "start" });
          },
        },
        h("span", { class: "toc-mark", "aria-hidden": "true" }),
        h("span", null, item.label),
      );
    }),
  );
}

export function renderHero(m: NoticeModel, onApply: () => void): HTMLElement {
  const media = m.np.hero.media;
  const bg = m.np.sectionBg.hero;

  const mediaNode =
    media?.type === "image"
      ? h("img", {
          class: "hero-media",
          src: transformedImageUrl(media.url, IMAGE_PRESETS.heroBackground),
          alt: "",
          loading: "eager",
          fetchpriority: "high",
        })
      : media?.type === "video"
        ? h("video", {
            class: "hero-media",
            src: media.url,
            autoplay: "",
            muted: "",
            loop: "",
            playsinline: "",
            "aria-hidden": "true",
          })
        : null;

  const cta = h(
    "button",
    {
      type: "button",
      class: "hero-cta",
      disabled: !m.ctaEnabled,
      onclick: m.ctaEnabled ? onApply : undefined,
    },
    m.ctaLabel,
  );

  // 보조 버튼은 **켠 첫 섹션**으로 보낸다. 목차가 없으면(섹션 전부 끔) 그릴 이유가 없다.
  const firstSection = m.tocItems[0];
  const secondary =
    m.np.hero.secondaryLabel.trim() && firstSection
      ? h("a", { class: "hero-secondary", href: `#${m.sectionId(firstSection.id)}` }, m.np.hero.secondaryLabel)
      : null;

  return h(
    "section",
    {
      class: `hero${media ? " hero-has-media" : ""}`,
      "data-bg": bg,
      id: m.sectionId("nt-hero"),
    },
    mediaNode,
    h(
      "div",
      { class: "hero-inner" },
      h(
        "div",
        { class: "hero-copy" },
        m.brand && h("span", { class: "hero-brand" }, m.brand),
        h(
          m.embedded ? "h2" : "h1",
          { class: "hero-title" },
          // 둘째 줄부터 키컬러 — 원본 디자인의 "Own / the Stage." 대비를 그대로 재현한다.
          m.titleLines.map((line, index) =>
            h("span", { class: index === 0 ? "hero-line" : "hero-line hero-line-accent" }, line),
          ),
        ),
        m.subtitle && h("p", { class: "hero-subtitle" }, m.subtitle),
        h("div", { class: "hero-actions" }, cta, secondary),
        m.ctaNote && h("p", { class: "hero-note" }, m.ctaNote),
      ),
      m.np.hero.facts.length > 0 &&
        h(
          "dl",
          { class: "hero-facts" },
          m.np.hero.facts.map((fact) =>
            h(
              "div",
              { class: "hero-fact" },
              h("dt", null, fact.label),
              h("dd", null, fact.value),
            ),
          ),
        ),
    ),
  );
}
