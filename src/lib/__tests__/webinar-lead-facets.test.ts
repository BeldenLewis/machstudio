import { describe, expect, it } from "vitest";
import {
  actionLift,
  facetBy,
  facetByRole,
  MIN_RELIABLE_SAMPLE,
  roleBucket,
  scoreComposition,
  scoreHistogram,
  type ScoreLike,
} from "@/lib/webinar-lead-facets";

/**
 * 리드 분석 — **다음 웨비나를 어떻게 바꿀지**를 이 숫자로 정한다.
 * 축이 잘못 묶이면(대표가 실무자로 들어가면) 영업 우선순위가 통째로 틀어진다.
 */

function row(over: Partial<ScoreLike> & { jobTitle?: string | null; industry?: string } = {}) {
  const b = { attend: 25, watch: 20, interact: 0, intent: 0, ...(over.breakdown ?? {}) };
  return {
    entered: true,
    score: b.attend + b.watch + b.interact + b.intent,
    segment: "warm" as const,
    jobTitle: null as string | null,
    industry: "",
    ...over,
    breakdown: b,
  };
}

describe("직함 버킷 — 자유 입력을 결재선 기준으로 묶는다", () => {
  it("대표·오너·임원은 의사결정권자", () => {
    for (const t of ["대표", "대표이사", "사장", "회장", "부사장", "전무", "상무", "이사", "CEO", "ceo", "총괄", "본부장", "Founder", "오너"]) {
      expect(roleBucket(t), t).toBe("decision");
    }
  });

  it("팀장·부장·매니저는 중간관리자", () => {
    for (const t of ["팀장", "부장", "차장", "과장", "실장", "매니저", "Manager", "리드", "파트장", "센터장"]) {
      expect(roleBucket(t), t).toBe("manager");
    }
  });

  /** 결재선이 아닌 경우가 많다 — 영업 리스트가 부풀면 우선순위가 무의미해진다. */
  it("이사대우·이사보는 결정권자로 올리지 않는다", () => {
    expect(roleBucket("이사대우")).toBe("manager");
    expect(roleBucket("이사보")).toBe("manager");
  });

  it("그 외 기입값은 실무, 빈값은 미기재", () => {
    expect(roleBucket("사원")).toBe("staff");
    expect(roleBucket("마케팅 담당")).toBe("staff");
    expect(roleBucket("")).toBe("unknown");
    expect(roleBucket(null)).toBe("unknown");
    expect(roleBucket("   ")).toBe("unknown");
  });

  it("공백·대소문자 차이로 갈라지지 않는다", () => {
    expect(roleBucket("  대표  ")).toBe(roleBucket("대표"));
    expect(roleBucket("CTO")).toBe(roleBucket("cto"));
  });
});

