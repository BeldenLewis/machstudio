import { describe, expect, it } from "vitest";
import { EXPO_SECTIONS, EXPO_LIMITS, sectionDef } from "@/lib/expo/registry";
import { normalizeExpoPage, normalizeExpoTheme, newSection } from "@/lib/expo/config";
import { EXPO_V2_RULES } from "@/lib/expo/types";

/**
 * 정규화는 **총 함수**다 — 저장된 JSON 은 무엇이든 올 수 있고(직접 고친 값, 옛 버전,
 * 깨진 값), 그중 하나가 던지면 그 페이지는 어드민에서도 공개에서도 영영 안 열린다.
 *
 * 그래서 여기서 지키는 것: **절대 던지지 않는다**, 모르는 것은 조용히 버린다,
 * 그리고 **유효한 sid 는 절대 바꾸지 않는다**(섹션 스니펫 URL 이 그 값을 참조한다).
 */

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const page = (sections: unknown[]) => normalizeExpoPage({ sections });

describe("카탈로그 — W1 의 6타입", () => {
  it("타입과 변형이 계획과 정확히 같다", () => {
    expect(EXPO_SECTIONS.map((s) => s.type)).toEqual([
      "kv", "textblock", "cardgrid", "toolbox", "register-form", "custom-code",
    ]);
    const variants = Object.fromEntries(EXPO_SECTIONS.map((s) => [s.type, s.variants.map((v) => v.id)]));
    expect(variants).toEqual({
      "kv": ["column", "minimal"],
      "textblock": ["statement", "prose", "twocol"],
      "cardgrid": ["multicolumn"],
      "toolbox": ["tiles", "strip"],
      "register-form": ["inline", "cta"],
      "custom-code": ["boxed", "full"],
    });
  });

  /** 아임웹 실측에서 코드블럭 전폭 배치가 불가능했다(W0 allowKvFull=false). */
  it("kv.full 은 카탈로그에 없다", () => {
    expect(sectionDef("kv")!.variants.map((v) => v.id)).not.toContain("full");
  });

  it("슬롯 종류가 7개로 닫혀 있다", () => {
    const kinds = new Set<string>();
    const walk = (slots: ReturnType<typeof sectionDef> extends null ? never : NonNullable<ReturnType<typeof sectionDef>>["slots"]) => {
      for (const s of slots) { kinds.add(s.kind); if (s.itemSlots) walk(s.itemSlots); }
    };
    for (const def of EXPO_SECTIONS) walk(def.slots);
    expect([...kinds].sort()).toEqual(["code", "link", "list", "media", "sourceRef", "text", "textarea"]);
  });
});

describe("Expo V2 설정", () => {
  it("V1 스냅샷을 sid 변경 없이 V2로 올린다", () => {
    const sid = uid(11);
    const normalized = normalizeExpoPage({ sections: [{ sid, type: "textblock", variant: "prose", content: { body: "본문" } }] });
    expect(normalized.schemaVersion).toBe(2);
    expect(normalized.sections[0]?.sid).toBe(sid);
    expect(normalized.settings).toBeUndefined();
  });

  it("V2 설정은 안전한 구조만 보존한다", () => {
    const normalized = normalizeExpoPage({
      schemaVersion: 2,
      preset: "stk-home-v1",
      settings: {
        event: { edition: 2027, startsAt: "2027-06-10T00:00:00+09:00", endsAt: "2027-06-12T00:00:00+09:00", facts: { companies: 500 } },
        campaigns: [{ id: "visitor-registration", label: "사전등록", startsAt: "2027-01-01T00:00:00+09:00", endsAt: "2027-06-01T00:00:00+09:00", override: "auto", enabled: true }],
        destinations: [{ id: "apply", label: "신청", action: { type: "url", href: "https://example.com/apply", newTab: true }, enabled: true }],
      },
      sections: [],
    });
    expect(normalized).toMatchObject({ schemaVersion: 2, preset: "stk-home-v1" });
    expect(normalized.settings?.campaigns?.[0]?.id).toBe("visitor-registration");
    expect(normalized.settings?.destinations?.[0]?.action).toEqual({ type: "url", href: "https://example.com/apply", newTab: true });
    expect(EXPO_V2_RULES.id.test("visitor-registration")).toBe(true);
  });
});

