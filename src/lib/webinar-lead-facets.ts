/**
 * 리드 분석 — 참여 점수를 **결정에 쓸 수 있는 축**으로 쪼갠다.
 *
 * 세그먼트 막대(핫·웜·콜드·노쇼) 네 칸만으로는 다음 웨비나를 어떻게 바꿀지 알 수 없다.
 * 실측(8/11 웨비나 256명)에서 쓸 만한 축이 뭔지 먼저 확인하고 고른 것들이다:
 *   · 업종: K-뷰티 109 · K-푸드 61 · K-라이프스타일 59 + 기타 27 → 3그룹으로 표본이 충분하다
 *   · 직함: **의사결정권자 137** · 중간관리자 54 · 실무 65 (버킷 적용 후) — 세 그룹 다 표본 충분
 *   · 채널: meta/da 173 은 신뢰 가능하지만 kakao 13 · google 6 은 평균을 내면 노이즈다
 * 등록 폼이 업종·직함을 받고 있는데 명단에만 있고 분석에는 전혀 안 쓰이고 있었다.
 *
 * 여기 있는 함수는 전부 순수 함수다(DB 접근 없음) — 규칙을 테스트로 묶기 위해서.
 */

/** 이 인원 미만이면 평균을 믿지 말라고 화면에 표시한다. 채널·업종·직함에 같은 기준을 쓴다. */
export const MIN_RELIABLE_SAMPLE = 20;

/** 세분화 축의 한 줄. 화면은 이 모양 하나만 알면 업종·직함·채널을 같은 표로 그린다. */
export interface FacetRow {
  label: string;
  /** 이 그룹의 등록자 수 */
  total: number;
  /** 그중 입장한 사람 */
  entered: number;
  /** 입장자 평균 참여 점수(노쇼는 평균을 끌어내리므로 제외) */
  avgScore: number;
  /** 핫 인원 */
  hot: number;
  /** 표본이 MIN_RELIABLE_SAMPLE 이상인가 — false 면 화면이 흐리게 표시한다 */
  reliable: boolean;
}

/** 점수 하나를 만드는 데 필요한 최소 정보. ScoredRow 가 이 모양을 만족한다. */
export interface ScoreLike {
  entered: boolean;
  score: number;
  segment: "hot" | "warm" | "cold";
  breakdown: { attend: number; watch: number; interact: number; intent: number };
}

/* ───────────────────────── 직함 버킷 ───────────────────────── */

export type RoleBucket = "decision" | "manager" | "staff" | "unknown";

export const ROLE_LABEL: Record<RoleBucket, string> = {
  decision: "의사결정권자",
  manager: "중간관리자",
  staff: "실무·기타",
  unknown: "미기재",
};

export const ROLE_HINT: Record<RoleBucket, string> = {
  decision: "대표·오너·임원 — 계약을 결정할 수 있는 사람",
  manager: "팀장·부장·과장·매니저 등 중간관리자",
  staff: "그 외 기입값 (사원·주임·담당 등)",
  unknown: "직함을 적지 않은 등록자",
};

/**
 * 직함은 자유 입력이라 "대표"/"대표이사"/"CEO" 가 따로 집계된다 — 버킷으로 묶는다.
 * 순서가 중요하다: "대표" 를 먼저 보면 "대표이사" 도 결정권자로 잡힌다.
 * 애매한 값(예: 이사대우)은 결정권자로 올리지 않는 쪽이 안전하다 — 영업 리스트가 부풀면
 * 우선순위가 무의미해진다.
 */
const DECISION_WORDS = ["대표", "사장", "회장", "부사장", "전무", "상무", "이사", "오너", "owner", "창업", "founder", "ceo", "coo", "cfo", "cto", "cmo", "임원", "총괄", "본부장"];
const MANAGER_WORDS = ["팀장", "부장", "차장", "과장", "실장", "매니저", "manager", "리드", "lead", "파트장", "그룹장", "센터장", "점장"];

export function roleBucket(jobTitle: string | null | undefined): RoleBucket {
  const raw = (jobTitle ?? "").trim().toLowerCase();
  if (!raw) return "unknown";
  // "이사대우"·"이사보" 는 결정권자로 보지 않는다 — 실제 결재선이 아닌 경우가 많다.
  if (/이사(대우|보)/.test(raw)) return "manager";
  if (DECISION_WORDS.some((w) => raw.includes(w))) return "decision";
  if (MANAGER_WORDS.some((w) => raw.includes(w))) return "manager";
  return "staff";
}

