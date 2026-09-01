import { describe, expect, it } from "vitest";
import { normalizeExpoPage } from "@/lib/expo/config";
import type { ExpoSection } from "@/lib/expo/types";
import { renderableSections } from "@/lib/expo/model";
import { buildExpoPayload, collectInternalPageIds, collectSourceRefs } from "@/lib/expo/payload";

/**
 * 공개로 나가는 **유일한 경계**. 여기서 새면 파트너 사이트에 그대로 실린다.
 *
 * 지키는 것 셋: 저장은 로케일 맵이고 나가는 것은 한 로케일의 문자열이다 ·
 * 내부 링크는 **같은 사이트의 살아 있는 페이지**만 풀린다 · 레코드를 통째로 싣지 않는다.
 */

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const page = (sections: unknown[]) => renderableSections({ sections });
const config = (sections: ExpoSection[]) => normalizeExpoPage({ sections });

/** 페이로드의 content 는 Record<string, unknown> 이라 읽을 때 좁혀 준다. */
const contentOf = (section: Record<string, unknown>) => section.content as Record<string, unknown>;
const linkOf = (section: Record<string, unknown>, key: string) =>
  contentOf(section)[key] as { label: string; href: string };

const ctx = (pages: Array<{ id: string; imwebUrl: string | null; deletedAt?: Date | null }>, locale = "ko") => ({
  locale,
  pages: pages.map((p) => ({ ...p, deletedAt: p.deletedAt ?? null })),
  now: new Date("2027-01-01T00:00:00.000Z"),
});

describe("로케일 — 저장은 맵, 페이로드는 문자열", () => {
  it("요청 로케일의 문자열만 나간다", () => {
    const sections = normalizeExpoPage({ sections: [{
      sid: uid(1), type: "kv", variant: "column",
      content: { title: { ko: "한국어 제목", en: "English title" } },
    }] }).sections;

    const ko = buildExpoPayload(config(sections), ctx([], "ko"));
    expect(contentOf(ko.sections[0])).toMatchObject({ title: "한국어 제목" });
    // 다른 로케일 문자열이 페이로드에 남아 있으면 안 된다.
    expect(JSON.stringify(ko)).not.toContain("English title");

    const en = buildExpoPayload(config(sections), ctx([], "en"));
    expect(contentOf(en.sections[0])).toMatchObject({ title: "English title" });
  });

  it("줄바꿈은 그대로 나간다", () => {
    const sections = page([{ sid: uid(1), type: "textblock", variant: "prose", content: { body: "첫 줄\n둘째 줄" } }]);
    const out = buildExpoPayload(config(sections), ctx([]));
    expect(contentOf(out.sections[0]).body).toBe("첫 줄\n둘째 줄");
  });
});

describe("내부 링크 — 같은 사이트의 살아 있는 페이지만", () => {
  const withLink = (href: string) => page([{
    sid: uid(1), type: "kv", variant: "column",
    content: { title: "제목", cta: { label: "오시는 길", href } },
  }]);

  it("아임웹 주소가 있으면 그 주소로 푼다", () => {
    const out = buildExpoPayload(config(withLink("page:p1")), ctx([{ id: "p1", imwebUrl: "https://expo.test/directions" }]));
    expect(linkOf(out.sections[0], "cta")).toEqual({ label: "오시는 길", href: "https://expo.test/directions" });
    expect(out.issues).toEqual([]);
  });

  /**
   * 못 풀면 **빈 문자열**이다. 깨진 링크를 내보내느니 버튼이 안 눌리는 편이 낫고,
   * 그 사실은 issues 로 올라가 이행 현황에 "링크가 아직 안 걸렸다" 로 보인다.
   */
  it("아임웹 주소가 없으면 비우고 알린다", () => {
    const out = buildExpoPayload(config(withLink("page:p1")), ctx([{ id: "p1", imwebUrl: null }]));
    expect(linkOf(out.sections[0], "cta").href).toBe("");
    expect(out.issues).toEqual([{ sid: uid(1), slot: "cta", code: "internal-link-unresolved" }]);
  });

  it("삭제된 페이지로는 링크를 걸지 않는다", () => {
    const out = buildExpoPayload(
      config(withLink("page:p1")),
      ctx([{ id: "p1", imwebUrl: "https://expo.test/gone", deletedAt: new Date() }]),
    );
    expect(linkOf(out.sections[0], "cta").href).toBe("");
    expect(out.issues).toHaveLength(1);
  });

  /** ctx.pages 에는 같은 사이트 것만 넣는다 — 목록에 없으면 못 푼다. */
  it("다른 사이트의 페이지 id 는 풀리지 않는다", () => {
    const out = buildExpoPayload(config(withLink("page:다른사이트페이지")), ctx([{ id: "p1", imwebUrl: "https://expo.test/x" }]));
    expect(linkOf(out.sections[0], "cta").href).toBe("");
    expect(JSON.stringify(out)).not.toContain("expo.test");
  });

  it("외부 https 링크는 그대로 나간다", () => {
    const out = buildExpoPayload(config(withLink("https://외부.test/a")), ctx([]));
    expect(linkOf(out.sections[0], "cta").href).toBe("https://외부.test/a");
    expect(out.issues).toEqual([]);
  });
});