describe("정규화 — 던지지 않는다", () => {
  it("무엇을 넣어도 페이지 모양이 나온다", () => {
    for (const bad of [null, undefined, 0, "", "문자열", [], { sections: null }, { sections: "x" }, { sections: [null, 1, "a"] }]) {
      expect(() => normalizeExpoPage(bad)).not.toThrow();
      expect(normalizeExpoPage(bad)).toEqual({ schemaVersion: 2, sections: [] });
    }
  });

  it("순환 참조가 있어도 던지지 않는다", () => {
    const circular: Record<string, unknown> = { sections: [] };
    circular.self = circular;
    expect(() => normalizeExpoPage(circular)).not.toThrow();
  });

  it("모르는 타입은 버린다", () => {
    const out = page([
      { sid: uid(1), type: "정체불명", variant: "x" },
      { sid: uid(2), type: "textblock", variant: "prose", content: { body: "본문" } },
    ]);
    expect(out.sections.map((s) => s.type)).toEqual(["textblock"]);
  });

  it("모르는 변형은 첫 변형으로 강등한다 — 화면이 비는 것보다 낫다", () => {
    const out = page([{ sid: uid(1), type: "textblock", variant: "없는변형", content: { body: "본문" } }]);
    expect(out.sections[0].variant).toBe("statement");
  });
});

describe("sid — 불변 식별자", () => {
  /** 섹션 스니펫 URL 이 이 값을 참조한다. 정규화가 바꾸면 파트너 사이트의 코드가 죽는다. */
  it("유효한 sid 는 절대 바뀌지 않는다", () => {
    const before = uid(7);
    const out = page([{ sid: before, type: "textblock", variant: "prose", content: { body: "x" } }]);
    expect(out.sections[0].sid).toBe(before);
  });

  /**
   * 읽기 정규화는 **신원을 지어내지 않는다.** 없는 sid 에 새 UUID 를 붙이면 그 섹션이
   * 매 로드마다 다른 것이 되어 스니펫이 영영 안 맞는다.
   */
  it("sid 가 없거나 형식이 아니면 그 섹션을 버린다", () => {
    const out = page([
      { type: "textblock", variant: "prose", content: { body: "sid 없음" } },
      { sid: "", type: "textblock", variant: "prose", content: { body: "빈 sid" } },
      { sid: "not-a-uuid", type: "textblock", variant: "prose", content: { body: "형식 아님" } },
      { sid: uid(1), type: "textblock", variant: "prose", content: { body: "정상" } },
    ]);
    expect(out.sections).toHaveLength(1);
    expect(out.sections[0].sid).toBe(uid(1));
    expect(out.sections[0].content.body).toEqual({ en: "정상" });
  });

  it("중복 sid 는 첫 것만 남긴다", () => {
    const out = page([
      { sid: uid(1), type: "textblock", variant: "prose", content: { body: "첫째" } },
      { sid: uid(1), type: "textblock", variant: "prose", content: { body: "둘째" } },
    ]);
    expect(out.sections).toHaveLength(1);
    expect(out.sections[0].content.body).toEqual({ en: "첫째" });
  });

  it("새 섹션은 UUID 를 발급받는다", () => {
    const a = newSection("textblock");
    const b = newSection("textblock");
    expect(a.sid).toMatch(/^[0-9a-f-]{36}$/i);
    expect(a.sid).not.toBe(b.sid);
    expect(a.variant).toBe("statement");
    expect(a.enabled).toBe(true);
    // 붙일 코드는 따로 켠다 — 만들자마자 밖으로 나가면 안 된다.
    expect(a.embedEnabled).toBe(false);
  });
});

