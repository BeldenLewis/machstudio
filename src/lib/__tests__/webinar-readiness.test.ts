import { describe, it, expect } from "vitest";
import { checkWebinarReadiness, readinessBySection, type ReadinessInput } from "@/lib/webinar-readiness";

/**
 * normalizeLivePageConfig 의 기본값은 **대부분 ON** 이다
 * (waiting.agenda·social·calendar·share·notify, entry.viewerCount, ended.replay·survey·share = true /
 *  ended.resources·nextWebinar = false). 그래서 빈 config 는 그 자체로 "켜졌지만 내용 없음" 을 만든다.
 * 아래 CLEAN 은 그 기본값들을 실제로 충족시킨 상태 — 여기서 출발해야 각 케이스가 한 가지만 검증한다.
 */
const CLEAN_CONFIG: Record<string, unknown> = {
  youtubeId: "abc12345678",
  calendarUrl: "https://calendar.example/e",
  surveyUrl: "https://tally.so/x",
};

const base = (over: Partial<ReadinessInput> = {}): ReadinessInput => ({
  name: "그로스 컨퍼런스",
  sessionCount: 3,
  hasLinkedEndedSurvey: false,
  config: CLEAN_CONFIG,
  ...over,
});

/** 케이스별로 CLEAN 위에 livePage 토글만 얹는다 — 다른 검사가 함께 켜지지 않게. */
const cfg = (over: Record<string, unknown>) => ({ ...CLEAN_CONFIG, ...over });

const titles = (input: ReadinessInput) => checkWebinarReadiness(input).map((i) => i.title);
const has = (input: ReadinessInput, needle: string) => titles(input).some((t) => t.includes(needle));

describe("이름·영상 — 시청자 여정이 막히는 것", () => {
  it("이름이 비면 blocking", () => {
    const issues = checkWebinarReadiness(base({ name: "   " }));
    const found = issues.find((i) => i.title.includes("이름"));
    expect(found?.severity).toBe("blocking");
  });

  it("영상 미연결은 blocking, 라이브 상태를 가리킨다", () => {
    const issues = checkWebinarReadiness(base({ config: { ...CLEAN_CONFIG, youtubeId: "" } }));
    const found = issues.find((i) => i.title.includes("라이브 영상"));
    expect(found?.severity).toBe("blocking");
    expect(found?.watchState).toBe("live");
  });

  it("정상 구성이면 아무것도 짚지 않는다", () => {
    expect(checkWebinarReadiness(base())).toEqual([]);
  });
});

/**
 * 이 describe 가 이 파일의 핵심이다 — 검사 기준은 "완성도" 가 아니라
 * **토글 ON + 내용 없음** 이라는 이중 게이트다. 켜져 있고 내용도 있으면 짚지 않아야 한다.
 */
describe("이중 게이트 — 켰는데 내용이 없을 때만 짚는다", () => {
  it("아젠다 ON + 세션 0개 → 짚는다", () => {
    expect(has(base({ sessionCount: 0, config: cfg({ livePage: { waiting: { agenda: true } } }) }), "아젠다")).toBe(true);
  });

  it("아젠다 ON + 세션 있음 → 안 짚는다", () => {
    expect(has(base({ sessionCount: 2, config: cfg({ livePage: { waiting: { agenda: true } } }) }), "아젠다")).toBe(false);
  });

  it("아젠다 OFF + 세션 0개 → 안 짚는다 (꺼 둔 건 문제가 아니다)", () => {
    expect(has(base({ sessionCount: 0, config: cfg({ livePage: { waiting: { agenda: false } } }) }), "아젠다")).toBe(false);
  });

  it("캘린더 ON + URL 없음 → 짚고, URL 있으면 안 짚는다", () => {
    const noUrl = { ...CLEAN_CONFIG, calendarUrl: "", livePage: { waiting: { calendar: true } } };
    expect(has(base({ config: noUrl }), "캘린더")).toBe(true);
    expect(has(base({ config: cfg({ livePage: { waiting: { calendar: true } } }) }), "캘린더")).toBe(false);
  });

  it("자료 ON + 자료 0개 → 짚고, 자료가 있으면 안 짚는다", () => {
    expect(has(base({ config: cfg({ livePage: { ended: { resources: true } } }) }), "자료")).toBe(true);
    const withRes = cfg({ livePage: { ended: { resources: true }, resources: [{ url: "https://a/b.pdf", label: "자료" }] } });
    expect(has(base({ config: withRes }), "자료")).toBe(false);
  });

  it("다음 웨비나 ON + 제목 없음 → 짚는다", () => {
    const on = cfg({ livePage: { ended: { nextWebinar: true }, nextWebinar: { title: "  ", when: "", url: "" } } });
    expect(has(base({ config: on }), "다음 웨비나")).toBe(true);
  });
});

