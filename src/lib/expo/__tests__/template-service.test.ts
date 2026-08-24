import { describe, expect, it } from "vitest";
import {
  applyMediaToPages, applyMediaToSnapshot, normalizeTemplateMeta, planTemplateInstantiate,
  planTemplateSave, reconnectChecklist, TEMPLATE_NAME_MAX,
} from "@/lib/expo/template-service";

/**
 * 템플릿 저장·복제의 **판단 부분**. DB·Storage 없이 이것만 따로 본다.
 *
 * 체크리스트는 장식이 아니다. 템플릿은 이전 전시의 사전등록 소스·아임웹 주소를 **일부러
 * 안 가져간다** — 그 사실을 화면이 말해 주지 않으면 운영자는 다 된 줄 알고 발행한다.
 */

const BASE = "https://proj.supabase.co/storage/v1/object/public/webinar-assets/";
const SID = "11111111-1111-1111-1111-111111111111";

const sourcePage = (content: Record<string, unknown>) => ({
  id: "pg1", slug: "home", title: "홈", isHome: true, sortOrder: 0,
  parentId: null, imwebUrl: null,
  draft: {
    sections: [{
      sid: SID, type: "kv", variant: "column", enabled: true, embedEnabled: false,
      design: { bg: "light", align: "left" }, content,
    }],
  },
});

describe("이름·설명 검증", () => {
  it("이름 없이는 저장하지 않는다 — 목록에서 고를 수 없다", () => {
    expect(normalizeTemplateMeta({ name: "   " })).toMatchObject({ ok: false, field: "name" });
    expect(normalizeTemplateMeta({})).toMatchObject({ ok: false, field: "name" });
  });

  /** 자르지 않고 거절한다 — 운영자가 입력한 것을 말없이 줄여 저장하면 안 된다. */
  it("상한을 넘으면 자르지 않고 거절한다", () => {
    expect(normalizeTemplateMeta({ name: "가".repeat(TEMPLATE_NAME_MAX + 1) })).toMatchObject({ ok: false });
    expect(normalizeTemplateMeta({ name: "n", description: "설".repeat(501) }))
      .toMatchObject({ ok: false, field: "description" });
  });

  it("기본은 design — full 은 명시해야 한다", () => {
    expect(normalizeTemplateMeta({ name: "n" })).toMatchObject({ ok: true, value: { contentMode: "design" } });
    expect(normalizeTemplateMeta({ name: "n", contentMode: "FULL" }))
      .toMatchObject({ ok: true, value: { contentMode: "design" } });
    expect(normalizeTemplateMeta({ name: "n", contentMode: "full" }))
      .toMatchObject({ ok: true, value: { contentMode: "full" } });
  });

  it("빈 설명은 null 로 — 빈 문자열을 저장하지 않는다", () => {
    expect(normalizeTemplateMeta({ name: "n", description: "  " }))
      .toMatchObject({ ok: true, value: { description: null } });
  });
});

describe("저장 계획", () => {
  const pages = [sourcePage({
    title: { ko: "지난 전시" },
    media: { kind: "image", url: `${BASE}w1/expo/site1/hero.jpg` },
  })];

  it("design 모드는 문구도 이미지도 담지 않는다", () => {
    const plan = planTemplateSave({ theme: {}, pages, contentMode: "design" });
    expect(plan.snapshot.pages[0].sections[0].content).toBeUndefined();
    expect(plan.mediaUrls).toEqual([]);
  });

  it("full 모드는 옮길 이미지를 목록으로 낸다", () => {
    const plan = planTemplateSave({ theme: {}, pages, contentMode: "full" });
    expect(plan.mediaUrls).toEqual([`${BASE}w1/expo/site1/hero.jpg`]);
  });

  /** 사전등록 소스는 스냅샷에 담기지 않는다 — 몇 개를 다시 골라야 하는지 세어 둔다. */
  it("등록 폼 개수를 세어 체크리스트에 넘긴다", () => {
    const withForm = [{
      ...sourcePage({ title: { ko: "t" } }),
      draft: {
        sections: [
          { sid: SID, type: "kv", variant: "column", enabled: true, embedEnabled: false, design: {}, content: { title: { ko: "t" } } },
          { sid: "22222222-2222-2222-2222-222222222222", type: "register-form", variant: "inline", enabled: true, embedEnabled: false, design: {}, content: { sourceRef: "src-old" } },
        ],
      },
    }];
    const plan = planTemplateSave({ theme: {}, pages: withForm, contentMode: "full" });
    expect(plan.registerFormSections).toBe(1);
    expect(JSON.stringify(plan.snapshot)).not.toContain("src-old");
  });
});

