/**
 * 여섯 섹션 중 **정적인 네 가지**를 그린다 — 키비주얼·본문·카드·퀵 액션.
 *
 * ── 왜 문자열 HTML 이 아닌가 ──────────────────────────────────────────
 * 이 코드는 파트너 사이트(아임웹 등) 문서 안에서 실행된다. Shadow 경계는 **CSS 를 막지
 * XSS 를 막지 않는다** — Shadow 안에서 실행된 스크립트도 파트너 도메인의 스크립트이고
 * 그 페이지의 쿠키·DOM 에 전부 닿는다. 그래서 `h()`(createElement/textContent)만 쓴다.
 * `src/lib/__tests__/embed-runtime.test.ts` 가 이 디렉터리를 통째로 강제한다.
 *
 * ── 입력은 이미 좁혀져 있다 ───────────────────────────────────────────
 * 여기 들어오는 것은 `buildExpoPayload` 를 통과한 값이다: 로케일 맵은 문자열이 됐고,
 * `page:{id}` 내부 참조는 실제 주소이거나 **빈 문자열**이다. 그래서 이 파일은 번역도
 * 링크 해석도 하지 않는다 — 판정이 두 곳에 있으면 반드시 갈라진다.
 *
 * ── 빈 값의 규칙 ──────────────────────────────────────────────────────
 * 값이 없으면 **그 요소를 아예 만들지 않는다.** 빈 <p> 나 href 없는 버튼은 방문자에게
 * 고장으로 보인다. `hasContent`(model.ts)가 섹션 단위로 한 번 걸렀고, 여기서는 슬롯 단위로
 * 다시 거른다 — 필수가 아닌 슬롯은 비어 있는 게 정상이기 때문이다.
 */
import { h, type Child } from "@/lib/dom/h";
import { sectionDef } from "@/lib/expo/registry";
import { safeHttpUrl } from "@/lib/webinar-config";

/** `buildExpoPayload` 가 내보낸 섹션 하나. */
export interface PayloadSection {
  sid: string;
  type: string;
  variant: string;
  design: Record<string, string>;
  content: Record<string, unknown>;
}

interface MediaLike { url?: string; alt?: string }
interface LinkLike { label?: string; href?: string }

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const media = (v: unknown): MediaLike | null => {
  const m = (v ?? {}) as MediaLike;
  return str(m.url) ? m : null;
};
const link = (v: unknown): LinkLike | null => {
  const l = (v ?? {}) as LinkLike;
  /**
   * 주소를 여기서 한 번 더 좁힌다.
   *
   * `h()` 도 위험한 스킴이면 href 를 생략하지만, 그러면 **주소 없는 <a> 가 남는다** —
   * 키보드로 도달은 되는데 아무 일도 안 일어나는 요소다. 아예 그리지 않는 편이 맞다.
   * (정규화(config.ts)가 이미 걸렀으므로 여기 걸리는 값은 없어야 정상이다.)
   */
  const href = safeHttpUrl(str(l.href));
  if (!href || !str(l.label)) return null;
  return { label: str(l.label), href };
};
const rows = (v: unknown): Array<Record<string, unknown>> =>
  Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [];

/**
 * 이미지 한 장.
 * `alt` 가 비면 **장식용**으로 다룬다(빈 문자열) — 스크린리더가 파일명을 읽지 않게.
 */
function img(m: MediaLike, className: string): HTMLElement {
  return h("img", {
    class: className,
    src: str(m.url),
    alt: str(m.alt),
    loading: "lazy",
    decoding: "async",
  });
}

/** 사용자가 쓴 여러 줄 텍스트. 줄바꿈은 CSS(`white-space: pre-wrap`)가 보존한다. */
function prose(text: string, className: string): HTMLElement {
  return h("div", { class: `${className} msx-prose` }, text);
}

function cta(l: LinkLike, tone?: "quiet"): HTMLElement {
  return h("a", { class: "msx-btn", href: str(l.href), ...(tone ? { "data-tone": tone } : {}) }, str(l.label));
}

// ── 타입별 ──────────────────────────────────────────────────────────────

function renderKv(section: PayloadSection): Child[] {
  const c = section.content;
  const m = media(c.media);
  const button = link(c.cta);
  return [
    h(
      "div",
      {
        class: "msx-kv",
        "data-variant": section.variant,
        // 정렬은 디자인 노브다 — 없으면 CSS 기본값(left)이 그대로 쓰인다.
        ...(section.design.align ? { "data-align": section.design.align } : {}),
      },
      str(c.eyebrow) && h("p", { class: "msx-kv-eyebrow" }, str(c.eyebrow)),
      h("h2", { class: "msx-kv-title" }, str(c.title)),
      str(c.subtitle) && h("p", { class: "msx-kv-sub" }, str(c.subtitle)),
      // `minimal` 변형은 CSS 가 이미지를 숨긴다. DOM 에서도 만들지 않아야 네트워크 요청이 안 난다.
      section.variant !== "minimal" && m && img(m, "msx-kv-media"),
      button && cta(button),
    ),
  ];
}