/* ───────────────────────── 세분화 집계 ───────────────────────── */

/**
 * 한 그룹의 요약. 채널 품질처럼 그룹핑 규칙이 다른 곳에서도 **같은 평균·신뢰 기준**을 쓰도록
 * 내보낸다(각자 평균을 계산하면 노쇼 포함 여부가 갈라진다).
 */
export function summarizeFacet(label: string, rows: ScoreLike[]): FacetRow {
  const entered = rows.filter((r) => r.entered);
  const sum = entered.reduce((s, r) => s + r.score, 0);
  return {
    label,
    total: rows.length,
    entered: entered.length,
    // 노쇼를 평균에 넣으면 모든 그룹이 0 쪽으로 눌려 그룹 간 차이가 사라진다.
    avgScore: entered.length ? Math.round(sum / entered.length) : 0,
    hot: entered.filter((r) => r.segment === "hot").length,
    reliable: rows.length >= MIN_RELIABLE_SAMPLE,
  };
}

/**
 * 임의의 키로 묶어 개별 표시할 것만 남기고 나머지를 "기타" 로 접는다.
 *
 * 업종은 버킷팅하지 않는다 — K-뷰티/K-푸드처럼 이미 깔끔한 값이라 원문이 제일 정확하다.
 *
 * 접는 기준이 **두 개**인 이유(실측에서 걸린 문제): 상위 5개만 자르니
 * 1명짜리 자유 입력("현재는 건강기능식품, 차후 뷰티브랜드 확대 등")이 상위 목록에 끼고
 * 정작 **24명짜리 "기타"** 가 그 아래로 갔다. 개별 줄은 최소 인원(minCount)을 넘겨야 한다.
 *
 * 빈 키는 별도 라벨(emptyLabel)로 모은다 — 조용히 버리면 합이 전체와 안 맞는다.
 * 동수일 때 순서가 흔들리지 않게 인원 → 라벨 순으로 정렬한다.
 */
export function facetBy<T extends ScoreLike>(
  rows: T[],
  keyOf: (row: T) => string,
  opts: { limit?: number; minCount?: number; emptyLabel?: string; otherLabel?: string } = {},
): FacetRow[] {
  const { limit = 5, emptyLabel = "미기재", otherLabel = "기타" } = opts;
  /* 개별 줄로 올릴 최소 인원 — 규모에 따라 다르게 잡는다. 262명 웨비나에서 2명짜리는 소음이지만
     30명 웨비나에서 2명은 의미가 있다. 전체의 2%(최소 2명)를 기준으로 둔다. */
  const minCount = opts.minCount ?? Math.max(2, Math.ceil(rows.length * 0.02));
  const groups = new Map<string, T[]>();
  const empty: T[] = [];
  for (const row of rows) {
    const key = keyOf(row).trim();
    if (!key) { empty.push(row); continue; }
    const bag = groups.get(key);
    if (bag) bag.push(row);
    else groups.set(key, [row]);
  }
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const head = sorted.filter(([, v]) => v.length >= minCount).slice(0, limit);
  const headKeys = new Set(head.map(([k]) => k));
  const tail = sorted.filter(([k]) => !headKeys.has(k)).flatMap(([, v]) => v);

  const out = head.map(([label, v]) => summarizeFacet(label, v));
  if (tail.length) out.push(summarizeFacet(otherLabel, tail));
  if (empty.length) out.push(summarizeFacet(emptyLabel, empty));
  return out;
}

/** 직함 버킷 순서를 고정해 집계한다 — 인원순으로 뒤섞이면 표를 볼 때마다 순서가 바뀐다. */
export function facetByRole<T extends ScoreLike & { jobTitle: string | null }>(rows: T[]): FacetRow[] {
  const order: RoleBucket[] = ["decision", "manager", "staff", "unknown"];
  const buckets = new Map<RoleBucket, T[]>(order.map((k) => [k, []]));
  for (const row of rows) buckets.get(roleBucket(row.jobTitle))!.push(row);
  return order
    .filter((k) => buckets.get(k)!.length > 0)
    .map((k) => summarizeFacet(ROLE_LABEL[k], buckets.get(k)!));
}

