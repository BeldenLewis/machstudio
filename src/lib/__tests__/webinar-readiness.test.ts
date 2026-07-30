import { describe, expect, it } from "vitest";
import { buildExposureReport, type ExposureInput } from "@/lib/webinar-exposure";
import { readinessBySection, readinessFromExposure } from "@/lib/webinar-readiness";

/**
 * 준비 상태는 이제 노출 표의 **파생**이다. 그래서 이 파일이 지켜야 하는 것이 바뀌었다:
 * 게이트 식이 아니라 **파생 규칙**과, 예전 판정기가 틀렸던 자리들이 이제 맞는지다.
 *
 * 옛 테스트는 그 오판을 정답으로 못 박아 두고 있었다 — 예: FAQ 항목을 `{q, a}` 키로 만들어
 * "본문 있음" 을 기대했는데, 정규화·뷰어는 `question` 키만 읽으므로 그 랜딩에는 FAQ 가 없다.
 * 아래 케이스들은 전부 **뷰어 기준**으로 다시 썼다.
 */

const base: ExposureInput = {
  name: "테스트 웨비나",
  description: "설명",
  slug: "t",
  liveStartAt: "2026-08-20T10:00:00.000Z",
  theme: { accentColor: "#6d28d9" },
  config: {},
  sessions: [],
  hasOpenSurvey: false,
  hasLinkedEndedSurvey: false,
};

const issues = (patch: Partial<ExposureInput> = {}) => readinessFromExposure(buildExposureReport({ ...base, ...patch }));
const titles = (patch: Partial<ExposureInput> = {}) => issues(patch).map((i) => i.title);
/** 영상은 어떤 픽스처에서도 비어 있으면 걸린다 — 다른 케이스를 볼 때 노이즈라 유효한 ID 를 넣는다. */
const withVideo = (config: Record<string, unknown> = {}) => ({ config: { youtubeId: "dQw4w9WgXcQ", ...config } });

describe("파생 규칙", () => {
  it("empty 인 행만 확인할 것이 된다 — broken(코드 결함)과 default(기본값 나감)는 제외", () => {
    const report = buildExposureReport({ ...base, ...withVideo() });
    const list = readinessFromExposure(report);
    expect(report.elements.some((e) => e.state === "broken")).toBe(true);
    expect(report.elements.some((e) => e.state === "default")).toBe(true);
    expect(list).toHaveLength(report.elements.filter((e) => e.state === "empty").length);
    expect(list.every((i) => i.severity === "blocking" || i.severity === "empty")).toBe(true);
  });

  it("여정을 막는 것이 목록 맨 앞에 온다 — 상위 4건만 보여 주므로 밀리면 그 자리가 제 일을 못 한다", () => {
    // 랜딩을 켜고 전부 비워 empty 를 여러 건 만든 뒤, 영상도 비워 blocking 을 섞는다
    const list = issues({
      config: {
        landingPage: { enabled: true, intro: { enabled: true }, programs: { enabled: true }, faq: { enabled: true } },
      },
    });
    expect(list.length).toBeGreaterThan(3);
    expect(list[0].severity).toBe("blocking");
    // blocking 이 전부 앞에 모여 있다
    const firstEmpty = list.findIndex((i) => i.severity === "empty");
    expect(list.slice(firstEmpty).every((i) => i.severity === "empty")).toBe(true);
  });

  it("고치러 갈 자리를 detail 에 적는다 — 시청 화면은 상태까지", () => {
    const list = issues({ config: { livePage: { ended: { resources: true } } } });
    const resources = list.find((i) => i.title.includes("자료"))!;
    expect(resources.section).toBe("watch");
    expect(resources.watchState).toBe("ended");
    expect(resources.detail).toBe("시청 화면 › 종료에서 고칠 수 있어요.");
  });

  /**
   * 개수만 적으면 무엇이 세어졌는지 알 수 없고, 기본값 ON 인 토글(대기 아젠다)을 잊어
   * 기대값을 잘못 쓰기 쉽다 — 실제로 처음 3이라고 적었다가 틀렸다.
   *
   * 캘린더는 이 목록에서 빠졌다. 링크를 운영자가 붙여 넣던 설정을 없애고 웨비나 일정에서
   * 만들도록 바꿨으므로(webinar-calendar.ts) **채울 값이 없어 경고할 것도 없다** —
   * 예전에는 URL 미입력이 "켰는데 안 나오는" 상태를 만들어 모바일 배너가 아예 안 떴다.
   */
  it("섹션별 개수는 파생 목록에서 센다 — 시청 화면 4건은 대기 기본 토글까지 포함이다", () => {
    const list = issues({ config: { livePage: { ended: { resources: true, nextWebinar: true } } } });
    expect(list.filter((i) => i.section === "watch").map((i) => i.title)).toEqual([
      "영상이 연결되지 않아 방송이 시작돼도 화면에 아무것도 안 나와요.", // blocking 이 먼저
      "아젠다를 켰지만 세션이 없어요.",                                  // waiting.agenda 기본 ON
      "자료 영역을 켰지만 자료가 없어요.",
      "다음 웨비나를 켰지만 제목이 없어요.",
    ]);
    const by = readinessBySection(list);
    expect(by.watch).toBe(4);
    expect(by.landing).toBe(0); // 랜딩이 꺼져 있으면 랜딩 행은 전부 off — 경고를 쏟지 않는다
  });
});

