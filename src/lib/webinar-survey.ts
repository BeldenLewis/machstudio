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
}

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
      const options = Array.isArray(q.options) ? q.options.map(String).filter(Boolean).slice(0, 20) : [];
      const type = QUESTION_TYPES.includes(q.type as SurveyQuestionType) ? (q.type as SurveyQuestionType) : "text";
      // maxSelect 는 복수응답에서만 의미 — 1~옵션수 범위로 클램프. 옵션 전체 이상이면 무제한과 같아 생략.
      const rawMax = Number(q.maxSelect);
      const maxSelect =
        type === "multiple" && Number.isInteger(rawMax) && rawMax >= 1 && rawMax < options.length
          ? rawMax
          : undefined;
      return { id: String(q.id ?? `q_${i}`), type, title: String(q.title ?? ""), required: q.required === true, options, ...(maxSelect !== undefined ? { maxSelect } : {}) };
    });
  const visible = normalized.filter(
    (q) => q.title.trim() !== "" && !((q.type === "single" || q.type === "multiple") && q.options.length === 0),
  );
  return (opts?.includeHidden ? normalized : visible).slice(0, 30);
}

export type SurveyAnswers = Record<string, number | string | string[]>;

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