describe("일괄 조회용 수집", () => {
  it("내부 페이지 id 를 중복 없이 모은다 — 리스트 안쪽까지", () => {
    const sections = page([
      { sid: uid(1), type: "kv", variant: "column", content: { title: "t", cta: { label: "a", href: "page:p1" } } },
      { sid: uid(2), type: "cardgrid", variant: "multicolumn", content: { items: [
        { title: "카드1", link: { label: "l", href: "page:p2" } },
        { title: "카드2", link: { label: "l", href: "page:p1" } },   // 중복
        { title: "카드3", link: { label: "l", href: "https://외부.test" } },
      ] } },
    ]);
    expect(collectInternalPageIds(sections).sort()).toEqual(["p1", "p2"]);
  });

  it("사전등록 소스 참조를 모은다", () => {
    const sections = page([{
      sid: uid(1), type: "register-form", variant: "inline",
      content: { sourceRef: "src_abc", heading: "사전등록" },
    }]);
    expect(collectSourceRefs(sections)).toEqual(["src_abc"]);
  });
});

describe("무엇을 싣지 않는가", () => {
  it("섹션 페이로드는 정해진 다섯 키뿐이다", () => {
    const sections = page([{ sid: uid(1), type: "textblock", variant: "prose", content: { body: "본문" }, embedEnabled: true }]);
    const out = buildExpoPayload(config(sections), ctx([]));
    expect(Object.keys(out.sections[0]).sort()).toEqual(["content", "design", "sid", "type", "variant"]);
    // 내부 스위치는 페이로드에 나가지 않는다 — 서버가 이미 게이트를 통과시킨 결과만 싣는다.
    expect(JSON.stringify(out)).not.toContain("embedEnabled");
    expect(JSON.stringify(out)).not.toContain("enabled");
  });
});

describe("V2 서버 해석", () => {
  it("캠페인 상태와 활성 목적지만 내보내며 일정 규칙은 숨긴다", () => {
    const page = normalizeExpoPage({
      schemaVersion: 2,
      settings: {
        campaigns: [{ id: "apply", label: "참가기업 모집", startsAt: "2027-01-01T00:00:00+09:00", endsAt: "2027-06-01T00:00:00+09:00", override: "auto", enabled: true }],
        destinations: [
          { id: "contact", label: "문의", action: { type: "imweb-modal", modalId: "contactModal" }, enabled: true },
          { id: "hidden", label: "숨김", action: { type: "anchor", target: "footer" }, enabled: false },
        ],
      },
      sections: [],
    });
    const out = buildExpoPayload(page, { locale: "ko", pages: [], now: new Date("2027-02-01T00:00:00.000Z") });
    expect(out.campaigns).toEqual([{ id: "apply", label: "참가기업 모집", active: true }]);
    expect(out.destinations).toEqual([{ id: "contact", label: "문의", action: { type: "imweb-modal", modalId: "contactModal" } }]);
    expect(JSON.stringify(out)).not.toContain("startsAt");
    expect(JSON.stringify(out)).not.toContain("override");
  });
});
