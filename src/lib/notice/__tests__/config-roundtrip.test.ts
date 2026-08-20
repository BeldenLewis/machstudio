import { describe, expect, it } from "vitest";
import { normalizeCompetitionConfig } from "@/lib/competition-config";
import { normalizeNoticePageConfig } from "@/lib/notice/config";

/**
 * 저장 왕복 — **공고 내용이 저장하면서 사라지지 않는가.**
 *
 * PATCH /api/competitions/[id] 는 normalizeCompetitionConfig 의 **결과를 그대로 저장한다.**
 * 그래서 그 함수가 모르는 키는 저장 시점에 조용히 없어진다. 실제로 그랬다 — 공고 편집 탭을
 * 만들고 저장을 눌렀더니 입력한 내용이 통째로 날아갔고, 화면에는 "저장했어요" 가 떴다.
 *
 * 화면 테스트로는 안 잡히는 종류라(저장은 성공하고 다음 로드에서야 빈 값이 보인다) 계약 수준에서 막는다.
 */

const filled = {
  notice: { heroTitle: "옛 블록 빌더", blocks: [] },
  form: { title: "참가 신청" },
  noticePage: {
    enabled: true,
    language: "en",
    colors: { lightBg: "#ffffff", darkBg: "#000000", accentAlt: "#22c55e", button: "#2563eb" },
    sectionBg: { hero: "light", concept: "dark" },
    hero: {
      brand: "K-EXPO LA",
      titleLines: ["Own", "the Stage."],
      subtitle: "부제",
      ctaLabel: "참가 신청하기",
      upcomingLabel: "Opens Sep 1",
      upcomingNote: "Doors open at 9am PT.",
      secondaryLabel: "일정 보기",
      facts: [{ label: "결선", value: "10/24" }],
      media: { type: "image", url: "https://example.com/hero.jpg" },
    },
    timeline: {
      enabled: true,
      title: "모집 일정",
      items: [{ date: "9/1", title: "접수 시작", description: "", emphasis: true }],
    },
    prizes: { enabled: true, items: [{ rank: "1st", title: "대상", description: "", amount: "$1,000" }] },
  },
};

describe("대회 설정 저장 왕복", () => {
  it("공고 페이지가 정규화를 통과해도 남는다", () => {
    const saved = normalizeCompetitionConfig(filled, { includeDisabled: true });
    expect(saved.noticePage.enabled).toBe(true);
    expect(saved.noticePage.hero.titleLines).toEqual(["Own", "the Stage."]);
    // 초점이 함께 남아야 한다 — 모바일에서 어디를 보여 줄지 맞춰 둔 값이 저장에 사라지면
    // 저장할 때마다 사진이 가운데로 돌아간다.
    expect(saved.noticePage.hero.media).toEqual({
      type: "image",
      url: "https://example.com/hero.jpg",
      focus: { x: 50, y: 50 },
      mobileFocus: { x: 50, y: 50 },
    });
    expect(saved.noticePage.timeline.items).toHaveLength(1);
    expect(saved.noticePage.prizes.items[0].amount).toBe("$1,000");
    // 언어도 저장을 통과해야 한다 — 이게 빠지면 저장할 때마다 공고가 한글로 되돌아간다.
    expect(saved.noticePage.language).toBe("en");
    // 접수 상태 문구도 저장을 통과해야 한다 — 정규화가 모르는 키는 저장 시점에 사라진다.
    expect(saved.noticePage.hero.upcomingLabel).toBe("Opens Sep 1");
    expect(saved.noticePage.hero.upcomingNote).toBe("Doors open at 9am PT.");
    expect(saved.noticePage.colors.accentAlt).toBe("#22c55e");
    expect(saved.noticePage.colors.button).toBe("#2563eb");
  });

  /** 섹션 배경과 초점도 저장을 통과해야 한다 — 정규화가 모르는 키는 저장 시점에 사라진다. */
  it("섹션 배경 이미지와 초점이 저장에 남는다", () => {
    const saved = normalizeCompetitionConfig(
      {
        noticePage: {
          enabled: true,
          sectionMedia: {
            timeline: {
              url: "https://example.com/bg.jpg",
              focus: { x: 20, y: 80 }, mobileFocus: { x: 70, y: 10 },
              scrim: 40, panel: 95,
            },
            // 주소가 없으면 키를 만들지 않는다 — "켰는데 빈 배경" 상태를 안 만든다.
            prizes: { url: "  ", focus: { x: 10, y: 10 } },
          },
        },
      },
      { includeDisabled: true },
    );
    expect(saved.noticePage.sectionMedia.timeline).toEqual({
      url: "https://example.com/bg.jpg",
      focus: { x: 20, y: 80 },
      mobileFocus: { x: 70, y: 10 },
      scrim: 40,
      panel: 95,
    });
    expect(saved.noticePage.sectionMedia.prizes).toBeUndefined();
  });

  /**
   * 안 정한 색은 **빈 문자열로 남아야** 한다. 여기서 키컬러를 복사해 넣어 버리면
   * 나중에 키컬러를 바꿔도 보조·버튼만 옛날 색으로 남는다 — 화면을 봐야만 아는 종류다.
   */
  it("보조·버튼 색을 안 정하면 비어 있다 — 키컬러를 따라가야 한다", () => {
    const saved = normalizeCompetitionConfig({ noticePage: { enabled: true } }, { includeDisabled: true });
    expect(saved.noticePage.colors.accentAlt).toBe("");
    expect(saved.noticePage.colors.button).toBe("");
  });

  it("언어를 안 적었으면 한국어 — 기존 대회가 저장 한 번에 영어로 바뀌면 안 된다", () => {
    const saved = normalizeCompetitionConfig({ noticePage: { enabled: true } }, { includeDisabled: true });
    expect(saved.noticePage.language).toBe("ko");
  });

  it("두 번 정규화해도 값이 안 줄어든다 — 저장·로드를 반복해도 같아야 한다", () => {
    const once = normalizeCompetitionConfig(filled, { includeDisabled: true });
    const twice = normalizeCompetitionConfig(once, { includeDisabled: true });
    expect(twice.noticePage).toEqual(once.noticePage);
  });

  it("예전 블록 빌더 내용도 함께 남는다 — 새 빌더가 옛 대회를 지우면 안 된다", () => {
    const saved = normalizeCompetitionConfig(filled, { includeDisabled: true });
    expect(saved.notice.heroTitle).toBe("옛 블록 빌더");
  });

  it("공고 설정이 아예 없던 대회도 완전한 기본값을 받는다", () => {
    const saved = normalizeCompetitionConfig({ form: {} }, { includeDisabled: true });
    expect(saved.noticePage.enabled).toBe(false);
    expect(saved.noticePage.sectionBg.hero).toBe("dark");
    expect(saved.noticePage.colors.darkBg).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("섹션 정규화가 competition-config 를 거칠 때와 직접 부를 때 같다", () => {
    expect(normalizeCompetitionConfig(filled, { includeDisabled: true }).noticePage).toEqual(
      normalizeNoticePageConfig(filled, { keepEmptyRows: true }),
    );
  });
});
