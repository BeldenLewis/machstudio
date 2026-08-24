// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isStaticSectionType, renderStaticSection, sectionShell, type PayloadSection } from "@/lib/expo/view-sections";
import { EXPO_SECTIONS } from "@/lib/expo/registry";

/**
 * 정적 섹션 렌더.
 *
 * 여기 들어오는 값은 이미 `buildExpoPayload` 를 통과했다 — 로케일 맵은 문자열이고,
 * 내부 링크는 실제 주소이거나 빈 문자열이다. 그래서 이 파일이 지켜야 하는 것은 두 가지다:
 * **문자열 HTML 을 쓰지 않는 것**, 그리고 **빈 값으로 껍데기를 만들지 않는 것**.
 */

const section = (over: Partial<PayloadSection> = {}): PayloadSection => ({
  sid: "11111111-1111-1111-1111-111111111111",
  type: "kv",
  variant: "column",
  design: { bg: "light", align: "left" },
  content: { title: "제목" },
  ...over,
});

describe("껍데기", () => {
  it("타입·변형·배경을 data-* 로 싣는다", () => {
    const el = renderStaticSection(section())!;
    expect(el.tagName).toBe("SECTION");
    expect(el.className).toBe("msx-section");
    expect(el.getAttribute("data-type")).toBe("kv");
    expect(el.getAttribute("data-variant")).toBe("column");
    expect(el.getAttribute("data-bg")).toBe("light");
    expect(el.querySelector(".msx-inner")).not.toBeNull();
  });

  /** 섹션 단독 스니펫이 이 값을 참조한다 — 화면에서 어느 섹션인지 짚을 수 있어야 한다. */
  it("sid 를 남긴다", () => {
    expect(renderStaticSection(section())!.getAttribute("data-msx-sid"))
      .toBe("11111111-1111-1111-1111-111111111111");
  });

  /** 노브가 없으면 속성을 만들지 않는다 — CSS 기본값이 그대로 쓰인다. */
  it("배경 노브가 없으면 속성도 없다", () => {
    const el = sectionShell({ ...section(), design: {} });
    expect(el.hasAttribute("data-bg")).toBe(false);
  });
});

describe("키비주얼", () => {
  it("있는 슬롯만 그린다", () => {
    const el = renderStaticSection(section({
      content: { eyebrow: "윗줄", title: "제목", subtitle: "부제" },
    }))!;
    expect(el.querySelector(".msx-kv-eyebrow")!.textContent).toBe("윗줄");
    expect(el.querySelector(".msx-kv-title")!.textContent).toBe("제목");
    expect(el.querySelector(".msx-kv-sub")!.textContent).toBe("부제");
    expect(el.querySelector(".msx-kv-media")).toBeNull();
    expect(el.querySelector(".msx-btn")).toBeNull();
  });

  it("이미지는 지연 로드하고 alt 를 그대로 쓴다", () => {
    const el = renderStaticSection(section({
      content: { title: "제목", media: { url: "https://cdn.test/a.jpg", alt: "히어로" } },
    }))!;
    const image = el.querySelector<HTMLImageElement>(".msx-kv-media")!;
    expect(image.getAttribute("src")).toBe("https://cdn.test/a.jpg");
    expect(image.getAttribute("alt")).toBe("히어로");
    expect(image.getAttribute("loading")).toBe("lazy");
  });

  /** alt 가 비면 장식용이다 — 스크린리더가 파일명을 읽으면 소음이 된다. */
  it("alt 가 없으면 빈 alt 로 장식 처리한다", () => {
    const el = renderStaticSection(section({
      content: { title: "제목", media: { url: "https://cdn.test/a.jpg" } },
    }))!;
    expect(el.querySelector(".msx-kv-media")!.getAttribute("alt")).toBe("");
  });

  /** CSS 가 숨기는 것과 별개로, 받지도 않아야 네트워크 요청이 안 난다. */
  it("텍스트만 변형은 이미지를 아예 만들지 않는다", () => {
    const el = renderStaticSection(section({
      variant: "minimal",
      content: { title: "제목", media: { url: "https://cdn.test/a.jpg" } },
    }))!;
    expect(el.querySelector("img")).toBeNull();
  });

  /** 내부 링크가 안 풀리면 payload 가 href 를 빈 문자열로 준다. */
  it("주소 없는 버튼은 그리지 않는다", () => {
    const el = renderStaticSection(section({
      content: { title: "제목", cta: { label: "신청하기", href: "" } },
    }))!;
    expect(el.querySelector(".msx-btn")).toBeNull();
  });

  it("라벨 없는 버튼도 그리지 않는다", () => {
    const el = renderStaticSection(section({
      content: { title: "제목", cta: { label: "", href: "https://x.test/a" } },
    }))!;
    expect(el.querySelector(".msx-btn")).toBeNull();
  });
});

describe("본문", () => {
  /** 사용자가 쓴 텍스트다 — 줄바꿈이 살아 있어야 한다(CSS 가 pre-wrap 을 건다). */
  it("줄바꿈을 그대로 담는다", () => {
    const el = renderStaticSection(section({
      type: "textblock", variant: "prose",
      content: { heading: "안내", body: "첫 줄\n둘째 줄" },
    }))!;
    const body = el.querySelector(".msx-text-body")!;
    expect(body.textContent).toBe("첫 줄\n둘째 줄");
    expect(body.classList.contains("msx-prose")).toBe(true);
  });

  /** 제목 위계는 한 이름으로 둔다 — 본문과 카드가 같은 클래스를 쓴다. */
  it("구획 제목은 공용 클래스다", () => {
    const el = renderStaticSection(section({
      type: "textblock", variant: "prose", content: { heading: "안내", body: "본문" },
    }))!;
    expect(el.querySelector(".msx-heading")!.textContent).toBe("안내");
  });
});

