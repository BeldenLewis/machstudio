import { describe, expect, it } from "vitest";
import { endedSurveyLinks, readEndedSurveys } from "@/lib/webinar-ended-surveys";

/**
 * 이 파일이 지키는 것은 두 가지다:
 *   1) 배타적 폴백 — 자체 설문이 있으면 외부 URL 은 **안 쓴다**(합치면 지운 줄 안 링크가 남는다)
 *   2) 배포 사이 캐시 창 — 응답이 옛 키(endedSurvey)만 들고 와도 카드가 사라지지 않는다
 * 규칙이 종료 화면과 임베드 두 면에서 같아야 하므로 함수 하나로 고정한다.
 */

const url = (id: string) => `/s/${id}`;

describe("배타적 폴백 — 두 경로를 섞지 않는다", () => {
  it("자체 설문이 있으면 외부 URL 은 무시된다", () => {
    const links = endedSurveyLinks([{ id: "a" }], "https://tally.so/x", url);
    expect(links).toEqual([{ url: "/s/a", title: null, description: null, ctaLabel: null }]);
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
    expect(links[0]).toEqual({ url: "/s/a", title: "만족도", description: "1분", ctaLabel: null });
    expect(links[1]).toEqual({ url: "/s/b", title: "사전조사", description: null, ctaLabel: null });
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
