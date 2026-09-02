import { describe, expect, it } from "vitest";
import {
  buildExpoTemplate, EXPO_TEMPLATE_VERSION, instantiateExpoTemplate,
  instantiateBuiltInExpoTemplate,
  type SourcePage,
} from "@/lib/expo/template";

/**
 * 템플릿이 지켜야 할 단 하나: **이전 전시의 흔적을 한 톨도 가져가지 않는다.**
 *
 * 템플릿은 워크스페이스에 남아 다음 프로젝트가 쓴다. 옛 사이트의 페이지 id·섹션 sid·
 * 사전등록 소스·아임웹 주소가 딸려 가면 새 전시 홈페이지의 버튼이 **지난 전시로 사람을 보낸다.**
 * 조용히 잘못된 곳으로 보내는 링크는 깨진 링크보다 나쁘다.
 */

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const sourcePage = (over: Partial<SourcePage> = {}): SourcePage => ({
  id: "old-page-1",
  slug: "home",
  title: "홈",
  isHome: true,
  sortOrder: 0,
  parentId: null,
  imwebUrl: "https://지난전시.test/home",
  draft: { sections: [] },
  ...over,
});

const kv = (n: number, content: Record<string, unknown>) => ({
  sid: uid(n), type: "kv", variant: "column", content,
});

describe("저장 — 이전 전시의 흔적을 지운다", () => {
  it("섹션 sid 를 담지 않는다", () => {
    const { snapshot } = buildExpoTemplate({
      theme: { accent: "#1f3a5f" },
      contentMode: "full",
      pages: [sourcePage({ draft: { sections: [kv(1, { title: "제목" })] } })],
    });
    expect(JSON.stringify(snapshot)).not.toContain(uid(1));
    expect(snapshot.pages[0].sections[0]).not.toHaveProperty("sid");
  });

  it("페이지 id 를 담지 않고 key 로 바꾼다", () => {
    const { snapshot } = buildExpoTemplate({
      theme: {},
      pages: [sourcePage({ id: "old-page-1", slug: "오시는-길", title: "오시는 길" })],
    });
    expect(JSON.stringify(snapshot)).not.toContain("old-page-1");
    expect(snapshot.pages[0].key).toBeTruthy();
  });

  /** 사전등록 소스는 전시마다 다르다 — 가져가면 새 전시 폼이 지난 전시로 등록을 보낸다. */
  it("사전등록 소스 참조를 비운다", () => {
    const { snapshot } = buildExpoTemplate({
      theme: {},
      contentMode: "full",
      pages: [sourcePage({ draft: { sections: [{
        sid: uid(1), type: "register-form", variant: "inline",
        content: { sourceRef: "src_지난전시", heading: "사전등록" },
      }] } })],
    });
    expect(JSON.stringify(snapshot)).not.toContain("src_지난전시");
    expect(snapshot.pages[0].sections[0].content).toMatchObject({ heading: { en: "사전등록" } });
  });

  /** design 모드는 구조만 — 문구·이미지는 다음 전시의 것이어야 한다. */
  it("design 모드는 문구를 담지 않는다", () => {
    const { snapshot } = buildExpoTemplate({
      theme: {},
      contentMode: "design",
      pages: [sourcePage({ draft: { sections: [kv(1, { title: "지난 전시 제목" })] } })],
    });
    expect(JSON.stringify(snapshot)).not.toContain("지난 전시 제목");
    expect(snapshot.pages[0].sections[0]).not.toHaveProperty("content");
    // 구조는 남는다.
    expect(snapshot.pages[0].sections[0]).toMatchObject({ type: "kv", variant: "column" });
  });

  it("full 모드는 문구를 남긴다", () => {
    const { snapshot } = buildExpoTemplate({
      theme: {},
      contentMode: "full",
      pages: [sourcePage({ draft: { sections: [kv(1, { title: "제목" })] } })],
    });
    expect(snapshot.pages[0].sections[0].content).toMatchObject({ title: { en: "제목" } });
  });
});

