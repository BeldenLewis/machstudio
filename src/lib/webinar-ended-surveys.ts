/**
 * 종료 화면 설문 — **무엇을 보여줄지 정하는 규칙 하나**를 여기 둔다.
 *
 * 설문이 들어오는 경로가 두 개다: 자체 설문(WebinarSurvey.showOnEnded, 여러 개 가능)과
 * 외부 설문 URL(config.surveyUrl, 하나). 규칙은 **배타적 폴백**이다 —
 * 자체 설문이 하나라도 있으면 외부 URL 은 쓰지 않는다.
 *
 * 합치지 않는 이유: 합치면 어드민이 자체 설문을 만든 뒤에도 옛 외부 URL 카드가 계속 따라붙어,
 * "지웠다고 생각한 링크" 가 시청자 화면에 남는다. 어디서 지워야 하는지도 화면에 드러나지 않는다.
 *
 * 이 규칙이 두 면에 걸쳐 있어서 모듈로 뺐다:
 *   · 종료 화면(EndedScreen) — 카드 N장
 *   · 임베드 배너·히어로 — CTA 한 줄이라 첫 번째만 쓴다
 * 한쪽만 고치면 같은 웨비나가 면에 따라 다른 설문을 가리킨다.
 */

/** DB 에서 읽어 오는 자체 설문 — 공개해도 되는 값만(응답·문항은 여기 오지 않는다). */
export type EndedSurveyRef = { id: string; title?: string | null; description?: string | null };

/** 화면이 그리는 카드 하나. */
export type EndedSurveyLink = { url: string; title?: string | null; description?: string | null };

/**
 * 종료 화면에 그릴 설문 목록. `buildUrl` 이 면마다 다른 URL 형태를 만든다
 * (뷰어는 상대 경로, 임베드는 절대 URL).
 */
export function endedSurveyLinks(
  surveys: readonly EndedSurveyRef[],
  externalUrl: unknown,
  buildUrl: (id: string) => string,
): EndedSurveyLink[] {
  if (surveys.length > 0) {
    return surveys.map((s) => ({ url: buildUrl(s.id), title: s.title ?? null, description: s.description ?? null }));
  }
  // 외부 URL 은 제목·설명이 없다 — 화면이 기본 문구로 채운다.
  return typeof externalUrl === "string" && externalUrl.trim() !== "" ? [{ url: externalUrl }] : [];
}

/**
 * /info · /preview 응답에서 설문 목록을 읽는다.
 *
 * `endedSurveys`(배열)가 정본이고 `endedSurvey`(단일)는 이전 배포의 키다. 두 응답이 캐시로
 * 섞이는 창이 있어서, 배열이 없을 때만 단일 키로 떨어진다 — 그러지 않으면 그 창에서
 * 설문 카드가 통째로 사라진다. **다음 배포에서 단일 키 폴백 제거.**
 */
export function readEndedSurveys(payload: Record<string, unknown>): EndedSurveyRef[] {
  const list = payload.endedSurveys;
  if (Array.isArray(list)) return list.filter((s): s is EndedSurveyRef => !!s && typeof (s as EndedSurveyRef).id === "string");
  const one = payload.endedSurvey as EndedSurveyRef | null | undefined;
  return one && typeof one.id === "string" ? [one] : [];
}
