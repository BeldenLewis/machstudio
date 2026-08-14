/**
 * 대중 + 심사단 합산 — 진출자·수상자를 정하는 계산의 단일 정의.
 *
 * **정규화가 핵심이다.** 대중은 "표 수"(0~수천), 심사는 "100점 만점"이라 그대로 더하면 대중
 * 표가 심사를 압도한다. 각각 0~100 으로 맞춘 뒤 비율을 적용한다.
 *
 * 화면은 결과 숫자만이 아니라 **계산 근거**(표 수·심사 평균·정규화 값)를 함께 보여준다.
 * 숫자만 보여주면 아무도 못 믿고, 시상 결과에는 반드시 이의가 따라온다.
 */

export interface JudgeCriterion {
  key: string;
  label: string;
  maxScore: number;
}

export function normalizeCriteria(raw: unknown): JudgeCriterion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const c = item as Record<string, unknown>;
      const key = typeof c.key === "string" && c.key.trim() ? c.key.trim() : `c${index + 1}`;
      const label = typeof c.label === "string" ? c.label : key;
      const maxScore = typeof c.maxScore === "number" && c.maxScore > 0 ? Math.floor(c.maxScore) : 10;
      return { key, label, maxScore };
    })
    .filter((c): c is JudgeCriterion => c !== null);
}

export function criteriaMaxTotal(criteria: JudgeCriterion[]): number {
  return criteria.reduce((sum, c) => sum + c.maxScore, 0);
}

/** 심사위원이 매긴 항목별 점수의 합. 범위를 벗어난 값은 잘라낸다(클라이언트 조작 방어). */
export function judgeScoreTotal(scores: Record<string, unknown>, criteria: JudgeCriterion[]): number {
  return criteria.reduce((sum, c) => {
    const raw = Number(scores?.[c.key]);
    if (!Number.isFinite(raw)) return sum;
    return sum + Math.max(0, Math.min(c.maxScore, raw));
  }, 0);
}

export interface ScoreInputEntry {
  id: string;
  entryNo: string;
  title: string;
  teamName: string | null;
}

export interface ScoreInputJudgeScore {
  entryId: string;
  judgeId: string;
  total: number;
  submitted: boolean;
}

export interface CombinedRow {
  entryId: string;
  entryNo: string;
  title: string;
  teamName: string | null;
  /** 근거 — 원본 값 */
  votes: number;
  judgeAverage: number | null;
  judgeCount: number;
  /** 근거 — 정규화 값 (0~100) */
  publicScore: number;
  judgeScore: number;
  /** 최종 */
  combined: number;
  rank: number;
  /**
   * 합산 점수가 같은 참가작이 또 있는가.
   * 규칙으로 갈린 뒤에도 **운영자에게는 동점이었다는 사실을 알려야 한다** — 남은 동점은
   * 사람이 정책으로 고르기로 했기 때문이다(참가 인원수 → 평균 나이).
   */
  tied: boolean;
}

export interface CombineOptions {
  entries: ScoreInputEntry[];
  voteCounts: Map<string, number>;
  judgeScores: ScoreInputJudgeScore[];
  /** 심사위원별 가중치(기본 1). 특정 심사위원에 더 큰 비중을 줄 때. */
  judgeWeights?: Map<string, number>;
  criteriaMax: number;
  publicWeight: number;
  judgeWeight: number;
  /**
   * 대중 점수 기준.
   * - "top": 최다 득표를 100 으로 (상대 평가, 기본)
   * - "total": 전체 표 중 비중 (절대 평가)
   */
  publicBasis?: "top" | "total";
  /**
   * 동점 처리(확정 규칙).
   * - "entryNo": 먼저 신청한 팀이 앞선다 — **예선**. 접수 순번이 참가번호다.
   * - "public": 관람객 점수가 높은 팀이 앞선다 — **본선**. 본선은 신청 순서가 의미를 잃는다.
   *
   * 여기서도 갈리지 않으면 순위를 억지로 만들지 않고 `tied` 로 표시만 한다.
   * 참가 인원수·평균 나이 같은 다음 기준은 신청 폼마다 있을 수도 없을 수도 있어서
   * 시스템이 자동 판정하면 오히려 틀린 순위를 확정해 버린다.
   */
  tieBreak?: "entryNo" | "public";
}