describe("링크 — 저장할 때 안쪽으로 접는다", () => {
  it("내부 페이지 링크를 template-page 로 바꾼다", () => {
    const { snapshot } = buildExpoTemplate({
      theme: {},
      contentMode: "full",
      pages: [
        sourcePage({ id: "p1", slug: "home", draft: { sections: [
          kv(1, { title: "t", cta: { label: "오시는 길", href: "page:p2" } }),
        ] } }),
        sourcePage({ id: "p2", slug: "오시는-길", title: "오시는 길", isHome: false, sortOrder: 1 }),
      ],
    });
    const cta = snapshot.pages[0].sections[0].content!.cta as { href: string };
    expect(cta.href).toBe(`template-page:${snapshot.pages[1].key}`);
    expect(JSON.stringify(snapshot)).not.toContain("page:p2");
  });

  /**
   * **원본 사이트의 아임웹 주소를 직접 가리키던 링크는 비운다.**
   * 안 비우면 다음 전시 홈페이지의 버튼이 지난 전시 페이지로 사람을 보낸다.
   */
  it("원본 아임웹 주소를 가리키던 링크를 비우고 체크리스트에 올린다", () => {
    const { snapshot, checklist } = buildExpoTemplate({
      theme: {},
      contentMode: "full",
      siteImwebUrls: ["https://지난전시.test"],
      pages: [sourcePage({ draft: { sections: [
        kv(1, { title: "t", cta: { label: "지난 전시", href: "https://지난전시.test/home" } }),
      ] } })],
    });
    expect((snapshot.pages[0].sections[0].content!.cta as { href: string }).href).toBe("");
    expect(checklist.internalLinksNeedReview).toBe(true);
  });

  it("바깥 링크는 그대로 둔다", () => {
    const { snapshot, checklist } = buildExpoTemplate({
      theme: {},
      contentMode: "full",
      pages: [sourcePage({ imwebUrl: null, draft: { sections: [
        kv(1, { title: "t", cta: { label: "협회", href: "https://다른곳.test/a" } }),
      ] } })],
    });
    expect((snapshot.pages[0].sections[0].content!.cta as { href: string }).href).toBe("https://다른곳.test/a");
    expect(checklist.internalLinksNeedReview).toBe(false);
  });
});

