// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import EndedScreen from "../EndedScreen";
import { normalizeLivePageConfig } from "@/lib/webinar-config";
import type { EndedSurveyLink } from "@/lib/webinar-ended-surveys";

/**
 * 종료 화면이 **시작 예약(opensAt)** 을 어떻게 말하는지 고정한다.
 *
 * 이 화면에서 두 번 틀렸다:
 *   1) 시작 예약이 걸린 설문이 목록에서 빠져, 자료 게이트가 "조건 설문이 닫혔어요" 라고 단정했다
 *      (마감이 아니라 아직 시작 전이었고, 그 행은 눌러도 아무 일이 안 났다).
 *   2) 카드 버튼이 그냥 열려 있어서, 누른 뒤에야 "아직 열리지 않았어요" 를 봤다.
 * 문구는 리팩터로 쉽게 되돌아가므로 렌더 결과로 묶는다.
 *
 * 판정 시각은 serverNowMs 로 주입한다 — 테스트가 실제 시계에 의존하면 8월 11일이 지나는 순간
 * 조용히 깨진다(Date.now() 를 쓰지 않는 이유).
 */

const NOW = new Date("2026-08-01T00:00:00Z").getTime();
const OPENS = "2026-08-11T06:00:00.000Z"; // KST 8월 11일 15:00

const live = (over: Record<string, unknown> = {}) =>
  normalizeLivePageConfig({
    livePage: {
      ended: { survey: true, resources: true, replay: false, share: false, nextWebinar: false },
      ...over,
    },
  });

const render = (surveys: EndedSurveyLink[], opts: { resources?: unknown[]; completed?: string[] } = {}) =>
  renderToStaticMarkup(
    <EndedScreen
      webinar={{ name: "K-Brand LA", description: null }}
      accent="#6D28D9"
      text="#141320"
      surface="#FFFFFF"
      live={live(opts.resources ? { resources: opts.resources } : {})}
      surveys={surveys}
      onOpenSurvey={() => {}}
      hasRegistration
      completedSurveyIds={opts.completed ?? []}
      serverNowMs={NOW}
    />,
  );

const OPEN_SURVEY: EndedSurveyLink = {
  url: "/webinar/la/survey/s1?src=ended",
  surveyId: "s1",
  title: "만족도 설문",
  ctaLabel: "설문 참여하기",
  isOpen: true,
  opensAt: null,
  closesAt: null,
};
const BEFORE_SURVEY: EndedSurveyLink = { ...OPEN_SURVEY, isOpen: true, opensAt: OPENS };

describe("설문 카드 — 시작 예약 전", () => {
  it("열려 있으면 참여 버튼이 그대로 나온다", () => {
    const html = render([OPEN_SURVEY]);
    expect(html).toContain("설문 참여하기");
    expect(html).not.toContain("부터");
  });

  /** 누르기 전에 언제부터인지 말한다 — 눌러서 안내를 보게 하는 건 한 걸음 낭비다. */
  it("시작 전이면 참여 버튼 대신 시작 시각을 보여준다", () => {
    const html = render([BEFORE_SURVEY]);
    expect(html).toContain("8월 11일");
    expect(html).toContain("15:00");
    expect(html).toContain("부터");
    expect(html).not.toContain("설문 참여하기");
  });

  /**
   * 판정을 서버 스냅샷이 아니라 자기 시계로 한다는 계약. 같은 payload 라도 시각이 지나면
   * 열려야 한다 — 폴링이 serverNowMs 를 갱신하면 새로고침 없이 풀린다.
   */
  it("같은 데이터라도 시작 시각이 지난 시계에서는 열린다", () => {
    const html = renderToStaticMarkup(
      <EndedScreen
        webinar={{ name: "K-Brand LA", description: null }}
        accent="#6D28D9" text="#141320" surface="#FFFFFF"
        live={live()} surveys={[BEFORE_SURVEY]} onOpenSurvey={() => {}}
        hasRegistration completedSurveyIds={[]}
        serverNowMs={new Date(OPENS).getTime() + 1000}
      />,
    );
    expect(html).toContain("설문 참여하기");
  });

  /** 외부 설문 URL 카드는 일정이 없다 — isOpen 미정을 "닫힘" 으로 읽으면 카드가 죽는다. */
  it("일정 없는 외부 URL 카드는 열린 것으로 본다", () => {
    const html = render([{ url: "https://tally.so/x" }]);
    expect(html).toContain("설문 참여하기");
    expect(html).toContain("tally.so");
  });
});

describe("자료 게이트 문구 — 아는 만큼만 말한다", () => {
  const resources = [{ title: "발표자료 PDF", url: "https://x/a.pdf", surveyId: "s1" }];

  it("조건 설문이 열려 있으면 '완료하면 받을 수 있어요'", () => {
    const html = render([OPEN_SURVEY], { resources });
    expect(html).toContain("완료하면 받을 수 있어요");
  });

  /** 예전엔 여기서 "조건 설문이 닫혔어요" 라고 했다 — 아직 열리지도 않은 설문이었다. */
  it("조건 설문이 시작 전이면 '언제부터 열려요' 로 말하고 닫혔다고 하지 않는다", () => {
    const html = render([BEFORE_SURVEY], { resources });
    expect(html).toContain("8월 11일");
    expect(html).toContain("열려요");
    expect(html).not.toContain("닫혔어요");
  });

  /** 연결이 실제로 빠진 경우 — 상태를 단정하지 않는다(마감인지 해제인지 화면은 모른다). */
  it("조건 설문이 목록에 없으면 상태를 단정하지 않는다", () => {
    const html = render([], { resources });
    expect(html).toContain("열려 있지 않아요");
    expect(html).not.toContain("닫혔어요");
  });
});
