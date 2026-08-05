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

describe("랜딩 — 섹션을 끈 것과 켜 놓고 비운 것은 다르다", () => {
  /**
   * 이 구분이 없던 동안 `lm.show*`(= enabled && hasItems) 하나만 보고 판정해서, FAQ·하이라이트를
   * 안 쓰는 정상 웨비나가 "켰지만 항목이 없어요" 경고 3건을 받았다. off 상태가 나올 길이 없었다.
   */
  const cfg = (section: string, enabled: boolean, items: unknown[] = []) => ({
    landingPage: { enabled: true, titleLines: ["제목"], [section]: { enabled, items } },
  });

  it("섹션을 끄면 off — 경고가 아니다", () => {
    for (const key of ["intro", "audience", "programs", "highlights", "faq", "sponsors"]) {
      expect(row(make({ config: cfg(key, false) }), `landing.${key}`).state, key).toBe("off");
    }
  });

  it("켜 놓고 비우면 empty", () => {
    expect(row(make({ config: cfg("programs", true) }), "landing.programs").state).toBe("empty");
    expect(row(make({ config: cfg("faq", true) }), "landing.faq").state).toBe("empty");
    expect(row(make({ config: cfg("audience", true) }), "landing.audience").state).toBe("empty");
    expect(row(make({ config: cfg("sponsors", true) }), "landing.sponsors").state).toBe("empty");
  });

  /**
   * 스폰서는 랜딩 출시 **뒤에** 생긴 첫 섹션이다. 기본 ON 이면 이미 랜딩을 켜고 다 채워 둔
   * 웨비나가 아무 조작도 안 했는데 "켰지만 항목이 없어요" 경고를 받는다(준비 상태 +1).
   * 그건 이 표가 sectionOn/hasContent 를 가른 바로 그 이유다.
   */
  it("sponsors 키가 없는 기존 웨비나는 off — 새 경고를 만들지 않는다", () => {
    const legacy = make({ config: { landingPage: { enabled: true, titleLines: ["제목"] } } });
    expect(row(legacy, "landing.sponsors").state).toBe("off");
    expect(row(legacy, "landing.sponsors").why).toBeNull();
  });

  /** 스폰서는 **이름**이 내용을 센다 — 로고만 있는 행은 정규화가 버린다(alt 가 비어 버리므로). */
  it("스폰서는 이름이 있는 항목만 내용으로 센다", () => {
    expect(row(make({ config: cfg("sponsors", true, [{ logoUrl: "https://cdn.io/a.png" }]) }), "landing.sponsors").state).toBe("empty");
    expect(row(make({ config: cfg("sponsors", true, [{ name: "엑스포럼" }]) }), "landing.sponsors").state).toBe("on");
  });

  /**
   * "이런 분들께 추천합니다" — 새로 생긴 섹션도 다른 섹션과 **같은 이중 게이트**를 쓴다는 증거.
   * 제목(대상)이 빈 행은 정규화가 버리므로 내용으로 세지 않는다(프로그램·FAQ 와 같은 규칙).
   */
  it("추천 대상은 제목이 있는 항목만 내용으로 센다", () => {
    expect(row(make({ config: cfg("audience", true, [{ title: "" }]) }), "landing.audience").state).toBe("empty");
    expect(row(make({ config: cfg("audience", true, [{ title: "미국 진출 준비 중인 브랜드" }]) }), "landing.audience").state).toBe("on");
  });

  it("켜고 채우면 on", () => {
    expect(row(make({ config: cfg("programs", true, [{ title: "세션 A" }]) }), "landing.programs").state).toBe("on");
  });

  it("연사 카드·타임테이블은 섹션 토글이 없다 — 세션이 없을 때만 empty", () => {
    const r = make({ config: { landingPage: { enabled: true, titleLines: ["제목"] } } });
    expect(row(r, "landing.sessions").state).toBe("empty");
    expect(row(r, "landing.timetable").state).toBe("empty");
  });
});

describe("영상 — 뷰어와 같은 파서로 판정한다", () => {
  /**
   * 뷰어는 getYouTubeVideoId 로 11자 ID 를 뽑아야 iframe 을 그린다. "빈 문자열이 아님" 만 보던
   * 동안 채널 라이브 URL 이 초록 on 으로 읽혀 운영자가 그대로 방송에 들어갔다.
   */
  it("파싱할 수 없는 주소는 empty 이고 이유를 구분해 말한다", () => {
    const bad = row(make({ config: { youtubeId: "https://www.youtube.com/@brand/live" } }), "live.video");
    expect(bad.state).toBe("empty");
    expect(bad.why).toContain("유튜브 ID를 읽지 못했어요");
    const none = row(make(), "live.video");
    expect(none.why).toContain("연결되지 않아");
  });

  it("전체 URL·짧은 URL·생 ID 모두 on", () => {
    for (const v of ["dQw4w9WgXcQ", "https://youtu.be/dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"]) {
      expect(row(make({ config: { youtubeId: v } }), "live.video").state, v).toBe("on");
    }
  });
});

