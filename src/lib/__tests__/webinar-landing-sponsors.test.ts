// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { DEFAULT_LANDING_SPONSORS_TITLE, normalizeLandingPageConfig } from "@/lib/webinar-config";
import { buildLandingModel } from "@/lib/landing/build-model";
import { renderSponsors } from "@/lib/landing/view-sections";
import { TOC_DEF } from "@/lib/landing/model";
import { IMAGE_PRESETS, transformedImageUrl } from "@/lib/webinar-image";
import { LANDING_CSS } from "@/lib/landing/css";
import type { LandingWebinar } from "@/lib/landing/types";

/**
 * 스폰서 섹션 — 페이지 **최하단** 로고 벽.
 *
 * 다른 섹션들과 같은 규칙을 쓰는지 고정한다(이중 게이트 · keepEmptyRows · 머리글 폴백은 모델에서),
 * 그리고 이 섹션에만 있는 두 가지를 고정한다:
 *   · URL 두 개(로고 src · 링크 href)가 **파트너 사이트 DOM 에 그대로 들어간다** → http(s) 만.
 *   · tier 묶기는 **등장 순서**다. 정렬하면 "후원" 이 "주최" 앞에 오는 식으로 사실이 뒤집힌다.
 */

const webinar = (landing: Record<string, unknown>): LandingWebinar => ({
  id: "t", name: "테스트 웨비나", slug: "t", description: null,
  liveStartAt: "2026-08-20T10:00:00.000Z",
  theme: { accentColor: "#6d28d9" },
  config: { landingPage: { enabled: true, ...landing } },
  sessions: [],
});
const model = (landing: Record<string, unknown>) =>
  buildLandingModel(webinar(landing), { uid: "x", embedded: false, isPreview: true, origin: "" });

const lp = (landingPage: unknown) => normalizeLandingPageConfig({ landingPage });

const SPONSOR = (over: Record<string, unknown> = {}) => ({
  tier: "", name: "엑스포럼", logoUrl: "", url: "", ...over,
});

describe("이중 게이트 — 토글 ON + 이름 있는 항목 ≥ 1", () => {
  /**
   * 이 섹션만 **기본 OFF** 다. 다른 섹션(intro·audience·programs…)은 랜딩 기능과 **함께**
   * 나와서 그때는 랜딩을 켠 웨비나가 0개였고(랜딩이 꺼져 있으면 노출 표가 모든 랜딩 행을
   * off 로 본다), 그래서 기본 ON 이어도 소급 경고를 만들 수 없었다. 스폰서는 이미 랜딩을
   * 켜고 다 채워 둔 웨비나가 있는 상태에서 나오므로, 기본 ON 이면 그 웨비나들이 아무 조작도
   * 안 했는데 "켰지만 항목이 없어요" 경고를 받는다.
   */
  it("sponsors 키가 없는 옛 config 는 기본 OFF — 기존 웨비나에 새 경고를 만들지 않는다", () => {
    expect(lp({}).sponsors.enabled).toBe(false);
    expect(lp({}).sponsors.items).toEqual([]);
    expect(model({}).showSponsors).toBe(false);
  });

  it("항목이 있어도 토글이 꺼져 있으면 안 나간다", () => {
    expect(model({ sponsors: { enabled: false, items: [SPONSOR()] } }).showSponsors).toBe(false);
  });

  it("토글 ON + 항목 1개면 나간다", () => {
    expect(model({ sponsors: { enabled: true, items: [SPONSOR()] } }).showSponsors).toBe(true);
  });

  it("이름 없는 행만 있으면 안 나간다 — 로고만 있는 행은 alt 가 비어 스크린리더에 안 남는다", () => {
    const m = model({
      sponsors: { enabled: true, items: [SPONSOR({ name: "  ", logoUrl: "https://cdn.io/a.png" })] },
    });
    expect(m.showSponsors).toBe(false);
  });
});

describe("편집 중에는 빈 행도 살린다(keepEmptyRows)", () => {
  it("이름 없는 행이 공개 렌더에서만 빠진다 — 타이핑 중 행이 사라지면 다음 자동저장이 덮어써 영구 소실된다", () => {
    const raw = {
      landingPage: {
        enabled: true,
        sponsors: { enabled: true, items: [SPONSOR({ name: "엑스포럼" }), SPONSOR({ name: "" })] },
      },
    };
    expect(normalizeLandingPageConfig(raw, { keepEmptyRows: true }).sponsors.items).toHaveLength(2);
    expect(normalizeLandingPageConfig(raw).sponsors.items).toHaveLength(1);
  });
});

