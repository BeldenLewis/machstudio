import { describe, expect, it } from "vitest";
import {
  contentWarnings, EXPO_READINESS_MESSAGES, hasUnpublishedChanges, liveIssues, pageReadiness,
  publishErrors, sectionSnippetIssues,
} from "@/lib/expo/readiness";
import { normalizeExpoPage } from "@/lib/expo/config";

/**
 * "왜 아직 안 나가는가" 를 운영자 말로.
 *
 * 화면마다 따로 판단하면 **버튼은 눌리는데 아무 일도 안 일어나는** 상태가 생기고,
 * 비개발자에게 그건 고장으로 읽힌다. 그래서 발행·공개·스니펫이 한 모델에서 파생된다.
 */

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sec = (n: number, over: Record<string, unknown> = {}) => ({
  sid: uid(n), type: "textblock", variant: "prose", content: { body: `본문 ${n}` }, ...over,
});
const cfg = (sections: unknown[]) => normalizeExpoPage({ sections });
const codes = (issues: Array<{ code: string }>) => issues.map((i) => i.code);

describe("발행할 수 있는가 — draft 를 본다", () => {
  it("섹션이 없으면 막고 이유를 준다", () => {
    expect(publishErrors({ sections: [] })).toEqual([expect.objectContaining({
      path: "sections", code: "no-sections", severity: "error",
    })]);
  });

  it("켜진 섹션이 하나라도 내용이 있으면 발행할 수 있다", () => {
    expect(publishErrors(cfg([sec(1)]))).toEqual([]);
  });

  /** 켜 놓고 비워 둔 섹션은 나가지 않는다 — 발행 전에 알려 준다. */
  it("켜져 있는데 빈 섹션을 짚어 준다", () => {
    const out = publishErrors(cfg([sec(1), sec(2, { content: {} })]));
    expect(codes(out)).toContain("empty-enabled-section");
    expect(out.find((i) => i.code === "empty-enabled-section")).toEqual(expect.objectContaining({
      path: "sections[1].content", severity: "error", sid: uid(2),
    }));
  });

  it("전부 꺼져 있으면 내보낼 게 없다고 말한다", () => {
    expect(publishErrors(cfg([sec(1, { enabled: false })]))).toEqual([expect.objectContaining({
      path: "sections", code: "no-renderable-section", severity: "error",
    })]);
  });
});

describe("blocking publish errors and non-blocking content warnings", () => {
  it("keeps warning severity and section identity separate from publish errors", () => {
    const hero = {
      sid: uid(8), type: "campaign-hero", variant: "default", enabled: true, content: {
        typingLines: [{ ko: "STK 2027" }],
        video: {
          kind: "video", url: "https://cdn.example.com/hero.mp4", originalUrl: "https://cdn.example.com/hero-original.mp4",
          mimeType: "video/mp4", rightsStatus: "unconfirmed",
        },
        ctas: [],
      },
    };
    const config = { schemaVersion: 2, sections: [hero] };
    expect(publishErrors(config)).toEqual([]);
    expect(contentWarnings(config)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "sections[0].content.video.rightsStatus", severity: "warning", sid: uid(8) }),
      expect.objectContaining({ path: "sections[0].content.ctas", severity: "warning", sid: uid(8) }),
    ]));
  });

  it("returns strict structural failures and unsafe destination URLs as blocking errors", () => {
    const config = {
      schemaVersion: 2,
      settings: { destinations: [{ id: "unsafe", label: "unsafe", action: { type: "url", href: "javascript:alert(1)" }, enabled: true }] },
      sections: [sec(1)],
    };
    expect(publishErrors(config)).toContainEqual(expect.objectContaining({
      path: "settings.destinations[0].action.href", code: "invalid-url", severity: "error",
    }));
  });
});

describe("공개 스위치를 켜도 되는가 — published 를 본다", () => {
  /** 스위치는 발행본을 내보내는 것이지 편집 중인 것을 내보내는 게 아니다. */
  it("발행본이 없으면 막는다", () => {
    expect(codes(liveIssues(null))).toEqual(["not-published"]);
  });

  it("발행본에 내보낼 섹션이 있으면 켤 수 있다", () => {
    expect(liveIssues(cfg([sec(1)]))).toEqual([]);
  });

  it("발행본이 전부 비었으면 막는다", () => {
    expect(codes(liveIssues(cfg([sec(1, { content: {} })])))).toContain("no-renderable-section");
  });
});

