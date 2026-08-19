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

  /** CSS 쪽 계약 — 이 선택자가 사라지면 위 구조를 맞춰도 소용이 없다. */
  it("껍데기 CSS 는 여전히 자손 선택자로 크기를 준다", () => {
    expect(NOTICE_CSS).toMatch(/\.hero-media img[^{]*\{[^}]*object-fit:\s*cover/);
    expect(NOTICE_CSS).toMatch(/\.hero-media\.has-media::after/);
  });
});