/* ───────────────────────── 점수 분포 ───────────────────────── */

export interface HistogramBin {
  from: number;
  to: number;
  count: number;
}

/**
 * 10점 구간 히스토그램 — **입장자만**.
 *
 * 노쇼(0점)를 넣으면 0~9 칸이 압도해 나머지가 안 보인다(실측: 40명 중 18명 노쇼).
 * 노쇼 규모는 세그먼트 막대가 이미 말해준다.
 *
 * 이게 필요한 이유: 세그먼트 4칸으로는 "60점에 사람이 몰려 있다"(= 끝까지 봤지만
 * 아무 행동도 안 한 시청자)를 볼 수 없다. 경계(핫 65)가 맞는지 판단하려면 그 모양이 보여야 한다.
 */
export function scoreHistogram(rows: ScoreLike[]): HistogramBin[] {
  const bins: HistogramBin[] = Array.from({ length: 10 }, (_, i) => ({ from: i * 10, to: i * 10 + 9, count: 0 }));
  // 100점은 마지막 칸(90~99)에 함께 담는다 — 1칸만 있는 100 전용 칸은 읽기만 어렵게 한다.
  bins[9].to = 100;
  for (const r of rows) {
    if (!r.entered) continue;
    const idx = Math.min(9, Math.floor(r.score / 10));
    bins[idx].count += 1;
  }
  return bins;
}

/* ───────────────────────── 점수 구성 기여도 ───────────────────────── */

export interface ScoreComposition {
  attend: number;
  watch: number;
  interact: number;
  intent: number;
  /** 네 덩어리 합 = 입장자 점수 총합 */
  total: number;
}

/**
 * 전체 점수가 어디서 왔는지 — "이번 웨비나는 체류는 좋았는데 상호작용이 0" 을 한 줄로 만든다.
 * 입장자만 센다(노쇼는 참석·체류가 0이라 비중을 왜곡한다).
 */
export function scoreComposition(rows: ScoreLike[]): ScoreComposition {
  const out: ScoreComposition = { attend: 0, watch: 0, interact: 0, intent: 0, total: 0 };
  for (const r of rows) {
    if (!r.entered) continue;
    out.attend += r.breakdown.attend;
    out.watch += r.breakdown.watch;
    out.interact += r.breakdown.interact;
    out.intent += r.breakdown.intent;
  }
  out.total = out.attend + out.watch + out.interact + out.intent;
  return out;
}

/* ───────────────────────── 행동별 리프트 ───────────────────────── */

export interface LiftRow {
  action: string;
  /** 그 행동을 한 입장자 수 */
  withCount: number;
  /** 그 행동을 한 사람의 평균(행동 점수 제외) */
  withAvg: number;
  /** 안 한 사람의 평균(행동 점수 제외) */
  withoutAvg: number;
  reliable: boolean;
}

/**
 * "투표한 사람은 원래 더 열심이었나?"
 *
 * **행동 점수를 뺀 점수로 비교한다.** 그러지 않으면 동어반복이다 — 투표하면 4점이 붙으니
 * 투표한 사람 점수가 높은 건 당연하다. 참석+체류+인텐트만 비교해야
 * "투표한 사람은 (투표 가점을 빼고도) 더 오래 봤다" 를 알 수 있고, 그게 다음 웨비나에
 * 투표를 더 넣을 근거가 된다.
 */
export function actionLift<T extends ScoreLike>(
  rows: T[],
  actions: { action: string; did: (row: T) => boolean }[],
): LiftRow[] {
  const entered = rows.filter((r) => r.entered);
  const base = (r: ScoreLike) => r.breakdown.attend + r.breakdown.watch + r.breakdown.intent;
  const avg = (list: T[]) => (list.length ? Math.round(list.reduce((s, r) => s + base(r), 0) / list.length) : 0);
  return actions.map(({ action, did }) => {
    const yes = entered.filter(did);
    const no = entered.filter((r) => !did(r));
    return {
      action,
      withCount: yes.length,
      withAvg: avg(yes),
      withoutAvg: avg(no),
      reliable: yes.length >= MIN_RELIABLE_SAMPLE,
    };
  });
}