describe("카드", () => {
  it("링크가 있는 카드만 링크로 그린다", () => {
    const el = renderStaticSection(section({
      type: "cardgrid", variant: "multicolumn",
      content: {
        heading: "프로그램",
        items: [
          { title: "A", link: { label: "보기", href: "https://x.test/a" } },
          { title: "B" },
        ],
      },
    }))!;
    const cards = el.querySelectorAll(".msx-card");
    expect(cards).toHaveLength(2);
    expect(cards[0].tagName).toBe("A");
    // 못 누르는 카드가 눌릴 것처럼 보이면 안 되고, 빈 <a> 는 키보드 탐색에 헛걸음을 만든다.
    expect(cards[1].tagName).toBe("DIV");
  });

  it("행이 하나도 없으면 격자를 만들지 않는다", () => {
    const el = renderStaticSection(section({
      type: "cardgrid", variant: "multicolumn", content: { heading: "프로그램", items: [] },
    }))!;
    expect(el.querySelector(".msx-cards")).toBeNull();
    expect(el.querySelector(".msx-heading")).not.toBeNull();
  });
});

describe("퀵 액션", () => {
  it("이름과 주소가 다 있는 것만 그린다", () => {
    const el = renderStaticSection(section({
      type: "toolbox", variant: "tiles",
      content: {
        items: [
          { label: "사전등록", link: { label: "사전등록", href: "https://x.test/r" } },
          { label: "안내", link: { label: "안내", href: "" } },
          { label: "", link: { label: "x", href: "https://x.test/b" } },
        ],
      },
    }))!;
    expect(el.querySelectorAll(".msx-tool")).toHaveLength(1);
  });

  /** 하나도 못 그리면 빈 구획이 남는다 — 방문자에게 고장으로 보인다. */
  it("하나도 못 그리면 섹션 자체를 만들지 않는다", () => {
    expect(renderStaticSection(section({
      type: "toolbox", variant: "tiles", content: { items: [{ label: "x", link: { href: "" } }] },
    }))).toBeNull();
  });
});

describe("그리지 않는 것", () => {
  /** 수명이 있는 둘은 스크립트·iframe 을 만들고 정리할 것이 남는다 — 자기 모듈이 맡는다. */
  it("등록 폼과 직접 넣은 코드는 여기서 안 그린다", () => {
    expect(isStaticSectionType("register-form")).toBe(false);
    expect(isStaticSectionType("custom-code")).toBe(false);
    expect(renderStaticSection(section({ type: "register-form", variant: "inline", content: {} }))).toBeNull();
  });

  /** 옛 발행본에 남아 있을 수 있다 — 조용히 버린다. */
  it("카탈로그에 없는 타입은 버린다", () => {
    expect(renderStaticSection(section({ type: "nope" }))).toBeNull();
  });

  it("카탈로그의 여섯 타입을 빠짐없이 다룬다", () => {
    const handled = EXPO_SECTIONS.filter((d) => isStaticSectionType(d.type)).map((d) => d.type);
    expect(handled.sort()).toEqual(["cardgrid", "kv", "textblock", "toolbox"]);
    expect(EXPO_SECTIONS).toHaveLength(6);
  });
});

describe("호스트 문서 안전", () => {
  /**
   * Shadow 경계는 **CSS 를 막지 XSS 를 막지 않는다.** 여기서 만든 노드가 그대로
   * 파트너 문서 안에서 산다 — 텍스트는 항상 텍스트로 들어가야 한다.
   */
  it("사용자 텍스트를 마크업으로 해석하지 않는다", () => {
    const el = renderStaticSection(section({
      type: "textblock", variant: "prose",
      content: { heading: "<img src=x onerror=alert(1)>", body: "<script>alert(2)</script>" },
    }))!;
    expect(el.querySelector("img")).toBeNull();
    expect(el.querySelector("script")).toBeNull();
    expect(el.querySelector(".msx-heading")!.textContent).toBe("<img src=x onerror=alert(1)>");
  });

  /**
   * 주소 없는 <a> 는 키보드로 도달은 되는데 아무 일도 안 일어난다 —
   * 속성만 빼는 게 아니라 요소를 아예 만들지 않는다.
   */
  it("javascript: 주소는 버튼 자체를 만들지 않는다", () => {
    const el = renderStaticSection(section({
      content: { title: "제목", cta: { label: "누르기", href: "javascript:alert(1)" } },
    }))!;
    expect(el.querySelector(".msx-btn")).toBeNull();
  });

  it("data: 주소도 마찬가지다", () => {
    const el = renderStaticSection(section({
      type: "cardgrid", variant: "multicolumn",
      content: { items: [{ title: "A", link: { label: "보기", href: "data:text/html,<script>1</script>" } }] },
    }))!;
    expect(el.querySelector(".msx-card")!.tagName).toBe("DIV");
  });
});
