// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildNoticeModel } from "@/lib/notice/build-model";
import { normalizeNoticePageConfig } from "@/lib/notice/config";
import { NOTICE_CSS } from "@/lib/notice/css";
import { renderHero } from "@/lib/notice/view-hero";
import type { NoticeCompetition } from "@/lib/notice/types";

/**
 * 히어로 배경 마크업이 껍데기 CSS 와 맞물리는가.
 *
 * 껍데기(랜딩에서 추출)는 **감싸는 상자 + 안쪽 미디어** 구조를 전제로 쓰였다:
 *   .hero-media img { width:100%; height:100%; object-fit:cover }
 *   .hero-media.has-media::after { …어두운 스크림… }
 *
 * 공고는 class="hero-media" 를 **이미지에 직접** 걸고 있었다. 자손 선택자가 하나도 안 걸려서
 * 크기·object-fit 이 안 먹고(실측 1265×844 를 fill 로 늘림, 히어로는 720) 스크림도 안 생겼다.
 * 운영자 눈에는 "배경을 올렸는데 적용이 안 된다"로 보였다 — 업로드는 멀쩡했는데.
 *
 * CSS 는 자동 생성물이라 이쪽에서 못 고친다. 그러니 **마크업이 CSS 를 따라가야** 하고,
 * 그 계약을 여기 못박는다.
 */
const competition: NoticeCompetition = {
  id: "c1",
  name: "테스트 대회",
  description: null,
  theme: { accentColor: "#e2532c" },
  recruitOpenAt: null,
  recruitCloseAt: null,
  phase: "recruiting",
  canApply: true,
  statusMessages: { upcoming: "", closed: "" },
  rounds: [],
};

/** 초점 값이 CSS 변수로 실려 나가는가 — 인라인 스타일로는 미디어 쿼리를 못 쓴다. */
const focusVarsOf = (el: Element | null) => {
  const style = (el as HTMLElement | null)?.getAttribute("style") ?? "";
  return Object.fromEntries(
    style.split(";").map((d) => d.split(":").map((x) => x.trim())).filter((p) => p[0]?.startsWith("--")),
  );
};

const heroWith = (media: unknown) =>
  renderHero(
    buildNoticeModel(
      competition,
      normalizeNoticePageConfig({ noticePage: { enabled: true, hero: { media } } }),
      { uid: "u1", embedded: false, isPreview: true },
    ),
    () => {},
  );

