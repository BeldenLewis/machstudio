// 대회 단계 머신 — 단일 정의. 소비처: 신청 라우트, 임베드 config, 어드민 상태 바.
// 상태 문자열은 여기 값이 유일한 계약이다.
//
// 자동 판정 (모집 기간 기반):
//   recruiting: recruitOpenAt <= now <= recruitCloseAt   (접수 중)
//   upcoming:   now < recruitOpenAt                       (접수 시작 전)
//   prelim:     recruitCloseAt < now                      (접수 마감 후 기본 단계)
// phaseOverride 가 있으면 자동 판정을 덮어쓴다 — 현장에서 "지금 접수 닫아",
// "지금 투표 열어" 같은 조작이 반드시 필요하다(webinar-status 의 statusOverride 와 같은 이유).

export const COMPETITION_PHASES = [
  "upcoming",
  "recruiting",
  "prelim",
  "judging",
  "final",
  "announced",
  "closed",
] as const;

export type CompetitionPhase = (typeof COMPETITION_PHASES)[number];

/** 운영자가 수동으로 고를 수 있는 단계 — upcoming 은 자동 판정 전용(수동 선택 의미 없음). */
export const COMPETITION_PHASE_OVERRIDES = [
  "recruiting",
  "prelim",
  "judging",
  "final",
  "announced",
  "closed",
] as const;
export type CompetitionPhaseOverride = (typeof COMPETITION_PHASE_OVERRIDES)[number];

/** 상태별 라벨·배지 톤 — 목록·헤더·운영 화면이 같은 라벨을 쓴다. */
export const COMPETITION_PHASE_META: Record<CompetitionPhase, { label: string; tone: string }> = {
  upcoming: { label: "접수 대기", tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  recruiting: { label: "접수 중", tone: "bg-green-500/10 text-green-600 dark:text-green-400" },
  prelim: { label: "예선", tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  judging: { label: "심사 중", tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  final: { label: "본선", tone: "bg-red-500/10 text-red-500" },
  announced: { label: "발표 완료", tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  closed: { label: "종료", tone: "bg-secondary text-muted-foreground" },
};

/**
 * 대회를 만들 때 넣어 두는 라운드 기본 이름.
 *
 * 이건 **우리가 넣은 시드**지 운영자가 쓴 글이 아니다. 그래서 공고를 영어로 두면 이 이름도
 * 따라 바뀌어야 한다 — 미국 행사 공고에 "예선/본선" 두 글자만 한글로 남는 일이 실제로 있었다.
 * 운영자가 한 번이라도 이름을 바꿨다면 그건 운영자의 글이니 그대로 둔다(비교 기준이 이 상수다).
 */
export const DEFAULT_ROUND_NAME: Record<"prelim" | "final", string> = { prelim: "예선", final: "본선" };

export function isCompetitionPhaseOverride(value: unknown): value is CompetitionPhaseOverride {
  return typeof value === "string" && (COMPETITION_PHASE_OVERRIDES as readonly string[]).includes(value);
}

export interface CompetitionStatusInput {
  recruitOpenAt?: Date | string | null;
  recruitCloseAt?: Date | string | null;
  phaseOverride?: string | null;
}

export interface CompetitionStatusResult {
  phase: CompetitionPhase;
  isOverridden: boolean;
  /** 지금 신청서를 받을 수 있는가 — 서버도 이 값으로 막는다(클라이언트만 막으면 API 로 들어온다). */
  canApply: boolean;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function resolveCompetitionStatus(
  input: CompetitionStatusInput,
  now: Date = new Date(),
): CompetitionStatusResult {
  const openAt = toDate(input.recruitOpenAt);
  const closeAt = toDate(input.recruitCloseAt);
  const t = now.getTime();

  let auto: CompetitionPhase;
  if (openAt && t < openAt.getTime()) auto = "upcoming";
  else if (closeAt && t > closeAt.getTime()) auto = "prelim";
  else if (openAt || closeAt) auto = "recruiting";
  // 기간을 아무것도 안 정했으면 아직 준비 중으로 본다 — 빈 값이 곧 "모두에게 열림"이 되면 안 된다.
  else auto = "upcoming";

  const isOverridden = isCompetitionPhaseOverride(input.phaseOverride);
  const phase = isOverridden ? (input.phaseOverride as CompetitionPhase) : auto;

  return { phase, isOverridden, canApply: phase === "recruiting" };
}