describe("종료 설문 — 3중 조건이 맞아야 버튼이 뜬다", () => {
  const areaOn = { ...CLEAN_CONFIG, surveyUrl: "", livePage: { ended: { survey: true } } };

  it("영역만 켜고 대상이 없으면 짚는다", () => {
    expect(has(base({ config: areaOn }), "설문 영역")).toBe(true);
  });

  it("자체 설문이 연결돼 있으면 안 짚는다", () => {
    expect(has(base({ config: areaOn, hasLinkedEndedSurvey: true }), "설문 영역")).toBe(false);
  });

  it("외부 URL 이 있으면 안 짚는다", () => {
    expect(has(base({ config: { ...areaOn, surveyUrl: "https://tally.so/x" } }), "설문 영역")).toBe(false);
  });

  it("공백만 있는 URL 은 없는 것으로 본다", () => {
    expect(has(base({ config: { ...areaOn, surveyUrl: "   " } }), "설문 영역")).toBe(true);
  });
});

describe("등록 선택지 — 공백만 남으면 항목이 조용히 사라진다", () => {
  const withField = (options: unknown, extra: Record<string, unknown> = {}) => base({
    config: cfg({
      registrationForm: { fields: [{ id: "f1", type: "select", label: "관심 분야", enabled: true, options, ...extra }] },
    }),
  });

  it("옵션 0개 → 짚는다", () => {
    expect(has(withField([]), "관심 분야")).toBe(true);
  });

  it("공백만 있는 옵션 → 짚는다 (저장·정규화가 trim 으로 걸러 항목째 사라진다)", () => {
    expect(has(withField(["  ", ""]), "관심 분야")).toBe(true);
  });

  it("값이 하나라도 있으면 안 짚는다", () => {
    expect(has(withField(["", "마케팅"]), "관심 분야")).toBe(false);
  });

  it("필수로 켜 뒀으면 '등록은 막히지 않는다' 는 사실을 알려준다", () => {
    const issues = checkWebinarReadiness(withField([], { required: true }));
    expect(issues[0].detail).toContain("등록은 막히지 않아요");
  });

  it("꺼 둔 항목은 검사하지 않는다", () => {
    expect(has(withField([], { enabled: false }), "관심 분야")).toBe(false);
  });

  it("select 가 아닌 항목은 검사하지 않는다", () => {
    const input = base({
      config: cfg({ registrationForm: { fields: [{ id: "f1", type: "text", label: "이름", enabled: true }] } }),
    });
    expect(checkWebinarReadiness(input)).toEqual([]);
  });
});

describe("랜딩 — 공개했는데 빈 페이지", () => {
  it("공개 + 제목·본문 전부 없음 → 짚는다", () => {
    expect(has(base({ config: cfg({ landingPage: { enabled: true } }) }), "랜딩")).toBe(true);
  });

  it("제목이 있으면 안 짚는다", () => {
    expect(has(base({ config: cfg({ landingPage: { enabled: true, titleLines: ["함께 성장하는 법"] } }) }), "랜딩")).toBe(false);
  });

  it("본문 섹션이 있으면 안 짚는다", () => {
    const withFaq = cfg({ landingPage: { enabled: true, faq: { items: [{ q: "질문", a: "답" }] } } });
    expect(has(base({ config: withFaq }), "랜딩")).toBe(false);
  });

  it("비공개면 내용이 없어도 안 짚는다", () => {
    expect(has(base({ config: cfg({ landingPage: { enabled: false } }) }), "랜딩")).toBe(false);
  });
});

describe("입력 방어", () => {
  it("config 가 null·undefined 여도 죽지 않는다", () => {
    expect(() => checkWebinarReadiness(base({ config: null }))).not.toThrow();
    expect(() => checkWebinarReadiness(base({ config: undefined }))).not.toThrow();
  });

  it("드리프트된 JSON(배열·문자열)도 견딘다", () => {
    const weird = cfg({ registrationForm: "망가진 값", landingPage: [1, 2] }) as unknown as Record<string, unknown>;
    expect(() => checkWebinarReadiness(base({ config: weird }))).not.toThrow();
  });
});

describe("readinessBySection", () => {
  it("섹션별로 센다", () => {
    const issues = checkWebinarReadiness(base({ name: "", config: { ...CLEAN_CONFIG, youtubeId: "" } }));
    const by = readinessBySection(issues);
    expect(by.source).toBe(1); // 이름
    expect(by.watch).toBe(1);  // 영상
    expect(by.survey).toBe(0);
  });

  it("갓 만든 웨비나(빈 config)는 기본값 때문에 이미 미완이 있다 — 기본값 ON 을 문서화", () => {
    const issues = checkWebinarReadiness(base({ config: {} }));
    const t = issues.map((i) => i.title).join(" | ");
    expect(t).toContain("라이브 영상");   // youtubeId 없음
    expect(t).toContain("캘린더");        // waiting.calendar 기본 ON + URL 없음
    expect(t).toContain("설문 영역");     // ended.survey 기본 ON + 대상 없음
  });
});