describe("히어로 배경", () => {
  it("이미지는 .hero-media 상자 **안에** 들어간다 — 상자에 클래스, 이미지는 자식", () => {
    const hero = heroWith({ type: "image", url: "https://example.com/a.jpg" });
    const box = hero.querySelector(".hero-media");
    expect(box).not.toBeNull();
    expect(box!.tagName).toBe("DIV");
    // 이미지 자신이 .hero-media 이면 자손 선택자가 전부 빗나간다.
    expect(hero.querySelector("img.hero-media")).toBeNull();
    expect(box!.querySelector("img")).not.toBeNull();
  });

  it("배경이 있으면 has-media 가 붙는다 — 스크림이 그것으로 걸린다", () => {
    const hero = heroWith({ type: "image", url: "https://example.com/a.jpg" });
    expect(hero.querySelector(".hero-media")!.classList.contains("has-media")).toBe(true);

    const none = heroWith(null);
    expect(none.querySelector(".hero-media")!.classList.contains("has-media")).toBe(false);
  });

  it("영상도 같은 구조를 쓴다", () => {
    const hero = heroWith({ type: "video", url: "https://example.com/a.mp4" });
    const box = hero.querySelector(".hero-media")!;
    expect(box.tagName).toBe("DIV");
    expect(box.querySelector("video")).not.toBeNull();
    expect(hero.querySelector("video.hero-media")).toBeNull();
  });

  it("초점을 CSS 변수로 싣는다 — PC 와 모바일 값이 따로 나간다", () => {
    const hero = heroWith({
      type: "image", url: "https://example.com/a.jpg",
      focus: { x: 20, y: 80 }, mobileFocus: { x: 65, y: 10 },
    });
    expect(focusVarsOf(hero.querySelector(".hero-media img"))).toEqual({
      "--fx": "20%", "--fy": "80%", "--mfx": "65%", "--mfy": "10%",
    });
  });

  it("범위를 벗어난 초점은 잘라 낸다 — 밖으로 나가면 이미지가 화면에서 사라진다", () => {
    const hero = heroWith({
      type: "image", url: "https://example.com/a.jpg",
      focus: { x: -30, y: 900 }, mobileFocus: { x: 50, y: 50 },
    });
    const vars = focusVarsOf(hero.querySelector(".hero-media img"));
    expect(vars["--fx"]).toBe("0%");
    expect(vars["--fy"]).toBe("100%");
  });

  /** CSS 쪽 계약 — 이 선택자가 사라지면 위 구조를 맞춰도 소용이 없다. */
  it("껍데기 CSS 는 여전히 자손 선택자로 크기를 준다", () => {
    expect(NOTICE_CSS).toMatch(/\.hero-media img[^{]*\{[^}]*object-fit:\s*cover/);
    expect(NOTICE_CSS).toMatch(/\.hero-media\.has-media::after/);
  });

  /**
   * 좁은 화면에서 모바일 초점으로 갈아타는 규칙이 살아 있는가.
   * 이게 없으면 값만 실려 나가고 화면은 그대로다 — 고쳐도 안 바뀌는 종류의 버그다.
   */
  it("좁은 화면에서는 모바일 초점 변수로 바꾼다", () => {
    // 좁은 화면 블록은 **하나가 아니다** — 껍데기(추출본)와 이 파일의 것이 각각 있다.
    // 첫 번째만 보면 규칙이 멀쩡히 있는데도 못 찾는다(실제로 그랬다).
    const mobileBlocks = NOTICE_CSS.split("@media (max-width: 760px)").slice(1);
    expect(mobileBlocks.length).toBeGreaterThan(0);
    expect(mobileBlocks.some((block) => /object-position:\s*var\(--mfx/.test(block))).toBe(true);
  });

  /** 사진 위에 글자를 얹으면 밝은 부분에서 글이 사라진다 — 스크림은 선택이 아니다. */
  it("섹션 배경에는 스크림이 깔린다", () => {
    expect(NOTICE_CSS).toMatch(/\.nt-bg::after/);
    expect(NOTICE_CSS).toMatch(/\.nt-bg img[^{]*\{[^}]*object-fit:\s*cover/);
  });

  /**
   * 사진 위 카드가 읽히는가.
   *
   * 카드들은 평평한 색 위를 전제로 --paper 5% 옅은 막으로 그려져 있다. 뒤에 사진이 깔리면
   * 그 막이 사실상 투명해서 카드가 사라진다 — 실제로 배경을 넣은 섹션이 그렇게 보였다.
   * 배경을 켠 섹션에서만 **섹션색**으로 바꾸고, 진하기는 운영자가 정한다.
   */
  it("배경을 켠 섹션의 카드는 섹션색 바탕을 쓴다 — 진하기는 변수로 조절된다", () => {
    // 정규식 대신 문자열로 본다 — 템플릿 리터럴 안의 \b 는 단어 경계가 아니라 백스페이스 문자다.
    for (const card of ["nt-round", "nt-step", "nt-prize", "nt-elig", "nt-stat", "nt-cd-box"]) {
      expect(NOTICE_CSS, card).toContain(`.section.has-bg .${card}`);
    }
    // 글자색(--paper)이 아니라 배경색(--sec-bg)이어야 라이트/다크 어느 쪽이든 대비가 산다.
    expect(NOTICE_CSS).toMatch(/color-mix\(in srgb, var\(--sec-bg\) var\(--panel-a/);
    expect(NOTICE_CSS).toMatch(/color-mix\(in srgb, var\(--sec-bg\) var\(--scrim-a/);
  });
});
