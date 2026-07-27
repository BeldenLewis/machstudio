import { describe, expect, it } from "vitest";
import { DEFAULT_LANDING_AUDIENCE_TITLE, normalizeLandingPageConfig } from "@/lib/webinar-config";
import { buildLandingModel } from "@/lib/landing/build-model";
import type { LandingWebinar } from "@/lib/landing/types";

/**
 * "이런 분들께 추천합니다" 섹션 — 새로 생긴 섹션이 기존 섹션들과 **같은 규칙**을 쓰는지 고정한다.
 *   · 이중 게이트(토글 ON + 제목 있는 항목 ≥ 1)
 *   · 편집 중에는 제목 없는 행도 살린다(keepEmptyRows) — 타이핑 중 행이 사라지지 않게
 *   · 머리글 기본 문구 폴백은 **모델에서 한 번만** — 정규화는 원문을 통과시킨다
 *     (그래야 나중에 기본 문구를 고치면 "저장 안 한 웨비나"에도 같이 반영된다)
 */

const webinar = (landing: Record<string, unknown>): LandingWebinar => ({
  id: "t", name: "테스트 웨비나", slug: "t", description: null,
  liveStartAt: "2026-08-20T10:00:00.000Z",
  theme: { accentColor: "#6d28d9" },
  config: { landingPage: { enabled: true, ...landing } },
  sessions: [],
});
const model = (landing: Record<string, unknown>) =>
  buildLandingModel(webinar(landing), { uid: "x", embedded: false, isPreview: true, origin: "" });

describe("저장 왕복", () => {
  it("머리글·아이콘·설명이 살아남고, 제목 없는 행은 공개 렌더에서만 빠진다", () => {
    const raw = {
      landingPage: {
        enabled: true,
        audience: {
          enabled: true,
          title: "이런 고민이 있다면",
          items: [
            { icon: "🎯", title: "마케터", description: "리드를 매출로" },
            { icon: "", title: "", description: "제목 없는 행" },
          ],
        },
      },
    };
    // 편집 중 — 제목 없는 행도 살아 있어야 타이핑 중 사라지지 않는다
    const editing = normalizeLandingPageConfig(raw, { keepEmptyRows: true });
    expect(editing.audience.items).toHaveLength(2);
    expect(editing.audience.title).toBe("이런 고민이 있다면");
    expect(editing.audience.items[0].icon).toBe("🎯");

    // 공개 렌더 — 제목 없는 행은 빠진다(프로그램·FAQ 와 같은 규칙)
    const publicView = normalizeLandingPageConfig(raw);
    expect(publicView.audience.items).toHaveLength(1);
    expect(publicView.audience.items[0].description).toBe("리드를 매출로");
  });

  it("audience 키가 없는 옛 config 도 깨지지 않는다 — 기본 ON + 빈 목록이라 이중 게이트로 안 나간다", () => {
    const lp = normalizeLandingPageConfig({ landingPage: { enabled: true } });
    expect(lp.audience.enabled).toBe(true);
    expect(lp.audience.items).toEqual([]);
    expect(model({}).showAudience).toBe(false);
  });
});

describe("머리글 폴백 — 모델에서 한 번만", () => {
  it("비었거나 공백만이면 기본 문구가 나간다", () => {
    for (const title of [undefined, "", "   "]) {
      const m = model({ audience: { enabled: true, title, items: [{ title: "마케터" }] } });
      expect(m.audienceTitle, JSON.stringify(title)).toBe(DEFAULT_LANDING_AUDIENCE_TITLE);
    }
  });

  it("입력한 문구가 있으면 그대로 — 앞뒤 공백은 떼어 낸다", () => {
    expect(model({ audience: { enabled: true, title: "  이런 고민이 있다면  ", items: [{ title: "마케터" }] } }).audienceTitle)
      .toBe("이런 고민이 있다면");
  });
});

describe("이중 게이트", () => {
  it("토글을 끄면 항목이 있어도 안 나간다", () => {
    expect(model({ audience: { enabled: false, items: [{ title: "마케터" }] } }).showAudience).toBe(false);
  });

  it("토글이 켜져 있어도 제목 있는 항목이 없으면 안 나간다", () => {
    expect(model({ audience: { enabled: true, items: [{ title: "  " }] } }).showAudience).toBe(false);
    expect(model({ audience: { enabled: true, items: [{ title: "마케터" }] } }).showAudience).toBe(true);
  });

  it("목차에는 나갈 때만 실린다 — 없는 섹션으로 스크롤하는 링크를 만들지 않는다", () => {
    const off = model({ audience: { enabled: true, items: [] } }).tocItems.map((t) => t.id);
    expect(off).not.toContain("lnd-audience");
    const on = model({ audience: { enabled: true, items: [{ title: "마케터" }] } }).tocItems.map((t) => t.id);
    expect(on).toContain("lnd-audience");
    /**
     * Join 바로 앞 — 참여 방법을 읽기 직전에 "내 얘기인가" 를 확인시키고 등록으로 넘긴다.
     * 처음엔 About 다음에 뒀는데, 그 자리는 dark-zone 밖이라 세션·타임테이블 구간에서
     * 키컬러 배경이 섹션을 통과해 비쳤다(mount.ts 주석).
     */
    const withJoin = model({
      audience: { enabled: true, items: [{ title: "마케터" }] },
      join: { enabled: true, steps: [{ title: "사전 등록" }] },
    }).tocItems.map((t) => t.id);
    expect(withJoin.indexOf("lnd-audience")).toBe(withJoin.indexOf("lnd-join") - 1);
  });
});
