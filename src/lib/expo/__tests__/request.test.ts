import { afterEach, describe, expect, it } from "vitest";
import { EXPO_LIMITS, sectionDef } from "@/lib/expo/registry";
import { validatePageDraft, validateTemplateSnapshot } from "@/lib/expo/request";
import { normalizeExpoPage } from "@/lib/expo/config";
import type { SectionPlugin, ValidateContext } from "@/lib/expo/types";

/**
 * **자르기와 거절의 차이.**
 *
 * 정규화는 이미 저장된 값에 대한 방어라 조용히 자른다. 새 쓰기는 거절해야 한다 —
 * 운영자가 입력한 문장을 말없이 잘라 저장하면 저장은 성공했다고 뜨는데 화면에는 잘린 글이
 * 남는다. 그건 "저장이 안 됐다" 보다 알아채기 어렵다.
 */

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const draft = (sections: unknown[]) => ({ schemaVersion: 2, sections });
const textblockPlugin = sectionDef("textblock") as SectionPlugin;
afterEach(() => { delete textblockPlugin.validate; });

describe("정상 입력은 통과한다", () => {
  it("plugin issue 경로를 content 아래로 붙이고 immutable sid와 registry context를 공급한다", () => {
    let seen: ValidateContext | null = null;
    textblockPlugin.validate = (_section, context) => {
      seen = context;
      return [{
        path: "rows[0].name", code: "required", message: "이름이 필요해요", severity: "error",
        sid: uid(999),
      }];
    };
    const sid = uid(41);
    const r = validatePageDraft({
      schemaVersion: 2,
      settings: {
        campaigns: [{ id: "apply", label: "신청", startsAt: "2027-01-01T00:00:00+09:00", endsAt: "2027-02-01T00:00:00+09:00", override: "auto", enabled: true }],
        destinations: [{ id: "contact", label: "문의", action: { type: "url", href: "https://example.com" }, enabled: true }],
      },
      sections: [{ sid, type: "textblock", variant: "prose", content: { rows: [{}] } }],
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContainEqual(expect.objectContaining({
      path: "sections[0].content.rows[0].name",
      code: "required",
      severity: "error",
      sid,
    }));
    const context = seen as ValidateContext | null;
    expect(context?.sectionIndex).toBe(0);
    expect(context?.config.sections[0].sid).toBe(sid);
    expect(context?.campaigns.get("apply")?.label).toBe("신청");
    expect(context?.destinations.get("contact")?.label).toBe("문의");
  });

  it("plugin relative/content/absolute/empty 경로와 malformed issue를 현재 섹션에 안전하게 맞춘다", () => {
    textblockPlugin.validate = () => ([
      { path: "rows[0].name", code: "relative", message: "relative", severity: "error", sid: uid(999) },
      { path: "content.rows[1].name", code: "content", message: "content", severity: "warning", sid: uid(999) },
      { path: "sections[99].content.rows[2].name", code: "absolute", message: "absolute", severity: "error", sid: uid(999) },
      { path: "", code: "empty", message: "empty", severity: "error", sid: uid(999) },
      null,
    ] as unknown as ReturnType<NonNullable<SectionPlugin["validate"]>>);
    const sid = uid(42);
    const raw = draft([{ sid, type: "textblock", variant: "prose", content: { rows: [{}, {}, {}] } }]);

    expect(() => validatePageDraft(raw)).not.toThrow();
    const result = validatePageDraft(raw);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((issue) => issue.path)).toEqual([
      "sections[0].content.rows[0].name",
      "sections[0].content.rows[1].name",
      "sections[0].content.rows[2].name",
      "sections[0].content",
      "sections[0].content",
    ]);
    expect(result.errors.map((issue) => issue.sid)).toEqual([sid, sid, sid, sid, sid]);
    expect(result.errors[4]).toMatchObject({
      code: "invalid-shape",
      message: "구획 검증 결과의 모양이 올바르지 않아요",
      severity: "error",
    });
  });

  it("보통의 페이지", () => {
    const r = validatePageDraft(draft([
      { sid: uid(1), type: "kv", variant: "column", content: { title: "제목" } },
      { sid: uid(2), type: "textblock", variant: "prose", content: { body: "본문\n둘째 줄" } },
    ]));
    expect(r.ok).toBe(true);
  });

  it("빈 페이지도 통과 — 저장은 되고, 발행이 막힐 뿐이다", () => {
    expect(validatePageDraft(draft([])).ok).toBe(true);
  });
});

describe("넘치면 자르지 않고 거절한다", () => {
  it("텍스트가 길면 어느 칸인지 알려 준다", () => {
    const r = validatePageDraft(draft([
      { sid: uid(1), type: "kv", variant: "column", content: { title: "가".repeat(EXPO_LIMITS.textChars + 1) } },
    ]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0].path).toBe("sections[0].content.title");
      expect(r.errors[0].code).toBe("too-long");
      // 문구에 실제 글자 수가 들어가야 운영자가 얼마나 줄일지 안다.
      expect(r.errors[0].message).toContain(String(EXPO_LIMITS.textChars));
    }
  });

  /** 한 언어만 넘쳐도 거절이다 — 다국어 맵의 최댓값을 본다. */
  it("로케일 맵의 한 언어만 넘쳐도 거절한다", () => {
    const r = validatePageDraft(draft([
      { sid: uid(1), type: "kv", variant: "column",
        content: { title: { ko: "짧음", en: "x".repeat(EXPO_LIMITS.textChars + 1) } } },
    ]));
    expect(r.ok).toBe(false);
  });

  it("커스텀 코드가 크면 거절한다", () => {
    const r = validatePageDraft(draft([
      { sid: uid(1), type: "custom-code", variant: "boxed", content: { code: "x".repeat(EXPO_LIMITS.longTextBytes + 1) } },
    ]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].path).toBe("sections[0].content.code");
  });

  it("리스트 행이 많으면 몇 개인지 말해 준다", () => {
    const rows = Array.from({ length: EXPO_LIMITS.rowsPerList + 3 }, (_, i) => ({ title: `카드 ${i}` }));
    const r = validatePageDraft(draft([{ sid: uid(1), type: "cardgrid", variant: "multicolumn", content: { items: rows } }]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].message).toContain(String(rows.length));
  });

  it("리스트 안쪽 칸도 검사한다", () => {
    const r = validatePageDraft(draft([{
      sid: uid(1), type: "cardgrid", variant: "multicolumn",
      content: { items: [{ title: "정상" }, { title: "가".repeat(EXPO_LIMITS.textChars + 1) }] },
    }]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].path).toBe("sections[0].content.items[1].title");
  });

  it("구획 수가 많으면 거절한다", () => {
    const many = Array.from({ length: EXPO_LIMITS.sectionsPerPage + 1 }, (_, i) => ({
      sid: uid(i + 1), type: "textblock", variant: "prose", content: { body: "본문" },
    }));
    const r = validatePageDraft(draft(many));
    expect(r.ok).toBe(false);
    // 편집기의 개수 경고("한 페이지에 구획은 N개까지예요")와 같은 말을 써야 한다.
    if (!r.ok) expect(r.errors[0].message).toContain("한 페이지에 구획은");
  });

  it("모르는 구획 타입은 거절한다 — 쓰기에서는 조용히 버리지 않는다", () => {
    const r = validatePageDraft(draft([{ sid: uid(1), type: "정체불명", variant: "x" }]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe("unknown-type");
    if (!r.ok) expect(r.errors[0].message).not.toContain("섹션");
  });

  it("모양이 아니면 거절한다", () => {
    for (const bad of [null, undefined, "x", 3, { sections: "x" }]) {
      expect(validatePageDraft(bad).ok).toBe(false);
    }
  });
});

describe("정규화와의 역할 분담", () => {
  /**
   * 같은 값을 정규화에 넣으면 **자른다**. 이 대비가 이 모듈이 따로 있는 이유다.
   */
  it("쓰기는 거절하지만 읽기 정규화는 자른다", () => {
    const long = "가".repeat(EXPO_LIMITS.textChars + 50);
    const payload = draft([{ sid: uid(1), type: "kv", variant: "column", content: { title: long } }]);

    expect(validatePageDraft(payload).ok).toBe(false);       // 새 쓰기는 막고

    const normalized = normalizeExpoPage(payload);            // 이미 저장된 값은 살린다
    expect((normalized.sections[0].content.title as Record<string, string>).en.length)
      .toBe(EXPO_LIMITS.textChars);
  });
});

describe("템플릿 스냅샷", () => {
  it("보통 크기는 통과", () => {
    expect(validateTemplateSnapshot({ version: 1, pages: [] }).ok).toBe(true);
  });

  it("너무 크면 거절한다", () => {
    const huge = { version: 1, pages: [{ blob: "x".repeat(EXPO_LIMITS.templateSnapshotBytes + 10) }] };
    const r = validateTemplateSnapshot(huge);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe("too-large");
  });
});

/**
 * **정규화가 조용히 버리는 것을 쓰기가 막는가.**
 *
 * 여기 있는 여섯 가지는 전부 예전에 **통과했다** — 검증이 200 을 주고, 정규화가 구획을
 * 버리거나 값을 자르고, 편집기는 자기 로컬 값을 기준선으로 삼아 "저장됨" 이라고 표시했다.
 * 운영자는 새로고침해야 알았다. 계획서 264·266행이 못박은 자리다.
 *
 * 각 케이스는 **정규화가 실제로 버린다는 것까지** 같이 확인한다 — 그래야 이 검증이
 * 가상의 위험이 아니라 실제로 갈라지던 지점을 막는다는 것이 남는다.
 */
describe("쓰기가 막는다 — 정규화가 조용히 버리던 것들", () => {
  const codesOf = (r: ReturnType<typeof validatePageDraft>) => (r.ok ? [] : r.errors.map((e) => e.code));

  it("sid 가 없으면 거절한다 — 통과시키면 구획이 통째로 사라진다", () => {
    const d = draft([{ type: "kv", variant: "column", content: { title: "제목" } }]);
    expect(codesOf(validatePageDraft(d))).toContain("invalid-sid");
    // 통과시켰다면 이렇게 됐다:
    expect(normalizeExpoPage(d).sections).toHaveLength(0);
  });

  it("sid 가 UUID 가 아니면 거절한다", () => {
    const d = draft([{ sid: "abc", type: "kv", variant: "column", content: { title: "제목" } }]);
    expect(codesOf(validatePageDraft(d))).toContain("invalid-sid");
    expect(normalizeExpoPage(d).sections).toHaveLength(0);
  });

  it("중복 sid 는 거절한다 — 통과시키면 뒤엣것이 사라진다", () => {
    const d = draft([
      { sid: uid(1), type: "kv", variant: "column", content: { title: "첫째" } },
      { sid: uid(1), type: "textblock", variant: "prose", content: { body: "둘째" } },
    ]);
    expect(codesOf(validatePageDraft(d))).toContain("duplicate-sid");
    expect(normalizeExpoPage(d).sections).toHaveLength(1);
  });

  it("한 페이지에 하나만 되는 구획이 두 번이면 거절한다", () => {
    const d = draft([
      { sid: uid(1), type: "kv", variant: "column", content: { title: "첫째" } },
      { sid: uid(2), type: "kv", variant: "column", content: { title: "둘째" } },
    ]);
    const r = validatePageDraft(d);
    expect(codesOf(r)).toContain("duplicate-singleton");
    // 문구는 운영자 말로, 조사까지 맞게 — 편집기의 같은 안내와 같은 문장이어야 한다.
    if (!r.ok) {
      const m = r.errors.find((e) => e.code === "duplicate-singleton")!.message;
      expect(m).toBe("키비주얼은 한 페이지에 하나만 놓을 수 있어요");
    }
    expect(normalizeExpoPage(d).sections).toHaveLength(1);
  });

  it("link.label 이 넘치면 거절한다 — 통과시키면 말없이 잘린다", () => {
    const long = "가".repeat(EXPO_LIMITS.textChars + 100);
    const d = draft([{
      sid: uid(1), type: "kv", variant: "column",
      content: { title: "제목", cta: { label: long, href: "https://example.com" } },
    }]);
    expect(codesOf(validatePageDraft(d))).toContain("too-long");
    const saved = normalizeExpoPage(d).sections[0].content.cta as { label: string };
    expect(saved.label.length).toBe(EXPO_LIMITS.textChars);
  });

  it("media.alt 가 넘치면 거절한다", () => {
    const long = "가".repeat(EXPO_LIMITS.textChars + 100);
    const d = draft([{
      sid: uid(1), type: "kv", variant: "column",
      content: { title: "제목", media: { kind: "image", url: "https://example.com/a.png", alt: long } },
    }]);
    expect(codesOf(validatePageDraft(d))).toContain("too-long");
  });

  it("sourceRef 가 넘치면 거절한다", () => {
    const d = draft([{
      sid: uid(1), type: "register-form", variant: "inline",
      content: { sourceRef: "x".repeat(100) },
    }]);
    expect(codesOf(validatePageDraft(d))).toContain("too-long");
  });

  /** 어느 카드로 데려갈지 — path 인덱스 역산은 배열이 바뀌면 어긋난다. */
  it("오류에 어느 구획인지 실어 준다", () => {
    const r = validatePageDraft(draft([
      { sid: uid(1), type: "kv", variant: "column", content: { title: "정상" } },
      { sid: uid(2), type: "cardgrid", variant: "multicolumn",
        content: { items: [{ title: "가".repeat(EXPO_LIMITS.textChars + 1) }] } },
    ]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].sid).toBe(uid(2));
  });

  /**
   * 구획은 40개까지만 검증한다(`sectionsPerPage`). 그래서 구획 하나당 오류 하나로는
   * 상한 50에 못 닿는다 — 행이 많은 카드 구획으로 만든다. 전체 크기는 512KB 아래로 둔다.
   */
  it("오류가 아주 많아도 상한을 넘기지 않고, 잘렸다고 말한다", () => {
    const rows = Array.from({ length: 100 }, () => ({ title: "가".repeat(EXPO_LIMITS.textChars + 1) }));
    const r = validatePageDraft(draft([
      { sid: uid(1), type: "cardgrid", variant: "multicolumn", content: { items: rows } },
    ]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toHaveLength(51);
      expect(r.errors[50].message).toContain("50건이 더 있어요");
    }
  });
});

describe("V2 설정 검증", () => {
  const v2 = (settings: Record<string, unknown>) => ({ schemaVersion: 2, settings, sections: [] });

  it("모르는 스키마와 잘못된 캠페인 시간을 정확한 경로로 막는다", () => {
    const legacyWrite = validatePageDraft({ sections: [] });
    expect(legacyWrite.ok).toBe(false);
    if (!legacyWrite.ok) expect(legacyWrite.errors).toContainEqual(expect.objectContaining({ path: "schemaVersion", code: "invalid-schema" }));

    const unknown = validatePageDraft({ schemaVersion: 3, sections: [] });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.errors).toContainEqual(expect.objectContaining({ path: "schemaVersion", code: "invalid-schema" }));

    const badDate = validatePageDraft(v2({ campaigns: [{
      id: "apply", label: "신청", startsAt: "2027-02-01T00:00:00+09:00", endsAt: "2027-01-01T00:00:00+09:00", override: "auto", enabled: true,
    }] }));
    expect(badDate.ok).toBe(false);
    if (!badDate.ok) expect(badDate.errors).toContainEqual(expect.objectContaining({ path: "settings.campaigns[0].endsAt", code: "invalid-date" }));
  });

  it("중복 목적지와 안전하지 않은 동작을 막는다", () => {
    const result = validatePageDraft(v2({ destinations: [
      { id: "contact", label: "문의", action: { type: "url", href: "https://example.com" }, enabled: true },
      { id: "contact", label: "중복", action: { type: "url", href: "https://user:pass@example.com" }, enabled: true },
      { id: "download", label: "다운로드", action: { type: "download", href: "http://127.0.0.1/file" }, enabled: true },
    ] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual(expect.objectContaining({ path: "settings.destinations[1].id", code: "duplicate-id" }));
      expect(result.errors).toContainEqual(expect.objectContaining({ path: "settings.destinations[1].action.href", code: "invalid-url" }));
      expect(result.errors).toContainEqual(expect.objectContaining({ path: "settings.destinations[2].action.href", code: "invalid-url" }));
    }
  });
});

/**
 * **짝 불변식** — 검증을 통과한 값은 정규화가 손대지 않는다.
 *
 * 이게 이 파일에서 가장 오래 갈 검사다. 슬롯 종류를 늘리면서 검증만 안 고치면 여기서
 * 깨진다 — 지금 고치는 버그가 정확히 그렇게 생겨났다(`media`·`link`·`sourceRef` 가
 * `validateSlot` 에 없었다).
 *
 * 일부러 관대하게 둔 것은 대상이 아니다: 주소 형식(자유 입력 + 900ms 자동저장),
 * `media.kind`, 필수 값이 빈 행(`keepEmptyRows`), 카탈로그 밖 키(`__rowKey`),
 * 변형·디자인 열거값(카탈로그에서 값을 지우는 배포가 열려 있던 탭을 422 로 만들면 안 된다).
 */
describe("검증을 통과하면 정규화가 손대지 않는다", () => {
  const CORPUS = [
    draft([{ sid: uid(1), type: "kv", variant: "column", content: { title: "제목", subtitle: "부제", cta: { label: "신청", href: "https://example.com" } } }]),
    draft([{ sid: uid(2), type: "textblock", variant: "prose", content: { heading: "머리", body: "본문\n둘째" } }]),
    draft([{ sid: uid(3), type: "cardgrid", variant: "multicolumn", content: { heading: "프로그램", items: [{ title: "가", description: "나" }, { title: "다" }] } }]),
    draft([{ sid: uid(4), type: "toolbox", variant: "tiles", content: { items: [{ label: "지도", link: { label: "열기", href: "https://example.com/m" } }] } }]),
    draft([{ sid: uid(5), type: "custom-code", variant: "boxed", content: { heading: "지도", code: "<div>x</div>" } }]),
    draft([
      { sid: uid(6), type: "kv", variant: "column", content: { title: "제목", media: { kind: "image", url: "https://example.com/a.png", alt: "대체" } } },
      { sid: uid(7), type: "textblock", variant: "statement", content: { body: "문장" } },
    ]),
    /**
     * **경계값** — 상한에 정확히 닿는 값들. 이게 이 코퍼스에서 실제로 무는 부분이다:
     * 검증은 통과해야 하고 정규화는 한 글자도 자르면 안 된다. 누군가 자르는 자리를
     * 500 에서 400 으로 바꾸거나, 새 슬롯 종류를 검증에 안 태우면 여기서 깨진다.
     */
    draft([{
      sid: uid(8), type: "kv", variant: "column",
      content: {
        title: "가".repeat(EXPO_LIMITS.textChars),
        cta: { label: "나".repeat(EXPO_LIMITS.textChars), href: "https://example.com" },
        media: { kind: "image", url: "https://example.com/a.png", alt: "다".repeat(EXPO_LIMITS.textChars) },
      },
    }]),
    draft([{
      sid: uid(9), type: "register-form", variant: "inline",
      content: { sourceRef: "x".repeat(64), heading: "라".repeat(EXPO_LIMITS.textChars) },
    }]),
  ];

  /** 경계 바로 바깥은 반대로 **거절**돼야 한다 — 통과하면 그 순간 조용히 잘린다. */
  it("상한을 한 글자 넘기면 거절한다", () => {
    const over = EXPO_LIMITS.textChars + 1;
    expect(validatePageDraft(draft([{
      sid: uid(1), type: "kv", variant: "column",
      content: { title: "제목", cta: { label: "나".repeat(over), href: "https://example.com" } },
    }])).ok).toBe(false);
    expect(validatePageDraft(draft([{
      sid: uid(1), type: "kv", variant: "column",
      content: { title: "제목", media: { kind: "image", url: "https://example.com/a.png", alt: "다".repeat(over) } },
    }])).ok).toBe(false);
    expect(validatePageDraft(draft([{
      sid: uid(1), type: "register-form", variant: "inline", content: { sourceRef: "x".repeat(65) },
    }])).ok).toBe(false);
  });

  it("sid 를 하나도 버리지 않는다", () => {
    for (const d of CORPUS) {
      expect(validatePageDraft(d).ok).toBe(true);
      const before = new Set(d.sections.map((s) => (s as { sid: string }).sid));
      const after = new Set(normalizeExpoPage(d).sections.map((s) => s.sid));
      // 순서는 바뀔 수 있다(키비주얼이 맨 위로) — 집합으로 본다.
      expect([...after].sort()).toEqual([...before].sort());
    }
  });

  /** 텍스트는 저장될 때 `Localized` 맵이 된다 — 값을 꺼내 길이로 본다. */
  const textOf = (v: unknown): string => {
    if (typeof v === "string") return v;
    if (v && typeof v === "object") {
      const vals = Object.values(v as Record<string, unknown>).filter((x) => typeof x === "string");
      if (vals.length) return vals.join("");
    }
    return "";
  };

  it("검증이 상한을 거는 값을 한 글자도 자르지 않는다", () => {
    for (const d of CORPUS) {
      const norm = normalizeExpoPage(d);
      d.sections.forEach((raw) => {
        const src = raw as { sid: string; content: Record<string, unknown> };
        const out = norm.sections.find((s) => s.sid === src.sid)!;
        for (const [k, v] of Object.entries(src.content)) {
          if (typeof v === "string") {
            expect(`${k}:${textOf(out.content[k])}`).toBe(`${k}:${v}`);
          }
          if (k === "cta" || k === "link") {
            const a = v as { label?: string }, b = out.content[k] as { label?: unknown } | undefined;
            if (a.label) expect(textOf(b?.label)).toBe(a.label);
          }
          if (k === "media") {
            const a = v as { alt?: string }, b = out.content[k] as { alt?: unknown } | undefined;
            if (a.alt) expect(textOf(b?.alt)).toBe(a.alt);
          }
        }
      });
    }
  });

  it("멱등 — 한 번 정규화한 것을 다시 정규화해도 같다", () => {
    for (const d of CORPUS) {
      const once = normalizeExpoPage(d);
      expect(normalizeExpoPage(once)).toEqual(once);
      // 저장된 draft 는 항상 이 값이다(prepareDraftWrite) — 그래서 재저장이 막히지 않는다.
      expect(validatePageDraft(once).ok).toBe(true);
    }
  });
});