describe("인스턴스화 — 전부 새로 발급하고 꺼진 채로 시작", () => {
  const twoPageTemplate = () => buildExpoTemplate({
    theme: { accent: "#ff8500" },
    contentMode: "full",
    pages: [
      sourcePage({ id: "p1", slug: "home", draft: { sections: [
        kv(1, { title: "제목", cta: { label: "가기", href: "page:p2" } }),
      ] } }),
      sourcePage({ id: "p2", slug: "sub", title: "하위", isHome: false, sortOrder: 1, parentId: "p1" }),
    ],
  }).snapshot;

  it("페이지 id 와 섹션 sid 가 새로 발급된다", () => {
    const a = instantiateExpoTemplate(twoPageTemplate());
    const b = instantiateExpoTemplate(twoPageTemplate());
    expect(a.pages[0].id).not.toBe(b.pages[0].id);
    expect(a.pages[0].draft.sections[0].sid).not.toBe(b.pages[0].draft.sections[0].sid);
    expect(a.pages[0].draft.sections[0].sid).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("내부 링크가 새 페이지 id 로 풀린다", () => {
    const out = instantiateExpoTemplate(twoPageTemplate());
    const cta = out.pages[0].draft.sections[0].content.cta as { href: string };
    expect(cta.href).toBe(`page:${out.pages[1].id}`);
  });

  it("부모 관계를 새 id 로 잇는다", () => {
    const out = instantiateExpoTemplate(twoPageTemplate());
    expect(out.pages[1].parentId).toBe(out.pages[0].id);
  });

  /** 템플릿을 고른 순간 남의 전시 문구가 파트너 사이트에 나가면 안 된다. */
  it("붙일 코드 스위치가 꺼진 채로 시작한다", () => {
    const out = instantiateExpoTemplate(twoPageTemplate());
    for (const p of out.pages) for (const s of p.draft.sections) expect(s.embedEnabled).toBe(false);
  });

  it("새 사이트는 항상 ko 로 시작한다 — W1 은 템플릿에 로케일을 담지 않는다", () => {
    expect(instantiateExpoTemplate(twoPageTemplate()).defaultLocale).toBe("ko");
  });

  it("테마는 따라간다", () => {
    expect(instantiateExpoTemplate(twoPageTemplate()).theme.accent).toBe("#ff8500");
  });
});

describe("기본 제공 프리셋 인스턴스화", () => {
  it("STK 프리셋은 홈 한 장으로 만들고 페이지와 구획 신원만 새로 발급한다", () => {
    let serial = 0;
    const out = instantiateBuiltInExpoTemplate("stk-home-v1", {
      randomUUID: () => `00000000-0000-4000-8000-${String(++serial).padStart(12, "0")}`,
    });
    expect(out.pages).toHaveLength(1);
    expect(out.pages[0]).toMatchObject({ slug: "home", title: "STK 2027", isHome: true, parentId: null });
    expect(out.pages[0].draft.preset).toBe("stk-home-v1");
    expect(out.pages[0].draft.sections.every((section) => section.embedEnabled === false)).toBe(true);
  });
});

describe("망가진 입력", () => {
  it("모양이 아니면 거절한다", () => {
    for (const bad of [null, undefined, {}, { version: 0 }, "x", 3]) {
      expect(() => instantiateExpoTemplate(bad)).toThrow();
    }
  });

  /** 모르는 필드를 무시하고 만들면 조용히 반쪽짜리 사이트가 생긴다. */
  it("더 새로운 버전은 거절한다", () => {
    expect(() => instantiateExpoTemplate({ version: EXPO_TEMPLATE_VERSION + 1, pages: [] }))
      .toThrow(/새로운 버전/);
  });

  it("홈이 없으면 첫 페이지를 홈으로 삼는다", () => {
    const out = instantiateExpoTemplate({
      version: 1, contentMode: "design", theme: {},
      pages: [{ key: "a", slug: "a", title: "A", isHome: false, sortOrder: 0, sections: [] }],
    });
    expect(out.pages[0].isHome).toBe(true);
  });

  it("홈이 여러 개면 하나만 남긴다", () => {
    const out = instantiateExpoTemplate({
      version: 1, contentMode: "design", theme: {},
      pages: [
        { key: "a", slug: "a", title: "A", isHome: true, sortOrder: 0, sections: [] },
        { key: "b", slug: "b", title: "B", isHome: true, sortOrder: 1, sections: [] },
      ],
    });
    expect(out.pages.filter((p) => p.isHome)).toHaveLength(1);
  });

  /** 부모가 템플릿에 없으면 최상위로 — 고아 페이지를 만들지 않는다. */
  it("없는 부모를 가리키면 최상위로 올린다", () => {
    const out = instantiateExpoTemplate({
      version: 1, contentMode: "design", theme: {},
      pages: [{ key: "a", slug: "a", title: "A", isHome: true, sortOrder: 0, parentKey: "없음", sections: [] }],
    });
    expect(out.pages[0].parentId).toBeNull();
  });

  it("slug 가 겹치면 번호를 붙인다", () => {
    const out = instantiateExpoTemplate({
      version: 1, contentMode: "design", theme: {},
      pages: [
        { key: "a", slug: "guide", title: "안내", isHome: true, sortOrder: 0, sections: [] },
        { key: "b", slug: "guide", title: "안내", isHome: false, sortOrder: 1, sections: [] },
      ],
    });
    expect(new Set(out.pages.map((p) => p.slug)).size).toBe(2);
  });

  it("모르는 섹션 타입은 버린다", () => {
    const out = instantiateExpoTemplate({
      version: 1, contentMode: "full", theme: {},
      pages: [{ key: "a", slug: "a", title: "A", isHome: true, sortOrder: 0, sections: [
        { type: "정체불명", variant: "x", design: {} },
        { type: "textblock", variant: "prose", design: {}, content: { body: "본문" } },
      ] }],
    });
    expect(out.pages[0].draft.sections.map((s) => s.type)).toEqual(["textblock"]);
  });
});

describe("입력 불변", () => {
  it("원본 페이지 객체를 건드리지 않는다", () => {
    const pages = [sourcePage({ draft: { sections: [kv(1, { title: "제목" })] } })];
    const before = JSON.stringify(pages);
    buildExpoTemplate({ theme: {}, contentMode: "full", pages });
    expect(JSON.stringify(pages)).toBe(before);
  });

  it("스냅샷을 인스턴스화해도 스냅샷이 안 바뀐다", () => {
    const snap = buildExpoTemplate({
      theme: {}, contentMode: "full",
      pages: [sourcePage({ draft: { sections: [kv(1, { title: "제목" })] } })],
    }).snapshot;
    const before = JSON.stringify(snap);
    instantiateExpoTemplate(snap);
    expect(JSON.stringify(snap)).toBe(before);
  });
});