describe("머리글 폴백은 모델에서 한 번만", () => {
  it("정규화는 원문을 통과시킨다 — 기본 문구를 나중에 고치면 저장 안 한 웨비나에도 반영되게", () => {
    expect(lp({ sponsors: { items: [] } }).sponsors.title).toBe("");
  });

  it("비었거나 공백만이면 기본 문구가 나간다", () => {
    for (const title of ["", "   ", undefined]) {
      const m = model({ sponsors: { enabled: true, title, items: [SPONSOR()] } });
      expect(m.sponsorsTitle, JSON.stringify(title)).toBe(DEFAULT_LANDING_SPONSORS_TITLE);
    }
  });

  it("적은 값이 이긴다", () => {
    expect(model({ sponsors: { enabled: true, title: "후원사", items: [SPONSOR()] } }).sponsorsTitle).toBe("후원사");
  });
});

describe("URL 두 개 — http(s) 만 통과한다", () => {
  /** 두 값 다 파트너 사이트 DOM 에 들어간다(로고 src · 링크 href). 여기가 유일한 관문이다. */
  it("javascript:·data:·상대경로는 빈 값이 된다", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,<script>", "/relative.png", "not-a-url", "ftp://x.io"]) {
      const out = lp({ sponsors: { enabled: true, items: [SPONSOR({ logoUrl: bad, url: bad })] } });
      expect(out.sponsors.items[0].logoUrl, bad).toBe("");
      expect(out.sponsors.items[0].url, bad).toBe("");
    }
  });

  it("http(s) 는 그대로 통과", () => {
    const out = lp({
      sponsors: { enabled: true, items: [SPONSOR({ logoUrl: "https://cdn.io/a.png", url: "http://x.io" })] },
    });
    expect(out.sponsors.items[0].logoUrl).toBe("https://cdn.io/a.png");
    expect(out.sponsors.items[0].url).toBe("http://x.io");
  });

  it("URL 이 걸러져도 이름이 남아 있으면 항목 자체는 살아 있다", () => {
    const out = lp({ sponsors: { enabled: true, items: [SPONSOR({ name: "엑스포럼", logoUrl: "javascript:x" })] } });
    expect(out.sponsors.items).toHaveLength(1);
    expect(out.sponsors.items[0].name).toBe("엑스포럼");
  });
});

