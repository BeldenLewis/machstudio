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

  it.each([null, "cta", 42, [], ["unsafe"]])(
    "successCta가 객체가 아니거나 배열인 %j이면 안전한 비활성 기본값을 쓴다",
    (successCta) => {
      expect(normalizeRegistrationForm({
        registrationForm: { successCta },
      }).successCta).toEqual({
        enabled: false,
        label: "",
        url: "",
      });
    },
  );
});

describe("대기 안내문·CTA 설정", () => {
  it("인원 밴드와 독립된 기본값을 갖는다", () => {
    const waiting = normalizeLivePageConfig({}).waiting;
    expect(waiting.social).toBe(true);
    expect(waiting.followUp).toEqual({
      enabled: false,
      title: "",
      text: "",
      items: [],
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
      title: "",
      text: "라이브 자료는\n종료 후 보내드려요.",
      items: [],
      ctaLabel: "행사 안내 보기",
      ctaUrl: "https://example.com/guide",
    });
  });

  /** 제목은 선택 필드다 — 비우면 뷰가 제목 줄 자체를 그리지 않는다(기존 웨비나 화면 불변). */
  it("제목을 보존하고, 문자열이 아니면 빈 값으로 떨어진다", () => {
    const withTitle = normalizeLivePageConfig({
      livePage: { waiting: { followUp: { enabled: true, title: "오픈채팅방에서 미리 만나요" } } },
    }).waiting.followUp;
    expect(withTitle.title).toBe("오픈채팅방에서 미리 만나요");

    for (const bad of [null, 42, [], {}]) {
      expect(normalizeLivePageConfig({
        livePage: { waiting: { followUp: { enabled: true, title: bad } } },
      }).waiting.followUp.title).toBe("");
    }
  });

  /** 항목은 행 단위로 받는다 — 빈 줄·비문자열은 걸러야 화면에 빈 칸이 생기지 않는다. */
  it("항목의 공백을 다듬고 빈 값·비문자열을 버린다", () => {
    const items = normalizeLivePageConfig({
      livePage: { waiting: { followUp: { enabled: true, items: ["  컬럼  ", "", "   ", 42, null, "기사"] } } },
    }).waiting.followUp.items;
    expect(items).toEqual(["컬럼", "기사"]);
  });

  it("items 가 배열이 아니면 빈 배열", () => {
    for (const bad of [null, "a,b", 42, {}]) {
      expect(normalizeLivePageConfig({
        livePage: { waiting: { followUp: { enabled: true, items: bad } } },
      }).waiting.followUp.items).toEqual([]);
    }
  });

  it.each([null, "follow-up", 42, [], ["unsafe"]])(
    "waiting.followUp이 객체가 아니거나 배열인 %j이면 안전한 빈 기본값을 쓴다",
    (followUp) => {
      expect(normalizeLivePageConfig({
        livePage: { waiting: { followUp } },
      }).waiting.followUp).toEqual({
        enabled: false,
        title: "",
        text: "",
        items: [],
        ctaLabel: "",
        ctaUrl: "",
      });
    },
  );
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

describe("등록 완료 후 이동 주소", () => {
  /**
   * successCta(새 탭 부가 링크)와 **다른 자리**다 — 이건 확인 버튼이 같은 탭에서 넘어갈 목적지다.
   * 하나로 합치면 "닫기만 하고 싶은데 이동해 버린다" 는 경우를 표현할 수 없다.
   */
  it("기존 웨비나는 빈 값 — 확인은 모달만 닫는다", () => {
    expect(normalizeRegistrationForm({}).successRedirectUrl).toBe("");
  });

  it("문자열이면 그대로 보존한다(안전성 판정은 뷰어의 safeHttpUrl 몫)", () => {
    expect(normalizeRegistrationForm({
      registrationForm: { successRedirectUrl: "https://example.com/next" },
    }).successRedirectUrl).toBe("https://example.com/next");
  });

  it.each([null, 42, [], {}])("문자열이 아니면(%j) 빈 값", (bad) => {
    expect(normalizeRegistrationForm({
      registrationForm: { successRedirectUrl: bad },
    }).successRedirectUrl).toBe("");
  });

  it("successCta 와 독립이다", () => {
    const form = normalizeRegistrationForm({
      registrationForm: {
        successCta: { enabled: true, label: "오픈채팅", url: "https://example.com/chat" },
        successRedirectUrl: "https://example.com/thanks",
      },
    });
    expect(form.successCta.url).toBe("https://example.com/chat");
    expect(form.successRedirectUrl).toBe("https://example.com/thanks");
  });
});

describe("이 웨비나는 소개 카드", () => {
  /**
   * 세 칸 모두 **선택**이다 — 비면 뷰가 웨비나 기본정보(이름·설명)로 떨어진다.
   * 기본값을 config 에 심지 않는 이유: 기존 웨비나의 화면이 조용히 바뀌면 안 된다.
   */
  it("기존 웨비나는 세 칸이 모두 빈 값", () => {
    expect(normalizeLivePageConfig({}).waiting.about).toEqual({ eyebrow: "", title: "", body: "" });
  });

  it("채운 값을 그대로 보존한다 — 줄바꿈까지", () => {
    const about = normalizeLivePageConfig({
      livePage: { waiting: { about: { eyebrow: "이번 세션은", title: "LA 진출 실전", body: "첫 줄\n둘째 줄" } } },
    }).waiting.about;
    expect(about).toEqual({ eyebrow: "이번 세션은", title: "LA 진출 실전", body: "첫 줄\n둘째 줄" });
  });

  it.each([null, 42, [], {}])("문자열이 아니면(%j) 빈 값으로 떨어진다", (bad) => {
    const about = normalizeLivePageConfig({
      livePage: { waiting: { about: { eyebrow: bad, title: bad, body: bad } } },
    }).waiting.about;
    expect(about).toEqual({ eyebrow: "", title: "", body: "" });
  });

  it("about 자체가 객체가 아니어도 안전하다", () => {
    for (const bad of [null, "about", 42, []]) {
      expect(normalizeLivePageConfig({
        livePage: { waiting: { about: bad } },
      }).waiting.about).toEqual({ eyebrow: "", title: "", body: "" });
    }
  });
});