describe("슬롯 값 정규화", () => {
  it("텍스트는 로케일 맵으로 저장된다", () => {
    const out = page([{ sid: uid(1), type: "kv", variant: "column", content: { title: "제목" } }]);
    expect(out.sections[0].content.title).toEqual({ en: "제목" });
  });

  it("줄바꿈은 보존한다 — 사용자 텍스트다", () => {
    const out = page([{ sid: uid(1), type: "textblock", variant: "prose", content: { body: "첫 줄\n둘째 줄" } }]);
    expect(out.sections[0].content.body).toEqual({ en: "첫 줄\n둘째 줄" });
  });

  it("http(s) 가 아닌 링크는 지운다", () => {
    const out = page([{
      sid: uid(1), type: "kv", variant: "column",
      content: { title: "t", cta: { label: "가기", href: "javascript:alert(1)" } },
    }]);
    expect((out.sections[0].content.cta as { href: string }).href).toBe("");
  });

  it("내부 페이지 참조는 그대로 둔다 — 렌더 시점에 푼다", () => {
    const out = page([{
      sid: uid(1), type: "kv", variant: "column",
      content: { title: "t", cta: { label: "가기", href: "page:abc123" } },
    }]);
    expect((out.sections[0].content.cta as { href: string }).href).toBe("page:abc123");
  });

  /** W1 미디어는 이미지만이다 — 영상·YouTube 는 W2. */
  it("이미지가 아닌 미디어는 버린다", () => {
    const out = page([{
      sid: uid(1), type: "kv", variant: "column",
      content: { title: "t", media: { kind: "video", url: "https://x.test/a.mp4" } },
    }]);
    expect(out.sections[0].content.media).toBeUndefined();
  });

  it("리스트는 행 단위로 재귀 정규화한다", () => {
    const out = page([{
      sid: uid(1), type: "cardgrid", variant: "multicolumn",
      content: { items: [
        { title: "카드1", link: { label: "보기", href: "https://x.test" } },
        { title: "", description: "제목 없는 행" },   // required 누락 → 버린다
        "행이 아님",
      ] },
    }]);
    const items = out.sections[0].content.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0].title).toEqual({ en: "카드1" });
  });
});

describe("용량 상한 — 신뢰할 수 없는 JSON 을 묶는다", () => {
  it("섹션 수를 넘기면 잘라 낸다", () => {
    const many = Array.from({ length: EXPO_LIMITS.sectionsPerPage + 5 }, (_, i) => ({
      sid: uid(i + 1), type: "textblock", variant: "prose", content: { body: `본문 ${i}` },
    }));
    expect(page(many).sections).toHaveLength(EXPO_LIMITS.sectionsPerPage);
  });

  it("리스트 행 수를 넘기면 잘라 낸다", () => {
    const rows = Array.from({ length: EXPO_LIMITS.rowsPerList + 10 }, (_, i) => ({ title: `카드 ${i}` }));
    const out = page([{ sid: uid(1), type: "cardgrid", variant: "multicolumn", content: { items: rows } }]);
    expect((out.sections[0].content.items as unknown[]).length).toBe(EXPO_LIMITS.rowsPerList);
  });

  it("긴 텍스트는 방어적으로 자른다 — 저장된 값이 이미 클 수 있다", () => {
    const long = "가".repeat(EXPO_LIMITS.textChars + 200);
    const out = page([{ sid: uid(1), type: "kv", variant: "column", content: { title: long } }]);
    expect((out.sections[0].content.title as Record<string, string>).en.length).toBe(EXPO_LIMITS.textChars);
  });

  it("커스텀 코드는 20KB 로 묶는다", () => {
    const big = "x".repeat(EXPO_LIMITS.longTextBytes + 500);
    const out = page([{ sid: uid(1), type: "custom-code", variant: "boxed", content: { code: big } }]);
    expect((out.sections[0].content.code as string).length).toBeLessThanOrEqual(EXPO_LIMITS.longTextBytes);
  });
});

describe("normalizeExpoTheme", () => {
  it("6자리 hex 로 편다", () => {
    expect(normalizeExpoTheme({ accent: "#ABC", lightBg: "#FFFFFF", darkBg: "111318" }))
      .toEqual({ accent: "#aabbcc", lightBg: "#ffffff", darkBg: "#111318" });
  });

  it("hex 가 아니면 기본값으로 떨어진다 — 색이 없어 화면이 깨지면 안 된다", () => {
    const t = normalizeExpoTheme({ accent: "rgb(0,0,0)", lightBg: null, darkBg: 42 });
    expect(t.accent).toMatch(/^#[0-9a-f]{6}$/);
    expect(t.lightBg).toMatch(/^#[0-9a-f]{6}$/);
    expect(t.darkBg).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("무엇을 넣어도 던지지 않는다", () => {
    for (const bad of [null, undefined, "x", 0, []]) expect(() => normalizeExpoTheme(bad)).not.toThrow();
  });
});