describe("안내 문구 — 저장 키를 읽는다", () => {
  /**
   * 예전엔 `livePage.lpNotice` 를 읽었다. 그건 편집 폼의 필드 이름이고 저장 키는 `notice` 다 —
   * 그래서 문구를 직접 쓴 웨비나도 언제나 "비우면 기본 문구가 나가요" 로 읽혔다.
   */
  it("직접 쓴 문구가 있으면 on, 없으면 default", () => {
    expect(row(make({ config: { livePage: { notice: "문의는 채팅으로" } } }), "live.notice").state).toBe("on");
    expect(row(make(), "live.notice").state).toBe("default");
    // 폼 필드 이름으로 저장된 값은 뷰어가 읽지 않으므로 표도 읽지 않는다
    expect(row(make({ config: { livePage: { lpNotice: "문구" } } }), "live.notice").state).toBe("default");
  });
});

describe("등록 폼 — 필드당 한 행", () => {
  const field = (patch: Record<string, unknown>) =>
    make({ config: { registrationForm: { fields: [{ key: "job", label: "직무", enabled: true, ...patch }] } } });

  it("선택형이 선택지 0개면 그 필드 행이 empty — 폼 전체 한 행으로는 잡을 수 없던 것이다", () => {
    for (const type of ["select", "multiple"]) {
      expect(row(field({ type, options: [] }), "signup.field.job").state, type).toBe("empty");
    }
  });

  it("필수면 문구가 더 강하다 — 답을 한 건도 못 받는다", () => {
    expect(row(field({ type: "select", options: [], required: true }), "signup.field.job").why).toContain("한 건도");
  });

  it("기타(직접입력)가 켜져 있으면 on — 자유 입력으로 답할 수 있다", () => {
    expect(row(field({ type: "multiple", options: [], allowOther: true }), "signup.field.job").state).toBe("on");
  });

  it("끈 필드는 off", () => {
    expect(row(field({ type: "select", options: [], enabled: false }), "signup.field.job").state).toBe("off");
  });

  it("기본 필드 7개도 각자 행을 갖는다 — 이름·연락처가 어느 면에 나가는지 표에서 읽힌다", () => {
    const ids = make().elements.filter((e) => e.id.startsWith("signup.field.")).map((e) => e.id);
    expect(ids).toContain("signup.field.name");
    expect(ids).toContain("signup.field.phone");
    expect(ids.length).toBeGreaterThanOrEqual(7);
  });
});

describe("요소 — 약속만 있고 렌더처가 없는 것(broken)", () => {
  it("렌더 약속이 없는 항목은 문의처 1건뿐이다", () => {
    const r = make();
    const broken = r.elements.filter((e) => e.state === "broken").map((e) => e.id);
    expect(broken).toEqual(["live.infoContact"]);
    expect(r.brokenCount).toBe(1);
  });

  it("broken 은 운영자 카운트(emptyCount)에 섞이지 않는다 — 코드 결함이라 '확인할 것' 이 아니다", () => {
    const r = make();
    expect(r.emptyCount).toBe(r.elements.filter((e) => e.state === "empty").length);
    expect(r.elements.filter((e) => e.state === "broken").every((e) => e.why)).toBe(true);
  });
});

describe("대기 화면 인원 밴드와 안내 CTA", () => {
  it("인원 밴드는 토글 상태를 반영하고 실제 인원은 런타임 조건으로 설명한다", () => {
    const social = row(make(), "waiting.social");
    expect(social.state).toBe("on");
    expect(social.why).toContain("현재 대기 인원이 2명 이상");
    expect(row(make({ config: { livePage: { waiting: { social: false } } } }), "waiting.social").state).toBe("off");
  });

  it("안내 영역은 ON이어도 문구와 완성 CTA가 모두 없으면 empty다", () => {
    const empty = make({ config: { livePage: { waiting: { followUp: { enabled: true } } } } });
    expect(row(empty, "waiting.followUp").state).toBe("empty");
    const on = make({
      config: {
        livePage: {
          waiting: {
            followUp: { enabled: true, text: "안내", ctaLabel: "", ctaUrl: "" },
          },
        },
      },
    });
    const followUp = row(on, "waiting.followUp");
    expect(followUp.state).toBe("on");
    expect(followUp.label).toBe("이 웨비나는 추가 카드");
    expect(followUp.surfaces).toEqual(["waiting", "entry"]);
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