describe("세분화 집계", () => {
  /** 노쇼를 평균에 넣으면 모든 그룹이 0 쪽으로 눌려 그룹 간 차이가 사라진다. */
  it("평균은 입장자만으로 낸다 — 노쇼는 total 에만 센다", () => {
    const rows = [
      row({ breakdown: { attend: 25, watch: 35, interact: 0, intent: 0 }, industry: "뷰티" }),
      row({ entered: false, score: 0, segment: "cold", breakdown: { attend: 0, watch: 0, interact: 0, intent: 0 }, industry: "뷰티" }),
    ];
    // minCount 를 1 로 낮춰 접기 규칙과 분리한다 — 여기서 보는 건 평균 계산 규칙이다.
    const [f] = facetBy(rows, (r) => r.industry, { minCount: 1 });
    expect(f).toMatchObject({ label: "뷰티", total: 2, entered: 1, avgScore: 60 });
  });

  it("상위 N 개만 남기고 나머지는 기타로 접는다", () => {
    const rows = [
      ...Array.from({ length: 5 }, () => row({ industry: "K-뷰티" })),
      ...Array.from({ length: 3 }, () => row({ industry: "K-푸드" })),
      row({ industry: "패션" }),
      row({ industry: "미디어" }),
    ];
    const out = facetBy(rows, (r) => r.industry, { limit: 2 });
    expect(out.map((f) => f.label)).toEqual(["K-뷰티", "K-푸드", "기타"]);
    expect(out[2].total).toBe(2);
  });

  /**
   * 실측에서 걸린 문제: 상위 5개만 자르니 **1명짜리 자유 입력**("현재는 건강기능식품, 차후
   * 뷰티브랜드 확대 등")이 개별 줄로 올라오고 정작 24명짜리 "기타" 가 그 아래로 갔다.
   */
  it("인원이 minCount 미만인 값은 개별 줄로 올리지 않는다", () => {
    const rows = [
      ...Array.from({ length: 109 }, () => row({ industry: "K-뷰티" })),
      ...Array.from({ length: 61 }, () => row({ industry: "K-푸드" })),
      ...Array.from({ length: 59 }, () => row({ industry: "K-라이프스타일" })),
      row({ industry: "패션" }), row({ industry: "패션" }),
      row({ industry: "현재는 건강기능식품, 차후 뷰티브랜드 확대" }),
      ...Array.from({ length: 24 }, (_, i) => row({ industry: `기타업종${i}` })),
    ];
    const out = facetBy(rows, (r) => r.industry, { limit: 5, minCount: 3 });
    expect(out.map((f) => f.label)).toEqual(["K-뷰티", "K-푸드", "K-라이프스타일", "기타"]);
    expect(out[3].total).toBe(27);
    expect(out.reduce((s, f) => s + f.total, 0)).toBe(rows.length);
  });

  /** 262명 웨비나에서 2명짜리는 소음이지만 30명 웨비나에서 2명은 의미가 있다. */
  it("최소 인원은 규모에 따라 달라진다 — 전체의 2%(최소 2명)", () => {
    const big = [
      ...Array.from({ length: 200 }, () => row({ industry: "큰그룹" })),
      ...Array.from({ length: 3 }, () => row({ industry: "작은그룹" })),
    ];
    // 203명의 2% = 5명 → 3명짜리는 기타로
    expect(facetBy(big, (r) => r.industry).map((f) => f.label)).toEqual(["큰그룹", "기타"]);

    const small = [
      ...Array.from({ length: 10 }, () => row({ industry: "큰그룹" })),
      ...Array.from({ length: 3 }, () => row({ industry: "작은그룹" })),
    ];
    // 13명의 2% = 1 → 하한 2명 적용 → 3명짜리는 개별 줄로 남는다
    expect(facetBy(small, (r) => r.industry).map((f) => f.label)).toEqual(["큰그룹", "작은그룹"]);
  });

  /** 동수일 때 순서가 흔들리면 표를 볼 때마다 줄이 바뀌어 비교가 안 된다. */
  it("동수는 라벨 순으로 고정한다", () => {
    const rows = [
      ...Array.from({ length: 3 }, () => row({ industry: "나중" })),
      ...Array.from({ length: 3 }, () => row({ industry: "가장" })),
    ];
    expect(facetBy(rows, (r) => r.industry).map((f) => f.label)).toEqual(["가장", "나중"]);
  });

  /** 조용히 버리면 합이 전체 등록자와 안 맞아 화면을 신뢰할 수 없다. */
  it("빈 값은 버리지 않고 미기재로 모은다 — 합이 전체와 맞아야 한다", () => {
    const rows = [row({ industry: "뷰티" }), row({ industry: "" }), row({ industry: "  " })];
    const out = facetBy(rows, (r) => r.industry, { minCount: 1 });
    expect(out.find((f) => f.label === "미기재")?.total).toBe(2);
    expect(out.reduce((s, f) => s + f.total, 0)).toBe(rows.length);
  });

  it("표본이 작으면 reliable=false — 화면이 평균을 흐리게 표시한다", () => {
    const few = facetBy(Array.from({ length: MIN_RELIABLE_SAMPLE - 1 }, () => row({ industry: "뷰티" })), (r) => r.industry);
    expect(few[0].reliable).toBe(false);
    const many = facetBy(Array.from({ length: MIN_RELIABLE_SAMPLE }, () => row({ industry: "뷰티" })), (r) => r.industry);
    expect(many[0].reliable).toBe(true);
  });

  /** 인원순으로 뒤섞이면 표를 볼 때마다 순서가 바뀌어 비교가 안 된다. */
  it("직함은 결정권자 → 관리자 → 실무 → 미기재 순서가 고정된다", () => {
    const rows = [
      row({ jobTitle: "사원" }), row({ jobTitle: "사원" }), row({ jobTitle: "사원" }),
      row({ jobTitle: "팀장" }), row({ jobTitle: "팀장" }),
      row({ jobTitle: "대표" }),
      row({ jobTitle: null }),
    ];
    expect(facetByRole(rows).map((f) => f.label)).toEqual(["의사결정권자", "중간관리자", "실무·기타", "미기재"]);
  });

  it("직함 버킷에 아무도 없으면 그 줄은 빼고 그린다", () => {
    expect(facetByRole([row({ jobTitle: "대표" })]).map((f) => f.label)).toEqual(["의사결정권자"]);
  });
});

