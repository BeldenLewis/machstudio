import { describe, expect, it } from "vitest";
import { SURFACES, buildExposureReport, goesFor, type ExposureInput } from "@/lib/webinar-exposure";
import { buildLandingModel } from "@/lib/landing/build-model";

/**
 * 이 표가 답하는 질문은 "무엇이 어느 면에 나가는가" 다. 그래서 고정해야 하는 것은 개별 문구가
 * 아니라 **판정 규칙**이다 — 특히 "켜 놨는데 비었다"(empty)와 "안 채웠지만 기본값이 나간다"
 * (default)의 구분, 그리고 랜딩 결론이 실제 랜딩 뷰와 **한 벌인지**(사본 0개).
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

const make = (patch: Partial<ExposureInput> = {}) => buildExposureReport({ ...base, ...patch });
const row = (r: ReturnType<typeof make>, id: string) => r.elements.find((e) => e.id === id)!;

describe("면", () => {
  it("공개 면은 6개이고 설문은 면이 아니다 — 4곳에 동시 노출되는 횡단 요소라 층위가 안 맞는다", () => {
    expect(SURFACES.map((s) => s.id)).toEqual(["landing", "signup", "waiting", "entry", "live", "ended"]);
    expect(SURFACES.map((s) => s.id)).not.toContain("survey");
  });

  it("랜딩은 enabled 로 off 가 된다 — 새 플래그를 만들지 않았다는 증거", () => {
    expect(make().surfaces.find((s) => s.id === "landing")!.use).toBe("off");
    expect(make({ config: { landingPage: { enabled: true } } }).surfaces.find((s) => s.id === "landing")!.use).toBe("on");
  });

  it("등록 폼은 canRegister 파생이고, 모르면 unknown — 추측한 점은 안 그린다", () => {
    expect(make().surfaces.find((s) => s.id === "signup")!.use).toBe("unknown");
    expect(make({ canRegister: false }).surfaces.find((s) => s.id === "signup")!.use).toBe("off");
    expect(make({ canRegister: true }).surfaces.find((s) => s.id === "signup")!.use).toBe("on");
  });

  it("대기·입장·종료는 '누구나' 다 — 예전 레일 점이 시청 화면을 통째로 '등록자만' 이라 한 건 면 단위로 거짓이었다", () => {
    const s = make().surfaces;
    for (const id of ["waiting", "entry", "ended"] as const) {
      expect(s.find((x) => x.id === id)!.audience, id).toBe("누구나");
    }
    // '등록자만' 은 라이브 시청 면에만 남는다(그 안의 영상이 실제 제약이다)
    expect(s.find((x) => x.id === "live")!.audience).toBe("등록자");
  });

  it("off 인 면은 이유를 한 줄 말한다 — 점만 회색으로 바뀌면 왜인지 알 수 없다", () => {
    const landing = make().surfaces.find((s) => s.id === "landing")!;
    expect(landing.offReason).toContain("공개가 꺼져");
  });
});

describe("요소 — empty 와 default 를 구분한다", () => {
  it("종료 인사말을 비워도 empty 가 아니다 — 뷰어가 기본 문구를 쓰도록 일부러 통과시킨 값이다", () => {
    const r = row(make(), "ended.title");
    expect(r.state).toBe("default");
    expect(r.why).toContain("기본");
  });

  it("랜딩 참여 방법은 입력하지 않으면 기본 3스텝이 나간다 — 이중 게이트의 유일한 예외", () => {
    const r = row(make({ config: { landingPage: { enabled: true } } }), "landing.join");
    expect(r.state).toBe("default");
    expect(r.why).toContain("기본 참여 절차");
  });

  it("자료 영역을 켰는데 자료가 없으면 empty — 이건 진짜로 조용히 사라진다", () => {
    const on = make({ config: { livePage: { ended: { resources: true } } } });
    expect(row(on, "ended.resources").state).toBe("empty");
    const off = make({ config: { livePage: { ended: { resources: false } } } });
    expect(row(off, "ended.resources").state).toBe("off");
  });

  it("영상이 없으면 empty 이고 있으면 on", () => {
    expect(row(make(), "live.video").state).toBe("empty");
    expect(row(make({ config: { youtubeId: "dQw4w9WgXcQ" } }), "live.video").state).toBe("on");
  });
});

describe("요소 — 약속만 있고 렌더처가 없는 것(broken)", () => {
  it("정확히 2건이다 — 세 번째가 조용히 늘거나 렌더처가 생겨 목록이 거짓이 되는 것을 막는다", () => {
    const r = make();
    const broken = r.elements.filter((e) => e.state === "broken").map((e) => e.id);
    expect(broken).toEqual(["waiting.social", "live.infoContact"]);
    expect(r.brokenCount).toBe(2);
  });

  it("broken 은 운영자 카운트(emptyCount)에 섞이지 않는다 — 코드 결함이라 '확인할 것' 이 아니다", () => {
    const r = make();
    expect(r.emptyCount).toBe(r.elements.filter((e) => e.state === "empty").length);
    expect(r.elements.filter((e) => e.state === "broken").every((e) => e.why)).toBe(true);
  });
});

describe("설문 — 모르는 값을 '없음' 으로 단정하지 않는다", () => {
  const surveyOn = { livePage: { ended: { survey: true } } };

  it("연결된 설문이 없으면 empty", () => {
    expect(row(make({ config: surveyOn }), "ended.survey").state).toBe("empty");
  });

  it("아직 확인 중이면 empty 로 단정하지 않는다 — fetch 실패를 '설문 없음' 으로 오답하면 안 된다", () => {
    const r = row(make({ config: surveyOn, hasLinkedEndedSurvey: null }), "ended.survey");
    expect(r.state).not.toBe("empty");
    expect(r.why).toContain("확인하는 중");
  });

  it("외부 URL 만 있어도 on", () => {
    const r = row(make({ config: { ...surveyOn, surveyUrl: "https://tally.so/x" } }), "ended.survey");
    expect(r.state).toBe("on");
  });
});

describe("랜딩 결론이 실제 랜딩 뷰와 한 벌인가 — 사본 0개 증명", () => {
  const cfg = {
    landingPage: {
      enabled: true,
      titleLines: ["제목"],
      programs: { enabled: true, items: [{ title: "프로그램 A" }] },
      highlights: { enabled: true, items: [] },
      faq: { enabled: true, items: [{ question: "질문", answer: "답" }] },
    },
  };
  const input: ExposureInput = { ...base, config: cfg, sessions: [] };

  it("같은 픽스처에서 표의 랜딩 결론과 buildLandingModel 의 show* 가 일치한다", () => {
    const rep = buildExposureReport(input);
    const lm = buildLandingModel(
      { id: "", name: input.name, slug: input.slug, description: input.description,
        liveStartAt: input.liveStartAt, theme: input.theme, config: cfg, sessions: [] },
      { uid: "x", embedded: false, isPreview: true, origin: "" },
    );
    const stateOf = (id: string) => row(rep, id).state === "on";
    expect(stateOf("landing.programs")).toBe(lm.showPrograms);
    expect(stateOf("landing.highlights")).toBe(lm.showHighlights);
    expect(stateOf("landing.faq")).toBe(lm.showFaq);
    expect(stateOf("landing.intro")).toBe(lm.showIntro);
  });

  it("랜딩이 꺼져 있으면 랜딩 요소는 전부 off — 경고를 쏟지 않는다", () => {
    const rep = make({ config: { landingPage: { enabled: false } } });
    const landingRows = rep.elements.filter((e) => e.owner === "landing");
    expect(landingRows.length).toBeGreaterThan(5);
    expect(landingRows.every((e) => e.state === "off")).toBe(true);
  });
});

describe("상태를 넘기지 않으면 CTA 를 틀리게 적는다", () => {
  it("종료된 웨비나는 '사전 등록하기' 를 그리지 않는다 — 상태 prop 전달이 빠지면 조용히 어긋난다", () => {
    const cfg = { landingPage: { enabled: true, titleLines: ["제목"] } };
    const lm = buildLandingModel(
      { id: "", name: "n", slug: "t", description: null, liveStartAt: base.liveStartAt,
        theme: base.theme, config: cfg, sessions: [], status: "ended", entryOpen: false, canRegister: false },
      { uid: "x", embedded: false, isPreview: true, origin: "" },
    );
    expect(lm.ctaLabel).not.toBe("사전 등록하기");
    // 표는 같은 인자를 넘긴다 — buildExposureReport 가 status 를 흘리지 않으면 이 대조가 무의미해진다
    const rep = buildExposureReport({ ...base, config: cfg, status: "ended", canRegister: false, entryOpen: false });
    expect(rep.surfaces.find((s) => s.id === "signup")!.use).toBe("off");
  });
});

describe("goesFor", () => {
  it("면 이름을 표에서 가져온다 — 화면에 보이는 글자가 바뀌지 않아야 한다", () => {
    expect(goesFor("waiting")).toEqual(["대기 화면"]);
    expect(goesFor("live")).toEqual(["라이브 시청"]);
    expect(goesFor("entry")).toEqual(["입장 확인"]);
    expect(goesFor("ended")).toEqual(["종료 화면"]);
  });
});

describe("사실 행 — 여러 면에 걸치는 값", () => {
  it("종료 화면은 웨비나 이름을 쓰지 않는다 — 실측한 빈칸이고, 빈칸이 있어야 표가 무언가를 가르친다", () => {
    expect(row(make(), "name").surfaces).not.toContain("ended");
  });

  it("일시가 나가는 곳은 랜딩·대기·입장 셋뿐이다 — 시청·종료는 일시를 렌더하지 않는다", () => {
    expect(row(make(), "startAt").surfaces).toEqual(["landing", "waiting", "entry"]);
  });

  it("브랜드 색은 6면 전부에 나간다", () => {
    expect(row(make(), "brand").surfaces).toHaveLength(SURFACES.length);
  });
});