describe("섹션 코드를 복사할 수 있는가", () => {
  /** 부분 이행의 정의 — 페이지 공개 여부를 보지 않는다. */
  it("페이지가 공개 전이어도 발행·스위치·내용만 맞으면 된다", () => {
    expect(sectionSnippetIssues(cfg([sec(1, { embedEnabled: true, enabled: false })]), uid(1))).toEqual([]);
  });

  it("발행 전에는 복사할 수 없다", () => {
    expect(codes(sectionSnippetIssues(null, uid(1)))).toEqual(["not-published"]);
  });

  it("발행본에 없는 섹션이면 그렇게 말한다", () => {
    expect(codes(sectionSnippetIssues(cfg([sec(1)]), uid(9)))).toEqual(["section-not-published"]);
  });

  it("따로 붙이기가 꺼져 있으면 그 이유를 준다", () => {
    expect(codes(sectionSnippetIssues(cfg([sec(1, { embedEnabled: false })]), uid(1))))
      .toEqual(["section-embed-off"]);
  });

  it("내용이 비면 붙여도 안 나온다고 미리 말한다", () => {
    const out = sectionSnippetIssues(cfg([sec(1, { embedEnabled: true, content: {} })]), uid(1));
    expect(codes(out)).toContain("section-empty");
  });
});

describe("발행 뒤에 또 고쳤는가", () => {
  it("고친 시각이 발행 시각보다 뒤면 알린다", () => {
    const t0 = new Date("2026-08-21T10:00:00Z");
    const t1 = new Date("2026-08-21T10:05:00Z");
    expect(hasUnpublishedChanges({ publishedAt: t0, updatedAt: t1 })).toBe(true);
    expect(hasUnpublishedChanges({ publishedAt: t1, updatedAt: t0 })).toBe(false);
  });

  /** 발행 트랜잭션 자체가 updatedAt 을 건드린다 — 초 단위 오차로 오탐하면 안 된다. */
  it("같은 순간은 변경으로 보지 않는다", () => {
    const t = new Date("2026-08-21T10:00:00Z");
    expect(hasUnpublishedChanges({ publishedAt: t, updatedAt: new Date(t.getTime() + 300) })).toBe(false);
  });

  it("발행한 적이 없으면 해당 없음", () => {
    expect(hasUnpublishedChanges({ publishedAt: null, updatedAt: new Date() })).toBe(false);
  });
});

describe("pageReadiness — 카드 한 장이 보여줄 것", () => {
  it("발행·공개 가능 여부와 안내를 함께 준다", () => {
    const r = pageReadiness({
      draft: cfg([sec(1)]),
      published: null,
      publishedAt: null,
      updatedAt: new Date(),
      imwebUrl: null,
    });
    expect(r.canPublish).toBe(true);
    expect(r.canGoLive).toBe(false);
    expect(codes(r.liveIssues)).toEqual(["not-published"]);
    // 아임웹 주소가 없으면 다른 페이지가 이 페이지로 링크를 못 건다.
    expect(codes(r.notes)).toContain("no-imweb-url");
  });
});

describe("문구", () => {
  /** 사유를 추가하면 문구도 같이 있어야 한다 — 한쪽만 고쳐지는 것을 막는다. */
  it("모든 사유에 운영자용 문구가 있다", () => {
    for (const [code, message] of Object.entries(EXPO_READINESS_MESSAGES)) {
      expect(`${code}: ${message.trim() !== ""}`).toBe(`${code}: true`);
      expect(message).not.toMatch(/undefined|null/);
    }
  });

  /**
   * 편집기가 사용자에게 쓰는 말은 **"구획" 하나뿐이다** — 카탈로그("구획 추가"), 카드 삭제
   * 라벨, 개수 경고("한 페이지에 구획은 40개까지예요"), 따로 내보내기 토글이 전부 그렇다.
   * 그런데 이 문구들은 **같은 화면 안에** 뜬다(발행 패널·구획 카드 아래). 여기서만 "섹션"
   * 이라고 하면 비개발자는 그게 다른 것인 줄 안다.
   */
  it("화면 문구에 '섹션' 을 쓰지 않는다 — 편집기는 '구획' 이라고 부른다", () => {
    for (const [code, message] of Object.entries(EXPO_READINESS_MESSAGES)) {
      expect(`${code}: ${message.includes("섹션")}`).toBe(`${code}: false`);
    }
  });

  /** 사유가 컨트롤을 가리킬 땐 **화면에 실제로 있는 이름**이어야 한다. */
  it("따로 내보내기 사유는 토글 이름을 그대로 부른다", () => {
    expect(EXPO_READINESS_MESSAGES["section-embed-off"]).toContain("이 구획만 따로 내보내기");
  });
});
