import { describe, expect, it } from "vitest";
import { LANDING_CSS } from "@/lib/landing/css";

/**
 * 랜딩 배경 모드 CSS 의 불변식.
 *
 * 이 파일이 존재하는 이유는 전부 **실제로 조용히 깨졌던 것들**이다. 렌더 결과를 눈으로
 * 봐야 아는 종류라 브라우저에서 잡았고, 다시 깨지면 알아채기 어려우므로 문자열 수준에서
 * 못박는다. CSS 를 파싱하지 않고 규칙 존재/부재만 본다 — 값의 정확성은 브라우저에서 재야 한다.
 */

describe("섹션 자식의 position 을 건드리지 않는다", () => {
  /**
   * `> * { position: relative }` 로 내용을 가상요소 위에 올렸더니, 그 규칙이
   * `.lnd .scroll-cue`(position:absolute)를 특정도로 이겨(0,3,0 vs 0,2,0) About 하단
   * 셰브론이 흐름에 들어가 오른쪽 끝으로 밀렸다. 기본값에서도 터지는 회귀였다
   * (실측: 중앙 x=670 이어야 하는데 x=1305).
   */
  it("data-bg 섹션의 직계 자식에 position 을 주는 규칙이 없다", () => {
    expect(LANDING_CSS).not.toMatch(/\[data-bg\][^{]*>\s*\*[^{]*\{[^}]*position/);
  });

  it("대신 isolation + z-index:-1 로 가상요소를 뒤에 둔다", () => {
    expect(LANDING_CSS).toMatch(/\[data-bg\][^{]*\{[^}]*isolation:\s*isolate/);
    expect(LANDING_CSS).toMatch(/\[data-bg\]::before\s*,?[\s\S]{0,120}z-index:\s*-1/);
  });

  it("스크롤 큐는 여전히 absolute 로 선언돼 있다", () => {
    expect(LANDING_CSS).toMatch(/\.scroll-cue\s*\{[^}]*position:\s*absolute/);
  });
});

describe("라이트 모드에서 어두운 전제의 장식을 끈다", () => {
  /** 히어로의 검은 원판(::after)이 밝은 바탕에 남아 제목 대비가 1.14:1 이 됐다. */
  it("라이트 히어로는 검은 원판(::after)을 끈다", () => {
    expect(LANDING_CSS).toMatch(/\.hero\[data-bg="light"\]::after\s*\{[^}]*content:\s*none/);
  });

  it("라이트 히어로 링은 키컬러만 쓰고 어두운 stop 을 쓰지 않는다", () => {
    const block = LANDING_CSS.match(/\.hero\[data-bg="light"\]::before\s*\{([^}]*)\}/);
    expect(block).not.toBeNull();
    // --primary-soft 는 키컬러를 검정 쪽으로 섞은 값 — 밝은 바탕에 어두운 띠를 만든다
    expect(block![1]).not.toContain("--primary-soft");
  });
});

describe("라이트 모드 토큰이 배경보다 어두운 쪽으로 파생된다", () => {
  /**
   * 흰색 쪽으로 섞으면 라이트 배경보다 밝아져 판·글자가 사라진다.
   * (--card-2 는 lightBg #f6f8ff 에서 1.03:1, #ffffff 면 완전 동일색이었다.)
   */
  const lightBlock = () => {
    const m = LANDING_CSS.match(/\[data-bg="light"\]\s*\{([\s\S]*?)\}/);
    expect(m).not.toBeNull();
    return m![1];
  };

  it("--card-2 는 --paper 쪽으로 섞는다", () => {
    // 값 안에 var(--bg-light) 가 있어 [^)]* 로는 못 넘는다 — 한 선언 끝(;)까지 본다.
    const decl = lightBlock().match(/--card-2:([^;]*);/);
    expect(decl).not.toBeNull();
    expect(decl![1]).toContain("var(--paper)");
    expect(decl![1]).not.toContain("#ffffff");
  });

  it("--primary-bright 를 모드별로 재선언한다 — 밝은 키컬러가 배경에 붙지 않게", () => {
    expect(lightBlock()).toMatch(/--primary-bright:\s*color-mix/);
  });

  it("--paper 는 mount 가 배경 휘도에서 정한 값을 받는다", () => {
    expect(LANDING_CSS).toMatch(/--paper:\s*var\(--paper-light/);
    expect(LANDING_CSS).toMatch(/--paper:\s*var\(--paper-dark/);
  });
});

describe("미디어 히어로는 모드와 무관하게 어두운 바탕 기준으로 파생된다", () => {
  /**
   * 예전엔 --paper 만 덮었다. 그래서 라이트 히어로 + 어두운 이미지에서 eyebrow 가 쓰는
   * --primary-bright 가 라이트 공식(키컬러를 검정 쪽으로)으로 남아 스크림 위에서 사라졌다
   * (실측 #ff8500: rgb(125,67,5)).
   */
  const mediaBlock = () => {
    const m = LANDING_CSS.match(/\.hero\.hero-has-media\s*\{([\s\S]*?)\}/);
    expect(m).not.toBeNull();
    return m![1];
  };

  it("--primary-bright 를 흰색 쪽으로 재선언한다", () => {
    expect(mediaBlock()).toMatch(/--primary-bright:[^;]*#ffffff/);
  });

  it("--sec-bg 를 어둡게 덮는다 — 파생 토큰이 라이트 배경과 섞이지 않게", () => {
    const decl = mediaBlock().match(/--sec-bg:([^;]*);/);
    expect(decl).not.toBeNull();
    expect(decl![1]).not.toContain("--bg-light");
  });
});

describe("고정 목차는 배경 모드별로 읽을 수 있는 색을 쓴다", () => {
  /**
   * 미디어 히어로 위에서 기본 --muted 는 11px 목차의 일부 픽셀에서 4.17:1까지 내려갔다.
   * 어두운 면에서는 본문색에서 직접 뽑아 이미지 명암 변화에도 여유를 둔다.
   */
  it("어두운 목차 레이어의 비활성 글자는 --paper 에서 파생한다", () => {
    const block = LANDING_CSS.match(
      /\.lnd\.lnd-toc-layer:not\(\.on-accent\)\s+\.toc-link\[data-bg="dark"\]\s*\{([^}]*)\}/,
    );
    expect(block).not.toBeNull();
    expect(block![1]).toMatch(/color:\s*color-mix\([^;]*var\(--paper\)/);
  });

  it("어두운 목차 레이어의 활성 글자는 --paper 를 그대로 쓴다", () => {
    expect(LANDING_CSS).toMatch(
      /\.lnd\.lnd-toc-layer:not\(\.on-accent\)[^{]*\.toc-link\[data-bg="dark"\]\[aria-current="true"\]\s*\{[^}]*color:\s*var\(--paper\)/,
    );
  });
});

describe("항상 어두운 세션 카드는 자체 강조색을 쓴다", () => {
  const sessionCardBlock = () => {
    const m = LANDING_CSS.match(/\.session-card\s*\{([\s\S]*?)\}/);
    expect(m).not.toBeNull();
    return m![1];
  };

  it("브랜드색과 카드의 밝은 글자색에서 --session-accent 를 파생한다", () => {
    const decl = sessionCardBlock().match(/--session-accent:([^;]*);/);
    expect(decl).not.toBeNull();
    expect(decl![1]).toContain("var(--primary)");
    expect(decl![1]).toContain("var(--paper)");
  });

  it("자세히 보기와 포커스 링이 세션 강조색을 공유한다", () => {
    expect(LANDING_CSS).toMatch(/\.session-card\.is-clickable:focus-visible\s*\{[^}]*var\(--session-accent\)/);
    expect(LANDING_CSS).toMatch(/\.session-more\s*\{[^}]*color:\s*var\(--session-accent\)/);
  });
});

describe("판이 배경과 가까워도 형태가 남는다", () => {
  /**
   * 라이트 FAQ 의 예전 면 대비는 1.17:1 이고 그림자는 0 12px 30px / 10%여서,
   * 카드 경계보다 넓은 회색 덩어리가 먼저 보였다.
   */
  it("라이트 모드 FAQ는 흰 카드와 전용 그림자를 쓴다", () => {
    const lightBlock = LANDING_CSS.match(/\[data-bg="light"\]\s*\{([\s\S]*?)\}/);
    expect(lightBlock).not.toBeNull();
    expect(lightBlock![1]).toMatch(/--faq-card:\s*var\(--card\)/);
    expect(lightBlock![1]).toMatch(/--faq-shadow:[^;]*,[^;]*;/);
  });

  it("FAQ 항목은 공용 카드 그림자 대신 FAQ 전용 토큰을 쓴다", () => {
    expect(LANDING_CSS).toMatch(
      /\.faq-item\s*\{[^}]*background:\s*var\(--faq-card\)[^}]*box-shadow:\s*var\(--faq-shadow\)/,
    );
  });
});

describe("키컬러 전환 구간은 배경을 칠하지 않는다", () => {
  /** accent-zone 이 자기 배경을 가지면 on-accent 전환이 가려진다. */
  it("섹션 배경 규칙이 accent-zone 을 제외한다", () => {
    expect(LANDING_CSS).toMatch(/\.section\[data-bg\]:not\(\.accent-zone\)/);
  });

  it("on-accent 는 여전히 루트 배경을 키컬러로 덮는다", () => {
    expect(LANDING_CSS).toMatch(/\.lnd\.on-accent\s*\{\s*background:\s*var\(--primary\)/);
  });
});
