// 자체 설문 — 문항 스키마 정규화 + 응답 검증. 어드민 빌더/공개 응답 페이지/라이브 푸시/결과 집계가 공유한다.
// 문항은 WebinarSurvey.questions(JSON) 에 저장: [{ id, type, title, required, options[] }]

export type SurveyQuestionType = "rating" | "single" | "multiple" | "text" | "nps";

export interface SurveyQuestion {
  id: string;
  type: SurveyQuestionType;
  title: string;
  required: boolean;
  options: string[]; // single/multiple 만 사용
  maxSelect?: number; // multiple 전용 — 최대 선택 개수(없으면 무제한)
  /**
   * 보관된 문항 — 운영자가 편집기에서 지웠지만 **이미 수집된 답변이 있어** 정의를 남겨둔 것.
   * 답변은 WebinarSurveyResponse.answers 의 questionId 키로 저장되므로, 정의에서 문항이
   * 사라지면 분석·개별응답·CSV 가 그 열을 그리지 못해 수집된 답변이 조회 불가 상태가 된다.
   * 시청자에게는 보이지 않고(응답 화면에서 제외), 관리자 화면에는 '보관' 으로 남는다.
   */
  retired?: boolean;
}

/** 활성 문항 상한 — 보관된 문항은 여기에 포함되지 않는다. */
export const SURVEY_MAX_QUESTIONS = 30;
/** 문항당 선택지 상한. */
export const SURVEY_MAX_OPTIONS = 20;

export const SURVEY_TYPE_LABELS: Record<SurveyQuestionType, string> = {
  rating: "별점 (1~5)",
  single: "객관식 (하나만)",
  multiple: "객관식 (복수)",
  text: "주관식",
  nps: "추천지수 (0~10)",
};

const QUESTION_TYPES: readonly SurveyQuestionType[] = ["rating", "single", "multiple", "text", "nps"];

/**
 * 문항 정규화.
 * - 뷰어 경로(기본): 응답 화면에 그릴 수 없는 문항을 숨긴다.
 *   제목이 빈 미완성 초안, 그리고 선택지 0개 객관식(필수면 제출까지 막는다).
 * - 어드민 경로({ includeHidden: true }): 전부 보존한다. 두 가지 이유 —
 *   ① 자동저장이 제목 입력 전의 행(타입·선택지 포함)을 조용히 삭제하지 않도록,
 *   ② 이미 수집된 답변이 정의에서 빠져 관리자에게 안 보이는 일이 없도록.
 */
export function normalizeSurveyQuestions(raw: unknown, opts?: { includeHidden?: boolean }): SurveyQuestion[] {
  if (!Array.isArray(raw)) return [];
  const normalized = raw
    .filter((q): q is Record<string, unknown> => !!q && typeof q === "object")
    .map((q, i) => {
      const options = Array.isArray(q.options) ? q.options.map(String).filter(Boolean).slice(0, SURVEY_MAX_OPTIONS) : [];
      const type = QUESTION_TYPES.includes(q.type as SurveyQuestionType) ? (q.type as SurveyQuestionType) : "text";
      // maxSelect 는 복수응답에서만 의미 — 1~옵션수 범위로 클램프. 옵션 전체 이상이면 무제한과 같아 생략.
      const rawMax = Number(q.maxSelect);
      const maxSelect =
        type === "multiple" && Number.isInteger(rawMax) && rawMax >= 1 && rawMax < options.length
          ? rawMax
          : undefined;
      return {
        id: String(q.id ?? `q_${i}`),
        type,
        title: String(q.title ?? ""),
        required: q.required === true,
        options,
        ...(maxSelect !== undefined ? { maxSelect } : {}),
        ...(q.retired === true ? { retired: true as const } : {}),
      };
    });

  if (opts?.includeHidden) {
    // 관리자 경로 — 보관 문항까지 전부. 상한은 활성 문항에만 걸고(보관은 지난 답변 조회용이라
    // 잘라내면 데이터가 다시 안 보인다) 총량은 넉넉한 값으로만 막는다.
    const active = normalized.filter((q) => !q.retired).slice(0, SURVEY_MAX_QUESTIONS);
    const retired = normalized.filter((q) => q.retired).slice(0, 200);
    return [...active, ...retired];
  }
  // 뷰어 경로 — 그릴 수 없는 문항(빈 제목·선택지 0개)과 보관 문항을 제외한다.
  return normalized
    .filter(
      (q) =>
        !q.retired &&
        q.title.trim() !== "" &&
        !((q.type === "single" || q.type === "multiple") && q.options.length === 0),
    )
    .slice(0, SURVEY_MAX_QUESTIONS);
}

/**
 * 저장 직전 검증 — 상한 초과를 **조용히 자르지 않고** 알린다.
 * 예전엔 normalize 의 slice 가 31번째 문항·21번째 선택지를 버렸고, 저장은 200 을 반환해
 * 화면에 '저장됨' 까지 떴다(운영자는 사라진 걸 나중에 발견한다).
 */
export function validateSurveyQuestionLimits(questions: SurveyQuestion[]): string | null {
  const active = questions.filter((q) => !q.retired);
  if (active.length > SURVEY_MAX_QUESTIONS) {
    return `문항은 최대 ${SURVEY_MAX_QUESTIONS}개까지예요 (현재 ${active.length}개).`;
  }
  const over = active.find((q) => q.options.length > SURVEY_MAX_OPTIONS);
  if (over) {
    return `선택지는 문항당 최대 ${SURVEY_MAX_OPTIONS}개까지예요 ("${over.title || "제목 없는 문항"}").`;
  }
  return null;
}