describe("점수 분포 히스토그램", () => {
  /** 노쇼(0점)를 넣으면 0~9 칸이 압도해 나머지가 안 보인다(실측: 40명 중 18명 노쇼). */
  it("입장자만 담는다", () => {
    const bins = scoreHistogram([
      row({ score: 55 }),
      row({ entered: false, score: 0 }),
      row({ entered: false, score: 5 }),
    ]);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(1);
    expect(bins[5]).toMatchObject({ from: 50, to: 59, count: 1 });
  });

  it("10점 구간 10칸 · 100점은 마지막 칸에 담는다", () => {
    const bins = scoreHistogram([row({ score: 100 }), row({ score: 99 }), row({ score: 90 })]);
    expect(bins).toHaveLength(10);
    expect(bins[9]).toMatchObject({ from: 90, to: 100, count: 3 });
  });

  /** 이 모양이 보여야 "핫 65" 경계가 맞는지 판단할 수 있다. */
  it("60점 벽(무반응 완주자)이 한 칸에 뭉친다", () => {
    const bins = scoreHistogram(Array.from({ length: 7 }, () => row({ score: 60 })));
    expect(bins[6]).toMatchObject({ from: 60, to: 69, count: 7 });
  });
});

describe("점수 구성 기여도", () => {
  it("네 덩어리 합이 입장자 점수 총합과 같다", () => {
    const rows = [
      row({ breakdown: { attend: 25, watch: 30, interact: 12, intent: 10 } }),
      row({ breakdown: { attend: 25, watch: 10, interact: 0, intent: 0 } }),
      row({ entered: false, breakdown: { attend: 0, watch: 0, interact: 0, intent: 5 } }),
    ];
    const c = scoreComposition(rows);
    expect(c).toMatchObject({ attend: 50, watch: 40, interact: 12, intent: 10 });
    expect(c.total).toBe(112);
  });

  /** "체류는 좋았는데 상호작용이 0" 을 이 숫자가 말해준다. */
  it("아무도 반응하지 않으면 행동 기여도가 0 이다", () => {
    const c = scoreComposition([row({ breakdown: { attend: 25, watch: 35, interact: 0, intent: 0 } })]);
    expect(c.interact).toBe(0);
    expect(c.watch).toBe(35);
  });

  it("입장자가 없으면 전부 0 (0으로 나누지 않는다)", () => {
    expect(scoreComposition([row({ entered: false })])).toMatchObject({ total: 0 });
  });
});

describe("행동별 리프트 — 행동 점수를 빼고 비교한다", () => {
  /**
   * 이게 이 함수의 존재 이유다. 행동 점수를 포함하면 "투표한 사람이 점수가 높다" 는
   * 동어반복이 된다(투표하면 4점이 붙으니까). 참석+체류+인텐트만 비교해야
   * "투표한 사람은 가점을 빼고도 더 오래 봤다" 를 알 수 있다.
   */
  it("행동 가점이 결과를 부풀리지 않는다", () => {
    const voted = row({ breakdown: { attend: 25, watch: 20, interact: 8, intent: 0 } });
    const notVoted = row({ breakdown: { attend: 25, watch: 20, interact: 0, intent: 0 } });
    const [lift] = actionLift([voted, notVoted], [{ action: "투표", did: (r) => r.breakdown.interact > 0 }]);
    // 체류가 같으므로 리프트는 0 이어야 한다 — 점수를 그대로 쓰면 8 이 된다.
    expect(lift.withAvg).toBe(lift.withoutAvg);
    expect(lift.withAvg).toBe(45);
  });

  it("실제로 더 오래 본 경우에는 차이가 남는다", () => {
    const voted = row({ breakdown: { attend: 25, watch: 35, interact: 4, intent: 0 } });
    const notVoted = row({ breakdown: { attend: 25, watch: 10, interact: 0, intent: 0 } });
    const [lift] = actionLift([voted, notVoted], [{ action: "투표", did: (r) => r.breakdown.interact > 0 }]);
    expect(lift.withAvg).toBe(60);
    expect(lift.withoutAvg).toBe(35);
  });

  it("노쇼는 제외하고 센다", () => {
    const [lift] = actionLift(
      [row({ entered: false, breakdown: { attend: 0, watch: 0, interact: 0, intent: 5 } }), row()],
      [{ action: "투표", did: () => false }],
    );
    expect(lift.withoutAvg).toBe(45);
    expect(lift.withCount).toBe(0);
  });

  it("표본이 작으면 reliable=false", () => {
    const rows = Array.from({ length: 3 }, () => row({ breakdown: { attend: 25, watch: 20, interact: 4, intent: 0 } }));
    const [lift] = actionLift(rows, [{ action: "투표", did: (r) => r.breakdown.interact > 0 }]);
    expect(lift.withCount).toBe(3);
    expect(lift.reliable).toBe(false);
  });
});
