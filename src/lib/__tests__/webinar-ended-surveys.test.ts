import { describe, expect, it } from "vitest";
import { endedSurveyLinks, readEndedSurveys, readHasInternalEndedSurvey } from "@/lib/webinar-ended-surveys";

/**
 * 이 파일이 지키는 것은 세 가지다:
 *   1) 배타적 폴백 — 자체 설문이 **있기만 하면** 외부 URL 은 안 쓴다(합치면 지운 줄 안 링크가 남는다)
 *   2) 배포 사이 캐시 창 — 응답이 옛 키(endedSurvey)만 들고 와도 카드가 사라지지 않는다
 *   3) 응답 기간 원본을 링크에 실어 화면이 자기 시계로 판정하게 한다
 * 규칙이 종료 화면과 임베드 두 면에서 같아야 하므로 함수 하나로 고정한다.
 */

const url = (id: string) => `/s/${id}`;

describe("배타적 폴백 — 두 경로를 섞지 않는다", () => {
  it("자체 설문이 있으면 외부 URL 은 무시된다", () => {
    const links = endedSurveyLinks([{ id: "a" }], "https://tally.so/x", url);
    expect(links).toEqual([
      { url: "/s/a", surveyId: "a", title: null, description: null, ctaLabel: null, isOpen: undefined, opensAt: null, closesAt: null },
    ]);
  });

  /**
   * surveyId 는 종료 화면이 **팝업으로 열지 새 탭으로 보낼지**를 가르는 값이다.
   * 우리 설문이면 문항을 받아와 그 자리에서 답하게 하고, 외부 URL 은 남의 페이지라
   * iframe 이 막힐 수 있어 새 탭이 정직하다. URL 문자열을 파싱해 판정하지 않는다 —
   * 경로 형태가 바뀌면 조용히 오판한다.
   */
  it("우리 설문만 surveyId 를 갖는다 — 팝업 대상 판정 근거", () => {
    expect(endedSurveyLinks([{ id: "a" }], null, url)[0].surveyId).toBe("a");
    expect(endedSurveyLinks([], "https://tally.so/x", url)[0].surveyId).toBeUndefined();
  });

  it("자체 설문이 여러 개면 순서를 그대로 지킨다 — 어드민 목록 순서와 같아야 어느 카드인지 안다", () => {
    const links = endedSurveyLinks([{ id: "a" }, { id: "b" }, { id: "c" }], null, url);
    expect(links.map((l) => l.url)).toEqual(["/s/a", "/s/b", "/s/c"]);
  });

  it("자체 설문이 없으면 외부 URL 하나", () => {
    expect(endedSurveyLinks([], "https://tally.so/x", url)).toEqual([{ url: "https://tally.so/x" }]);
  });

  it("외부 URL 이 빈 문자열·공백·비문자열이면 카드를 만들지 않는다 — 빈 껍데기를 시청자에게 안 보인다", () => {
    for (const bad of ["", "   ", null, undefined, 0, {}]) {
      expect(endedSurveyLinks([], bad, url), String(bad)).toEqual([]);
    }
  });

  it("제목·설명은 그대로 실린다 — 카드 두 장이 같은 문구면 무엇을 누르는지 알 수 없다", () => {
    const links = endedSurveyLinks(
      [{ id: "a", title: "만족도", description: "1분" }, { id: "b", title: "사전조사", description: null }],
      null,
      url,
    );
    expect(links[0]).toMatchObject({ url: "/s/a", surveyId: "a", title: "만족도", description: "1분", ctaLabel: null });
    expect(links[1]).toMatchObject({ url: "/s/b", surveyId: "b", title: "사전조사", description: null, ctaLabel: null });
  });

  /**
   * 버튼 문구도 제목·설명과 같은 이유로 설문마다 다르게 실린다 — 두 설문을 함께 걸었을 때
   * "설문 참여하기" / "사전 신청하기" 처럼 다른 행동을 유도하는 문구를 쓸 수 있어야 한다.
   * 외부 URL 경로는 애초에 개별 설문이 없어 ctaLabel 을 실을 자리가 없다(항상 null).
   */
  it("버튼 문구는 설문마다 따로 실린다 — 없으면 null(화면이 기본 문구로 채운다)", () => {
    const links = endedSurveyLinks(
      [{ id: "a", ctaLabel: "사전 신청하기" }, { id: "b", ctaLabel: null }, { id: "c" }],
      null,
      url,
    );
    expect(links.map((l) => l.ctaLabel)).toEqual(["사전 신청하기", null, null]);
    expect(endedSurveyLinks([], "https://tally.so/x", url)[0].ctaLabel).toBeUndefined();
  });
});