/**
 * 편집기에서 사라진 문항 중 **이미 답변이 있는 것**을 보관 상태로 되살려 뒤에 붙인다.
 * answeredIds 는 응답의 answers 키 집합.
 */
export function retainAnsweredQuestions(
  incoming: SurveyQuestion[],
  previous: SurveyQuestion[],
  answeredIds: ReadonlySet<string>,
): SurveyQuestion[] {
  const kept = new Set(incoming.map((q) => q.id));
  const rescued = previous
    .filter((q) => !kept.has(q.id) && answeredIds.has(q.id))
    .map((q) => ({ ...q, retired: true as const }));
  return rescued.length ? [...incoming, ...rescued] : incoming;
}

/** 응답 수집 중인가 — 수동 토글(isOpen)과 마감 예약(closesAt) 양쪽을 판정. 공개 GET/POST·노출면 게이트가 공유. */
export function isSurveyAcceptingResponses(s: { isOpen: boolean; closesAt?: string | Date | null }): boolean {
  if (!s.isOpen) return false;
  if (!s.closesAt) return true;
  return new Date(s.closesAt).getTime() > Date.now();
}

export type SurveyAnswers = Record<string, number | string | string[]>;

/**
 * 답변 한 칸을 사람이 읽는 문자열로.
 *
 * 화면(등록자 상세)과 CSV 가 **같은 함수**를 써야 한다 — 갈라지면 화면에는 "4점" 인데
 * 내려받은 파일에는 "4" 로 적혀, 같은 응답인지 대조할 수 없다.
 *
 * 복수응답을 ", " 로 합치는 규칙은 등록 폼의 joinMultiValue 와 같다(webinar-config.ts).
 * 값 자체에 쉼표가 있으면 항목 경계와 섞이지만, 설문 선택지는 운영자가 만든 값이고
 * 여기서 고칠 방법이 없다 — CSV 는 셀 전체를 인용하므로 파일이 깨지지는 않는다.
 */
export function formatSurveyAnswer(question: Pick<SurveyQuestion, "type">, answer: unknown): string {
  const value = Array.isArray(answer) ? answer.join(", ") : String(answer);
  return question.type === "rating" || question.type === "nps" ? `${value}점` : value;
}

/** 답이 비었는가 — 화면은 그 문항을 건너뛰고, CSV 는 빈 칸을 남긴다. */
export function isEmptySurveyAnswer(answer: unknown): boolean {
  return answer === undefined || answer === null || answer === "" || (Array.isArray(answer) && answer.length === 0);
}

/**
 * CSV 열 이름에 쓸 문항 라벨. 제목이 빈 문항(초안·보관)은 열이 사라지면 답변도 같이
 * 안 보이게 되므로, 순번으로 자리를 만들어 준다.
 */
export function surveyQuestionColumnLabel(question: SurveyQuestion, index: number): string {
  const title = question.title.trim();
  const base = title || `문항 ${index + 1}`;
  return question.retired ? `${base} (보관)` : base;
}

/** 서버측 응답 검증 — 유효한 답만 남긴 cleaned 를 반환. 필수 미응답/형식 오류면 error. */
export function validateSurveyAnswers(
  questions: SurveyQuestion[],
  raw: unknown,
): { ok: true; cleaned: SurveyAnswers } | { ok: false; error: string } {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const cleaned: SurveyAnswers = {};

  for (const q of questions) {
    const v = input[q.id];
    const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
    // 선택지가 없는 객관식은 응답 화면에 그릴 수 없다 — 필수로 두면 제출 자체가 막히므로 건너뛴다.
    const unanswerable = (q.type === "single" || q.type === "multiple") && q.options.length === 0;
    if (empty) {
      if (q.required && !unanswerable) return { ok: false, error: `"${q.title}" 항목에 답해주세요.` };
      continue;
    }
    switch (q.type) {
      case "rating": {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1 || n > 5) return { ok: false, error: `"${q.title}" 별점이 올바르지 않아요.` };
        cleaned[q.id] = n;
        break;
      }
      case "nps": {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0 || n > 10) return { ok: false, error: `"${q.title}" 점수가 올바르지 않아요.` };
        cleaned[q.id] = n;
        break;
      }
      case "single": {
        const s = String(v);
        if (!q.options.includes(s)) return { ok: false, error: `"${q.title}" 선택지가 올바르지 않아요.` };
        cleaned[q.id] = s;
        break;
      }
      case "multiple": {
        const arr = (Array.isArray(v) ? v : [v]).map(String);
        if (arr.some((s) => !q.options.includes(s))) return { ok: false, error: `"${q.title}" 선택지가 올바르지 않아요.` };
        const uniq = [...new Set(arr)];
        if (q.maxSelect !== undefined && uniq.length > q.maxSelect) {
          return { ok: false, error: `"${q.title}" 은(는) 최대 ${q.maxSelect}개까지 선택할 수 있어요.` };
        }
        cleaned[q.id] = uniq;
        break;
      }
      case "text": {
        const s = String(v).trim().slice(0, 2000);
        if (s) cleaned[q.id] = s;
        else if (q.required) return { ok: false, error: `"${q.title}" 항목에 답해주세요.` };
        break;
      }
    }
  }
  return { ok: true, cleaned };
}