describe("tier 묶기 — 등장 순서 유지", () => {
  const grouped = (items: Record<string, unknown>[]) =>
    model({ sponsors: { enabled: true, items } }).sponsorGroups;

  it("가나다 정렬을 하지 않는다 — '주최' 다음이 '후원' 이라는 사실이 뒤집히면 안 된다", () => {
    const groups = grouped([
      SPONSOR({ tier: "주최", name: "A" }),
      SPONSOR({ tier: "후원", name: "B" }),
      SPONSOR({ tier: "주최", name: "C" }),
    ]);
    expect(groups.map((g) => g.tier)).toEqual(["주최", "후원"]);
    // 같은 묶음의 항목은 원래 순서대로 이어 붙는다(운영자가 끈 드래그 순서가 곧 노출 순서)
    expect(groups[0].items.map((i) => i.name)).toEqual(["A", "C"]);
  });

  it("tier 가 전부 비면 라벨 없는 한 묶음", () => {
    const groups = grouped([SPONSOR({ name: "A" }), SPONSOR({ name: "B" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].tier).toBe("");
    expect(groups[0].items).toHaveLength(2);
  });

  it("공백만 있는 tier 는 라벨 없음과 같은 묶음이다", () => {
    const groups = grouped([SPONSOR({ tier: "  ", name: "A" }), SPONSOR({ tier: "", name: "B" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].tier).toBe("");
  });
});

describe("렌더", () => {
  const render = (landing: Record<string, unknown>) => renderSponsors(model(landing));

  it("안 나가는 조건이면 null — 빈 껍데기를 시청자에게 노출하지 않는다", () => {
    expect(render({ sponsors: { enabled: false, items: [SPONSOR()] } })).toBeNull();
    expect(render({ sponsors: { enabled: true, items: [] } })).toBeNull();
  });

  it("로고가 있으면 img + alt=이름, 변환 URL 로 요청한다(원본 서빙 금지)", () => {
    const url = "https://p.supabase.co/storage/v1/object/public/webinar-assets/a.png";
    const el = render({ sponsors: { enabled: true, items: [SPONSOR({ name: "엑스포럼", logoUrl: url })] } })!;
    const img = el.querySelector("img.sponsor-logo") as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.getAttribute("alt")).toBe("엑스포럼");
    expect(img.getAttribute("src")).toBe(transformedImageUrl(url, IMAGE_PRESETS.sponsorLogo));
    // 최하단이라 항상 fold 아래다
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  it("로고가 없으면 이름 글자 칩", () => {
    const el = render({ sponsors: { enabled: true, items: [SPONSOR({ name: "엑스포럼" })] } })!;
    expect(el.querySelector("img")).toBeNull();
    expect(el.querySelector(".sponsor-name")?.textContent).toBe("엑스포럼");
  });

  /**
   * 글자 칩은 판이 **자라야** 한다. 로고 칸처럼 높이를 고정하면 긴 기관명이 흰 판 밖으로
   * 새고, 하드코딩된 잉크색(#1b2130)이 다크 배경 위에서 그대로 사라진다
   * (실측: "사단법인한국전시산업진흥회사무국" 이 184px 판에서 오른쪽으로 39px).
   * CSS `:has()` 대신 클래스로 가르는 이유 — 이 CSS 는 남의 사이트에서 실행된다.
   */
  it("로고 없는 칩만 is-text 를 받는다 — 판이 줄 수에 따라 자라게", () => {
    const chip = render({ sponsors: { enabled: true, items: [SPONSOR({ name: "사단법인한국전시산업진흥회사무국" })] } })!;
    expect(chip.querySelector(".sponsor-tile")!.className).toContain("is-text");

    const withLogo = render({ sponsors: { enabled: true, items: [SPONSOR({ logoUrl: "https://cdn.io/a.png" })] } })!;
    expect(withLogo.querySelector(".sponsor-tile")!.className).not.toContain("is-text");
  });

  it("링크가 있으면 a, 없으면 div — 누를 수 없는 것을 링크처럼 보이게 하지 않는다", () => {
    const withLink = render({ sponsors: { enabled: true, items: [SPONSOR({ url: "https://x.io" })] } })!;
    const a = withLink.querySelector("a.sponsor-tile") as HTMLAnchorElement;
    expect(a.getAttribute("href")).toBe("https://x.io");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");

    const noLink = render({ sponsors: { enabled: true, items: [SPONSOR()] } })!;
    expect(noLink.querySelector("a")).toBeNull();
    expect(noLink.querySelector("div.sponsor-tile")).not.toBeNull();
  });

  it("tier 라벨이 있으면 그리고, 없으면 안 그린다", () => {
    const labeled = render({ sponsors: { enabled: true, items: [SPONSOR({ tier: "주최" })] } })!;
    expect(labeled.querySelector(".sponsor-tier")?.textContent).toBe("주최");
    expect(labeled.querySelector(".sponsor-grid")?.getAttribute("aria-label")).toBe("주최");

    const plain = render({ sponsors: { enabled: true, items: [SPONSOR()] } })!;
    expect(plain.querySelector(".sponsor-tier")).toBeNull();
    expect(plain.querySelector(".sponsor-grid")?.getAttribute("aria-label")).toBeNull();
  });

  it("섹션 id 에 uid 접두가 붙는다 — 한 문서에 랜딩이 둘 붙어도 id 가 안 부딪히게", () => {
    const el = render({ sponsors: { enabled: true, items: [SPONSOR()] } })!;
    expect(el.id).toBe("x-lnd-sponsors");
    expect(el.getAttribute("aria-labelledby")).toBe("x-lnd-sponsors-title");
    expect(el.querySelector("h2")?.id).toBe("x-lnd-sponsors-title");
  });
});

/**
 * CSS 는 문자열이라 jsdom 이 계산해 주지 않는다 — 실측(실제 브라우저)으로 확인한 규칙이
 * 번들에 **남아 있는지**만 여기서 고정한다. 이게 빠지면 긴 이름이 조용히 판 밖으로 샌다.
 */
describe("글자 칩 넘침 방지 규칙이 CSS 에 살아 있다", () => {
  it("is-text 판은 높이 auto + min-height", () => {
    expect(LANDING_CSS).toContain(".sponsor-tile.is-text { height: auto; min-height: 44px; }");
    // 모바일에서 줄이 더 자주 늘어나므로 거기서 더 필요하다
    expect(LANDING_CSS).toContain(".sponsor-tile.is-text { height: auto; min-height: 36px; }");
  });

  it("이름은 넘칠 때 끊기고, 자동 트랙이 슬롯보다 커지지 않는다", () => {
    // keep-all 이 먼저(한국어 어절 단위), anywhere 는 넘칠 때만 개입
    expect(LANDING_CSS).toContain("word-break: keep-all; overflow-wrap: anywhere;");
    expect(LANDING_CSS).toMatch(/\.sponsor-name[\s\S]*?\{[^}]*width: 100%/);
  });
});

describe("목차", () => {
  it("정의에 있고 **맨 끝**이다 — 페이지 최하단 섹션이니 목차에서도 마지막", () => {
    expect(TOC_DEF.at(-1)).toEqual({ id: "lnd-sponsors", label: "Sponsors" });
  });

  it("스폰서가 없으면 목차에도 안 뜬다", () => {
    expect(model({}).tocItems.some((t) => t.id === "lnd-sponsors")).toBe(false);
    const shown = model({ sponsors: { enabled: true, items: [SPONSOR()] } });
    expect(shown.tocItems.some((t) => t.id === "lnd-sponsors")).toBe(true);
  });
});