describe("예전 판정기가 틀렸던 자리 — 이제 뷰어와 같은 답을 낸다", () => {
  /**
   * 뷰어: PreLiveWaiting `showAgenda = live.waiting.agenda && webinar.sessions.length > 0`.
   * 유형을 가리지 않는다. 예전 준비 상태는 실제 세션(type=session)만 세어 경고했고,
   * 그 말을 믿고 토글을 끄면 그때 실제로 아젠다가 사라졌다.
   */
  it("오프닝·Q&A 만 있어도 아젠다는 나간다 — 경고하지 않는다", () => {
    const sessions = [
      { id: "1", title: "오프닝", type: "opening", number: 1 },
      { id: "2", title: "Q&A", type: "qa", number: 2 },
    ] as unknown as ExposureInput["sessions"];
    expect(titles({ ...withVideo(), sessions }).some((t) => t.includes("아젠다"))).toBe(false);
    // 세션이 아예 없으면 정상적으로 걸린다
    expect(titles({ ...withVideo() }).some((t) => t.includes("아젠다"))).toBe(true);
  });

  /**
   * 뷰어: 정규화가 제목 없는 행을 버린다. 예전엔 원시 배열 길이를 세어 제목 빈 행 하나로
   * 랜딩 경고 전체가 꺼졌다("본문 있음" 으로 계산돼서).
   */
  it("제목 없는 프로그램 행은 내용으로 세지 않는다", () => {
    const cfg = (items: unknown[]) =>
      withVideo({ landingPage: { enabled: true, titleLines: ["제목"], programs: { enabled: true, items } } }).config;
    expect(titles({ config: cfg([{ title: "" }]) }).some((t) => t.includes("프로그램"))).toBe(true);
    expect(titles({ config: cfg([{ title: "세션 A" }]) }).some((t) => t.includes("프로그램"))).toBe(false);
  });

  /** 섹션을 **일부러 끈** 랜딩은 문제가 아니다 — 예전엔 off 가 나올 길이 없어 거짓 경고가 났다. */
  it("FAQ 를 끈 랜딩은 경고하지 않는다", () => {
    const off = titles({ config: withVideo({ landingPage: { enabled: true, titleLines: ["제목"], faq: { enabled: false, items: [] } } }).config });
    expect(off.some((t) => t.includes("FAQ"))).toBe(false);
    const on = titles({ config: withVideo({ landingPage: { enabled: true, titleLines: ["제목"], faq: { enabled: true, items: [] } } }).config });
    expect(on.some((t) => t.includes("FAQ"))).toBe(true);
  });

  /**
   * 뷰어: 참여 절차는 steps 키가 없으면 기본 3단계가 주입된다. 예전엔 0으로 세어
   * '빈 페이지' 경고를 만들었다 — 있지도 않은 문제였다.
   */
  it("랜딩을 켜기만 한 상태에서 '빈 페이지' 경고를 만들지 않는다", () => {
    const list = titles({ config: withVideo({ landingPage: { enabled: true } }).config });
    expect(list.some((t) => t.includes("빈 페이지"))).toBe(false);
  });

  /** #144 로 생긴 복수 선택 — 예전 루프는 `type !== "select"` 로 걸러 이걸 못 봤다. */
  it("복수 선택도 선택지 0개면 걸린다 — 선택형 두 종류가 같은 게이트를 쓴다", () => {
    for (const type of ["select", "multiple"]) {
      const list = titles({
        config: withVideo({ registrationForm: { fields: [{ key: "job", label: "직무", type, enabled: true, required: true, options: [] }] } }).config,
      });
      expect(list.some((t) => t.includes("선택지가 없어")), type).toBe(true);
    }
  });

  /** '기타(직접입력)' 만으로도 답할 수 있는 항목은 정상이다 — 예전엔 고장으로 신고했다. */
  it("기타(직접입력)가 켜져 있으면 선택지 0개여도 경고하지 않는다", () => {
    const list = titles({
      config: withVideo({ registrationForm: { fields: [{ key: "src", label: "유입경로", type: "multiple", enabled: true, options: [], allowOther: true }] } }).config,
    });
    expect(list.some((t) => t.includes("선택지가 없어"))).toBe(false);
  });

  it("끈 필드는 경고하지 않는다 — 의도된 부재다", () => {
    const list = titles({
      config: withVideo({ registrationForm: { fields: [{ key: "job", label: "직무", type: "select", enabled: false, options: [] }] } }).config,
    });
    expect(list.some((t) => t.includes("선택지가 없어"))).toBe(false);
  });
});

describe("여정을 막는 것", () => {
  it("이름과 영상은 blocking — 나머지 empty 와 급한 정도가 다르다", () => {
    const noName = issues({ name: "", ...withVideo() });
    expect(noName.find((i) => i.title.includes("이름"))!.severity).toBe("blocking");
    const noVideo = issues().find((i) => i.title.includes("영상"))!;
    expect(noVideo.severity).toBe("blocking");
    expect(noVideo.watchState).toBe("live");
  });

  /**
   * 뷰어는 getYouTubeVideoId 로 11자 ID 를 뽑아내야 iframe 을 그린다. 빈 문자열만 보던 동안
   * 이런 값이 "연결됨" 으로 읽혀 운영자가 그대로 방송에 들어갔다.
   */
  it("유튜브 ID 를 읽을 수 없는 주소는 '연결됨' 이 아니다", () => {
    const bad = titles({ config: { youtubeId: "https://www.youtube.com/@brand/live" } });
    expect(bad.some((t) => t.includes("유튜브 ID를 읽지 못했어요"))).toBe(true);
    expect(titles({ config: { youtubeId: "https://youtu.be/dQw4w9WgXcQ" } }).some((t) => t.includes("영상"))).toBe(false);
  });
});