describe("복제 계획", () => {
  const snapshot = {
    version: 1, contentMode: "full",
    theme: { accent: "#1f3a5f", lightBg: "#ffffff", darkBg: "#111318" },
    pages: [{
      key: "home", slug: "home", title: "홈", isHome: true, sortOrder: 0,
      sections: [{
        type: "kv", variant: "column", design: { bg: "light", align: "left" },
        content: { title: { ko: "제목" }, media: { kind: "image", url: `${BASE}w1/expo-templates/t1/a.jpg` } },
      }],
    }],
  };

  it("옮길 이미지와 새 페이지를 함께 낸다", () => {
    const plan = planTemplateInstantiate(snapshot);
    expect(plan.mediaUrls).toEqual([`${BASE}w1/expo-templates/t1/a.jpg`]);
    expect(plan.pages).toHaveLength(1);
    expect(plan.pages[0].isHome).toBe(true);
  });

  it("읽을 수 없는 스냅샷은 던진다 — 반쪽짜리 사이트를 만들지 않는다", () => {
    expect(() => planTemplateInstantiate({ version: 99 })).toThrow();
    expect(() => planTemplateInstantiate({})).toThrow();
  });
});

describe("주소 다시 가리키기", () => {
  const snapshot = {
    version: 1, contentMode: "full" as const,
    theme: { accent: "#1f3a5f", lightBg: "#ffffff", darkBg: "#111318" },
    pages: [{
      key: "home", slug: "home", title: "홈", isHome: true, sortOrder: 0,
      sections: [{
        type: "kv", variant: "column", design: {},
        content: { title: { ko: "제목" }, media: { kind: "image", url: "old" } },
      }],
    }],
  };

  it("표에 있는 주소만 바꾸고 구조는 그대로 둔다", () => {
    const out = applyMediaToSnapshot(snapshot, new Map([["old", "new"]]));
    expect((out.pages[0].sections[0].content!.media as { url: string }).url).toBe("new");
    expect(out.pages[0].key).toBe("home");
    expect(out.pages[0].sections[0].content!.title).toEqual({ ko: "제목" });
  });

  it("빈 표면 원본을 그대로 돌려준다", () => {
    expect(applyMediaToSnapshot(snapshot, new Map())).toBe(snapshot);
    const pages = planTemplateInstantiate(snapshot).pages;
    expect(applyMediaToPages(pages, new Map())).toBe(pages);
  });
});

describe("다시 연결할 것", () => {
  it("해당 없는 항목은 올리지 않는다", () => {
    expect(reconnectChecklist({ registerFormSections: 0, linksCleared: false, externalMedia: [] })).toEqual([]);
  });

  it("각 항목이 사람이 읽고 바로 할 일을 아는 문장이다", () => {
    const items = reconnectChecklist({
      registerFormSections: 2,
      linksCleared: true,
      externalMedia: [{ url: "https://cdn.example.com/a.jpg", reason: "external" }],
      needsImwebUrls: true,
    });
    expect(items.map((i) => i.code)).toEqual(["source-ref", "internal-link", "external-media", "imweb-url"]);
    for (const item of items) {
      expect(`${item.code}: ${item.message.trim() !== ""}`).toBe(`${item.code}: true`);
      expect(item.message).not.toMatch(/undefined|null|Error/);
    }
    expect(items[0].message).toContain("2개");
  });

  /** 아임웹 주소는 복제할 때만 묻는다 — 저장할 때는 원본에 이미 있다. */
  it("저장에서는 아임웹 항목이 없다", () => {
    const items = reconnectChecklist({ registerFormSections: 1, linksCleared: false, externalMedia: [] });
    expect(items.map((i) => i.code)).not.toContain("imweb-url");
  });
});
