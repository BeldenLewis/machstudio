import { describe, expect, it } from "vitest";
import {
  goalQuestions,
  isGoalAnswer,
  normalizeSurveyQuestions,
  responseHitsGoal,
  type SurveyQuestion,
} from "@/lib/webinar-survey";

/**
 * 성과 문항 — 성과 퍼널의 마지막 두 단계("상담 희망", "그중 마케팅 동의")가 이 판정에 달렸다.
 *
 * 왜 지정 방식인가: 실제 8/11 웨비나 설문에 상담을 언급하는 문항이 **둘**이었다 —
 *   · "부스 참가 1:1 상담을 희망하시나요?" → [네, 상담을 희망합니다. / 추후 안내를 받고 싶습니다. / …]
 *   · "현재 단계는 어디에 가깝나요?" → [… / 참가 가능성 높음 / 1:1 상담 희망]
 * 제목이나 선택지 문구로 추측하면 조용히 엉뚱한 문항을 센다.
 */

const CONSULT: SurveyQuestion = {
  id: "q_consult",
  type: "single",
  title: "부스 참가 1:1 상담을 희망하시나요?",
  required: false,
  options: ["네, 상담을 희망합니다.", "추후 안내를 받고 싶습니다.", "아직은 희망하지 않습니다."],
  goalOptions: ["네, 상담을 희망합니다."],
};

const STAGE: SurveyQuestion = {
  id: "q_stage",
  type: "single",
  title: "현재 단계는 어디에 가깝나요?",
  required: false,
  options: ["내부 검토 전", "내부 검토 중", "예산/일정 확인 중", "참가 가능성 높음", "1:1 상담 희망"],
  goalOptions: ["1:1 상담 희망"],
};

describe("성과 판정", () => {
  it("지정한 선택지를 고르면 성과", () => {
    expect(isGoalAnswer(CONSULT, "네, 상담을 희망합니다.")).toBe(true);
    expect(isGoalAnswer(CONSULT, "추후 안내를 받고 싶습니다.")).toBe(false);
    expect(isGoalAnswer(CONSULT, "아직은 희망하지 않습니다.")).toBe(false);
  });

  it("복수응답은 배열 중 하나라도 맞으면 성과", () => {
    const q: SurveyQuestion = { ...CONSULT, type: "multiple", goalOptions: ["네, 상담을 희망합니다."] };
    expect(isGoalAnswer(q, ["아직은 희망하지 않습니다.", "네, 상담을 희망합니다."])).toBe(true);
    expect(isGoalAnswer(q, ["아직은 희망하지 않습니다."])).toBe(false);
    expect(isGoalAnswer(q, [])).toBe(false);
  });

  it("빈 답변·없는 답변은 성과가 아니다", () => {
    for (const bad of [null, undefined, "", 0]) {
      expect(isGoalAnswer(CONSULT, bad), JSON.stringify(bad)).toBe(false);
    }
  });

  /** 성과 문항이 지정되지 않았으면 아무 답도 성과가 아니다 — 기본값이 "성과 0" 이어야 한다. */
  it("지정이 없으면 무엇을 골라도 성과가 아니다", () => {
    const plain: SurveyQuestion = { ...CONSULT, goalOptions: undefined };
    expect(isGoalAnswer(plain, "네, 상담을 희망합니다.")).toBe(false);
    expect(goalQuestions([plain])).toHaveLength(0);
  });

  /** 별점·NPS·주관식은 "성과" 로 셀 수 있는 값이 아니다. */
  it("객관식이 아니면 성과 판정 대상이 아니다", () => {
    for (const type of ["rating", "nps", "text"] as const) {
      expect(isGoalAnswer({ type, goalOptions: ["5"] }, "5"), type).toBe(false);
    }
  });
});

describe("응답 하나에 성과 문항이 여러 개면 합집합(OR)", () => {
  const questions = [CONSULT, STAGE];

  it("어느 쪽이든 고르면 성과", () => {
    expect(responseHitsGoal(questions, { q_consult: "네, 상담을 희망합니다." })).toBe(true);
    expect(responseHitsGoal(questions, { q_stage: "1:1 상담 희망" })).toBe(true);
    expect(responseHitsGoal(questions, { q_consult: "아직은 희망하지 않습니다.", q_stage: "내부 검토 전" })).toBe(false);
  });

  /** 두 문항 다 골라도 **한 사람은 한 번** — 퍼널 단계는 사람 수라 라우트가 distinct 로 센다. */
  it("둘 다 골라도 true 하나다(중복 계산은 호출부의 distinct 로 막는다)", () => {
    expect(responseHitsGoal(questions, { q_consult: "네, 상담을 희망합니다.", q_stage: "1:1 상담 희망" })).toBe(true);
  });

  it("성과 문항 목록을 뽑아 화면이 무엇을 세는지 밝힐 수 있다", () => {
    expect(goalQuestions(questions).map((q) => q.title)).toEqual([CONSULT.title, STAGE.title]);
  });
});

describe("정규화 — 지정이 조용히 썩지 않게", () => {
  /**
   * 이게 제일 위험한 함정이다. 운영자가 선택지 문구를 고쳐 쓰면 옛 문구를 가리키는 지정이 남아
   * **아무도 만족하지 않는 조건**이 되는데, 화면에는 "성과 문항 지정됨" 으로 보여
   * 성과가 0 인 이유를 알 수 없다. 그래서 현재 선택지에 없는 문구는 버린다.
   */
  it("현재 선택지에 없는 문구는 버린다", () => {
    const [q] = normalizeSurveyQuestions(
      [{ id: "a", type: "single", title: "상담?", options: ["네", "아니오"], goalOptions: ["예", "네"] }],
      { includeHidden: true },
    );
    expect(q.goalOptions).toEqual(["네"]);
  });

  it("전부 사라지면 지정 자체가 없어진다(빈 배열을 남기지 않는다)", () => {
    const [q] = normalizeSurveyQuestions(
      [{ id: "a", type: "single", title: "상담?", options: ["네", "아니오"], goalOptions: ["옛문구"] }],
      { includeHidden: true },
    );
    expect(q.goalOptions).toBeUndefined();
  });

  it("객관식이 아닌 문항의 지정은 버린다", () => {
    const [q] = normalizeSurveyQuestions(
      [{ id: "a", type: "text", title: "의견", options: [], goalOptions: ["뭐든" ] }],
      { includeHidden: true },
    );
    expect(q.goalOptions).toBeUndefined();
  });

  it("중복 지정은 한 번만 남긴다", () => {
    const [q] = normalizeSurveyQuestions(
      [{ id: "a", type: "single", title: "상담?", options: ["네", "아니오"], goalOptions: ["네", "네"] }],
      { includeHidden: true },
    );
    expect(q.goalOptions).toEqual(["네"]);
  });

  it("지정을 저장했다 다시 읽어도 그대로다", () => {
    const round = normalizeSurveyQuestions(normalizeSurveyQuestions([CONSULT, STAGE], { includeHidden: true }), { includeHidden: true });
    expect(round.map((q) => q.goalOptions)).toEqual([CONSULT.goalOptions, STAGE.goalOptions]);
  });
});
