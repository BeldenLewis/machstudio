import { describe, expect, it } from "vitest";
import {
  normalizeLivePageConfig,
  normalizeRegistrationForm,
  safeHttpUrl,
} from "@/lib/webinar-config";

describe("등록 완료 CTA 설정", () => {
  it("기존 웨비나는 CTA가 꺼진 빈 설정으로 정규화된다", () => {
    expect(normalizeRegistrationForm({}).successCta).toEqual({
      enabled: false,
      label: "",
      url: "",
    });
  });

  it("운영자가 저장한 ON·문구·URL을 보존한다", () => {
    expect(normalizeRegistrationForm({
      registrationForm: {
        successCta: {
          enabled: true,
          label: "오픈채팅 입장",
          url: "https://example.com/chat",
        },
      },
    }).successCta).toEqual({
      enabled: true,
      label: "오픈채팅 입장",
      url: "https://example.com/chat",
    });
  });
});

describe("대기 안내문·CTA 설정", () => {
  it("인원 밴드와 독립된 기본값을 갖는다", () => {
    const waiting = normalizeLivePageConfig({}).waiting;
    expect(waiting.social).toBe(true);
    expect(waiting.followUp).toEqual({
      enabled: false,
      text: "",
      ctaLabel: "",
      ctaUrl: "",
    });
  });

  it("줄바꿈 문구와 CTA 설정을 보존한다", () => {
    const waiting = normalizeLivePageConfig({
      livePage: {
        waiting: {
          social: false,
          followUp: {
            enabled: true,
            text: "라이브 자료는\n종료 후 보내드려요.",
            ctaLabel: "행사 안내 보기",
            ctaUrl: "https://example.com/guide",
          },
        },
      },
    }).waiting;
    expect(waiting.social).toBe(false);
    expect(waiting.followUp).toEqual({
      enabled: true,
      text: "라이브 자료는\n종료 후 보내드려요.",
      ctaLabel: "행사 안내 보기",
      ctaUrl: "https://example.com/guide",
    });
  });
});

describe("공개 CTA URL", () => {
  it("http(s)만 통과시키고 실행 가능한 스킴은 버린다", () => {
    expect(safeHttpUrl("https://example.com")).toBe("https://example.com");
    expect(safeHttpUrl("http://example.com")).toBe("http://example.com");
    expect(safeHttpUrl("javascript:alert(1)")).toBe("");
    expect(safeHttpUrl("data:text/html,test")).toBe("");
    expect(safeHttpUrl("/relative")).toBe("");
  });
});