describe("응답 읽기 — 배포 사이 캐시 창", () => {
  it("배열이 있으면 그것만 쓴다", () => {
    expect(readEndedSurveys({ endedSurveys: [{ id: "a" }], endedSurvey: { id: "z" } })).toEqual([{ id: "a" }]);
  });

  it("배열이 비어 있으면 빈 목록이다 — 옛 단일 키로 되돌아가면 방금 끈 설문이 되살아난다", () => {
    expect(readEndedSurveys({ endedSurveys: [], endedSurvey: { id: "z" } })).toEqual([]);
  });

  it("배열 키가 아예 없을 때만 옛 단일 키로 떨어진다", () => {
    expect(readEndedSurveys({ endedSurvey: { id: "z", title: "t" } })).toEqual([{ id: "z", title: "t" }]);
    expect(readEndedSurveys({ endedSurvey: null })).toEqual([]);
    expect(readEndedSurveys({})).toEqual([]);
  });

  it("id 없는 항목은 버린다 — url 이 '/s/undefined' 인 카드가 나가는 것을 막는다", () => {
    expect(readEndedSurveys({ endedSurveys: [{ id: "a" }, { title: "no id" }, null] })).toEqual([{ id: "a" }]);
  });
});

describe("존재 기반 폴백 — 예약 창에서 옛 외부 URL 이 되살아나지 않는다", () => {
  /**
   * 실제로 난 사고: 자체 설문에 시작 예약을 걸면 서버가 그 설문을 목록에서 빼는데,
   * 폴백을 목록 길이로 판정하던 코드가 "자체 설문 없음" 으로 읽어 **지웠다고 생각한 옛 외부
   * 폼**을 파트너 사이트 배너에 띄웠다. 존재 플래그를 따로 받는 이유가 이것이다.
   */
  it("목록이 비어도 자체 설문이 있으면 외부 URL 을 쓰지 않는다", () => {
    expect(endedSurveyLinks([], "https://tally.so/old", url, true)).toEqual([]);
  });

  it("자체 설문이 정말 없을 때만 외부 URL 로 떨어진다", () => {
    expect(endedSurveyLinks([], "https://tally.so/old", url, false)).toEqual([{ url: "https://tally.so/old" }]);
  });

  it("플래그를 생략하면 예전처럼 목록 길이로 판정한다 — 옛 응답(캐시) 호환", () => {
    expect(endedSurveyLinks([], "https://tally.so/old", url)).toEqual([{ url: "https://tally.so/old" }]);
  });

  it("플래그는 boolean 일 때만 읽는다 — 키가 없는 옛 응답은 undefined", () => {
    expect(readHasInternalEndedSurvey({ hasInternalEndedSurvey: true })).toBe(true);
    expect(readHasInternalEndedSurvey({ hasInternalEndedSurvey: false })).toBe(false);
    expect(readHasInternalEndedSurvey({})).toBeUndefined();
    expect(readHasInternalEndedSurvey({ hasInternalEndedSurvey: "yes" })).toBeUndefined();
  });
});

describe("응답 기간을 링크에 싣는다 — 화면이 자기 시계로 판정한다", () => {
  it("isOpen·opensAt·closesAt 이 그대로 실린다", () => {
    const links = endedSurveyLinks(
      [{ id: "a", isOpen: true, opensAt: "2026-08-11T06:00:00.000Z", closesAt: "2026-08-14T14:59:00.000Z" }],
      null,
      url,
    );
    expect(links[0]).toMatchObject({
      isOpen: true,
      opensAt: "2026-08-11T06:00:00.000Z",
      closesAt: "2026-08-14T14:59:00.000Z",
    });
  });

  /** 외부 URL 카드는 일정이 없다 — 화면은 isOpen 미정을 "열린 것" 으로 본다. */
  it("외부 URL 카드에는 일정이 붙지 않는다", () => {
    const link = endedSurveyLinks([], "https://tally.so/x", url, false)[0];
    expect(link.isOpen).toBeUndefined();
    expect(link.opensAt).toBeUndefined();
  });

  it("일정을 안 준 자체 설문은 null 로 실린다 — undefined 와 섞이지 않게", () => {
    const link = endedSurveyLinks([{ id: "a" }], null, url)[0];
    expect(link.opensAt).toBeNull();
    expect(link.closesAt).toBeNull();
  });
});