export function combineScores(options: CombineOptions): CombinedRow[] {
  const {
    entries, voteCounts, judgeScores, judgeWeights,
    criteriaMax, publicWeight, judgeWeight, publicBasis = "top", tieBreak = "entryNo",
  } = options;

  const totalVotes = Array.from(voteCounts.values()).reduce((sum, n) => sum + n, 0);
  const topVotes = Math.max(0, ...Array.from(voteCounts.values()));

  // **제출한 심사위원만 센다.** 미제출을 0점으로 처리하면 아직 안 낸 심사위원 때문에
  // 참가작 점수가 부당하게 깎인다.
  const byEntry = new Map<string, ScoreInputJudgeScore[]>();
  for (const score of judgeScores) {
    if (!score.submitted) continue;
    const list = byEntry.get(score.entryId) ?? [];
    list.push(score);
    byEntry.set(score.entryId, list);
  }

  const rows = entries.map((entry) => {
    const votes = voteCounts.get(entry.id) ?? 0;

    const publicScore =
      publicBasis === "total"
        ? totalVotes > 0 ? (votes / totalVotes) * 100 : 0
        : topVotes > 0 ? (votes / topVotes) * 100 : 0;

    const mine = byEntry.get(entry.id) ?? [];
    let judgeAverage: number | null = null;
    if (mine.length > 0) {
      let weighted = 0;
      let weightSum = 0;
      for (const score of mine) {
        const weight = judgeWeights?.get(score.judgeId) ?? 1;
        weighted += score.total * weight;
        weightSum += weight;
      }
      judgeAverage = weightSum > 0 ? weighted / weightSum : null;
    }
    const judgeScore = judgeAverage !== null && criteriaMax > 0 ? (judgeAverage / criteriaMax) * 100 : 0;

    const combined = publicScore * (publicWeight / 100) + judgeScore * (judgeWeight / 100);

    return {
      entryId: entry.id,
      entryNo: entry.entryNo,
      title: entry.title,
      teamName: entry.teamName,
      votes,
      judgeAverage,
      judgeCount: mine.length,
      publicScore: round2(publicScore),
      judgeScore: round2(judgeScore),
      combined: round2(combined),
      rank: 0,
      tied: false,
    };
  });

  const byEntryNo = (a: CombinedRow, b: CombinedRow) => Number(a.entryNo) - Number(b.entryNo);
  rows.sort((a, b) => {
    if (b.combined !== a.combined) return b.combined - a.combined;
    // 본선: 관람객 점수가 높은 쪽. 예선처럼 접수 순번으로 가르면 본선에서는 근거가 없다.
    if (tieBreak === "public" && b.publicScore !== a.publicScore) return b.publicScore - a.publicScore;
    return byEntryNo(a, b);
  });
  rows.forEach((row, index) => { row.rank = index + 1; });

  // 합산까지 같았던 행은 전부 표시한다 — 규칙으로 갈렸어도 운영자는 알아야 한다.
  for (const row of rows) {
    row.tied = rows.some((other) => other !== row && other.combined === row.combined);
  }
  return rows;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 진출 확정 시 남기는 스냅샷.
 * 확정 뒤에 표가 더 들어와도 **그때 무엇을 보고 정했는지**가 흔들리면 안 된다.
 */
export interface AdvanceSnapshot {
  decidedAt: string;
  roundKind: string;
  advanceCount: number;
  publicWeight: number;
  judgeWeight: number;
  rows: CombinedRow[];
}