function renderTextblock(section: PayloadSection): Child[] {
  const c = section.content;
  const m = media(c.media);
  return [
    h(
      "div",
      { class: "msx-text", "data-variant": section.variant },
      str(c.heading) && h("h2", { class: "msx-heading" }, str(c.heading)),
      str(c.body) && prose(str(c.body), "msx-text-body"),
      m && img(m, "msx-text-media"),
    ),
  ];
}

function renderCardgrid(section: PayloadSection): Child[] {
  const c = section.content;
  const cards = rows(c.items).map((row) => {
    const m = media(row.media);
    const l = link(row.link);
    const inner: Child[] = [
      m && img(m, "msx-card-media"),
      str(row.tag) && h("div", { class: "msx-card-tag" }, str(row.tag)),
      h("h3", { class: "msx-card-title" }, str(row.title)),
      str(row.description) && prose(str(row.description), "msx-card-desc"),
    ];
    // 링크가 있으면 카드 전체가 링크다. 없으면 <div> 다 — 못 누르는 카드가
    // 눌릴 것처럼 보이면 안 되고, 빈 <a> 는 키보드 탐색에 헛걸음을 만든다.
    return l
      ? h("a", { class: "msx-card", href: str(l.href) }, ...inner)
      : h("div", { class: "msx-card" }, ...inner);
  });

  return [
    str(c.heading) && h("h2", { class: "msx-heading" }, str(c.heading)),
    cards.length > 0 && h("div", { class: "msx-cards" }, ...cards),
  ];
}

function renderToolbox(section: PayloadSection): Child[] {
  const tools = rows(section.content.items)
    .map((row) => {
      const l = link(row.link);
      const label = str(row.label);
      if (!l || !label) return null;
      return h("a", { class: "msx-tool", href: str(l.href) }, label);
    })
    .filter(Boolean) as HTMLElement[];

  if (tools.length === 0) return [];
  return [h("div", { class: "msx-tools", "data-variant": section.variant }, ...tools)];
}

const STATIC_RENDERERS: Record<string, (section: PayloadSection) => Child[]> = {
  kv: renderKv,
  textblock: renderTextblock,
  cardgrid: renderCardgrid,
  toolbox: renderToolbox,
};

/** 이 타입을 이 파일이 그리는가 — 나머지 둘은 수명이 있어 자기 모듈이 맡는다. */
export function isStaticSectionType(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(STATIC_RENDERERS, type);
}

// ── 껍데기 ──────────────────────────────────────────────────────────────

/**
 * 모든 섹션이 공유하는 바깥 껍데기.
 *
 * `data-*` 로 타입·변형·배경을 싣는다 — CSS 가 그걸 보고 그린다. 클래스 이름을 타입마다
 * 늘리지 않는 이유는, 타입을 추가할 때 손댈 곳이 카탈로그 한 곳이어야 하기 때문이다.
 *
 * `data-msx-sid` 는 진단용이다. 섹션 단독 스니펫이 이 값을 참조하므로 정렬·변형 전환·
 * 발행에 살아남아야 하고(config.ts), 화면에서 어느 섹션인지 짚을 수 있어야 한다.
 */
export function sectionShell(section: PayloadSection, ...inner: Child[]): HTMLElement {
  return h(
    "section",
    {
      class: "msx-section",
      "data-msx-sid": section.sid,
      "data-type": section.type,
      "data-variant": section.variant,
      // 배경 톤은 전 타입 공통 노브다. 없으면 CSS 기본값(light).
      ...(section.design.bg ? { "data-bg": section.design.bg } : {}),
    },
    h("div", { class: "msx-inner" }, ...inner),
  );
}

/**
 * 정적 섹션 하나를 그린다. 그릴 것이 없으면 **null** 이다 —
 * 빈 껍데기 구획이 방문자에게 나가면 고장으로 보인다.
 *
 * 수명이 있는 두 타입(`register-form`·`custom-code`)은 여기서 처리하지 않는다.
 * 그것들은 스크립트를 붙이거나 iframe 을 만들고, 정리할 것이 남는다.
 */
export function renderStaticSection(section: PayloadSection): HTMLElement | null {
  // 카탈로그에 없는 타입은 조용히 버린다 — 옛 발행본에 남아 있을 수 있다.
  if (!sectionDef(section.type)) return null;
  const renderer = STATIC_RENDERERS[section.type];
  if (!renderer) return null;

  const inner = renderer(section).filter(Boolean);
  if (inner.length === 0) return null;
  return sectionShell(section, ...inner);
}
