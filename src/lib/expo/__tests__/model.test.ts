import { describe, expect, it } from "vitest";
import { normalizeExpoPage } from "@/lib/expo/config";
import {
  derivePageState, hasContent, homePageDefaults, renderableSections,
  slugFromTitle, standaloneSection,
} from "@/lib/expo/model";

/**
 * **무엇이 공개로 나가고 무엇이 안 나가는가.**
 *
 * 판정이 두 곳에 있으면 화면은 "공개중" 인데 로더는 아무것도 안 주는 상태가 반드시 생긴다.
 * 그래서 목록·트리 상태점·이행 현황·로더가 전부 이 모듈만 읽는다.
 */

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const sec = (n: number, over: Record<string, unknown> = {}) => ({
  sid: uid(n), type: "textblock", variant: "prose",
  content: { body: `본문 ${n}` }, ...over,
});

const published = (sections: unknown[]) => normalizeExpoPage({ sections });

describe("hasContent — 이중 게이트의 '내용 있음'", () => {
  it("필수 슬롯이 차야 내용이 있다", () => {
    const [filled] = normalizeExpoPage({ sections: [sec(1)] }).sections;
    expect(hasContent(filled)).toBe(true);

    const empty = { ...filled, content: {} };
    expect(hasContent(empty)).toBe(false);
  });

  /** 제목 없는 히어로는 빈 껍데기다 — 배경만 깔린 채로 시청자에게 나가면 안 된다. */
  it("키비주얼은 제목이 없으면 내용이 없다", () => {
    const withMedia = normalizeExpoPage({ sections: [{
      sid: uid(1), type: "kv", variant: "column",
      content: { media: { kind: "image", url: "https://x.test/a.jpg" } },
    }] }).sections[0];
    expect(hasContent(withMedia)).toBe(false);

    const withTitle = normalizeExpoPage({ sections: [{
      sid: uid(1), type: "kv", variant: "column", content: { title: "제목" },
    }] }).sections[0];
    expect(hasContent(withTitle)).toBe(true);
  });

  /** 필수 슬롯이 없는 타입은 아무거나 하나 차면 된다. */
  it("퀵 액션은 버튼이 하나라도 있으면 내용이 있다", () => {
    const none = normalizeExpoPage({ sections: [{ sid: uid(1), type: "toolbox", variant: "tiles", content: {} }] }).sections[0];
    expect(hasContent(none)).toBe(false);

    const one = normalizeExpoPage({ sections: [{
      sid: uid(1), type: "toolbox", variant: "tiles",
      content: { items: [{ label: "사전등록", link: { label: "가기", href: "https://x.test" } }] },
    }] }).sections[0];
    expect(hasContent(one)).toBe(true);
  });
});

describe("derivePageState — 발행과 공개는 다른 문", () => {
  it("세 상태를 가른다", () => {
    expect(derivePageState({ published: null, liveAt: null })).toBe("draft");
    expect(derivePageState({ published: { sections: [] }, liveAt: null })).toBe("published");
    expect(derivePageState({ published: { sections: [] }, liveAt: new Date() })).toBe("live");
  });

  /**
   * 발행본이 없으면 스위치가 켜져 있어도 초안이다 — 스위치만 켜고 발행을 잊은 상태에서
   * 로더가 빈 화면을 내보내면 안 된다.
   */
  it("발행본이 없으면 스위치가 켜져 있어도 초안이다", () => {
    expect(derivePageState({ published: null, liveAt: new Date() })).toBe("draft");
  });
});

describe("renderableSections — 페이지 통짜 임베드", () => {
  it("토글이 켜지고 내용이 있는 것만 나간다", () => {
    const page = published([
      sec(1),                                        // 정상
      sec(2, { enabled: false }),                    // 토글 꺼짐
      sec(3, { content: {} }),                       // 내용 없음
    ]);
    const out = renderableSections(page);
    expect(out.map((s) => s.sid)).toEqual([uid(1)]);
  });

  it("발행본이 없으면 아무것도 안 나간다", () => {
    expect(renderableSections(null)).toEqual([]);
    expect(renderableSections(undefined)).toEqual([]);
  });
});

describe("standaloneSection — 섹션 단독 임베드", () => {
  /**
   * **부분 이행의 정의.** 페이지는 아직 공개 전이고 그 섹션의 페이지 토글이 꺼져 있어도,
   * 붙일 코드 스위치를 켠 섹션은 아임웹에 따로 끼울 수 있어야 한다.
   */
  it("페이지 공개 여부와 섹션 토글을 보지 않는다", () => {
    const page = published([sec(1, { enabled: false, embedEnabled: true })]);
    const got = standaloneSection(page, uid(1));
    expect(got?.sid).toBe(uid(1));
  });

  it("붙일 코드 스위치가 꺼져 있으면 안 나간다", () => {
    const page = published([sec(1, { enabled: true, embedEnabled: false })]);
    expect(standaloneSection(page, uid(1))).toBeNull();
  });

  it("내용이 없으면 안 나간다 — 빈 껍데기를 파트너 사이트에 띄우지 않는다", () => {
    const page = published([sec(1, { embedEnabled: true, content: {} })]);
    expect(standaloneSection(page, uid(1))).toBeNull();
  });

  it("없는 sid 는 null", () => {
    const page = published([sec(1, { embedEnabled: true })]);
    expect(standaloneSection(page, uid(99))).toBeNull();
  });
});

describe("slugFromTitle", () => {
  it("한글·공백·기호를 정리한다", () => {
    expect(slugFromTitle("오시는 길")).toBe("오시는-길");
    expect(slugFromTitle("  Visitor Guide!  ")).toBe("visitor-guide");
    expect(slugFromTitle("A / B")).toBe("a-b");
  });

  it("비면 기본값", () => {
    expect(slugFromTitle("")).toBe("page");
    expect(slugFromTitle("!!!")).toBe("page");
  });

  it("겹치면 번호를 붙인다", () => {
    expect(slugFromTitle("홈", ["홈"])).toBe("홈-2");
    expect(slugFromTitle("홈", ["홈", "홈-2"])).toBe("홈-3");
  });
});

describe("homePageDefaults", () => {
  it("홈은 최상단 고정으로 시작한다", () => {
    const h = homePageDefaults("ko");
    expect(h.isHome).toBe(true);
    expect(h.sortOrder).toBe(0);
    expect(h.draft).toEqual({ sections: [] });
  });
});
