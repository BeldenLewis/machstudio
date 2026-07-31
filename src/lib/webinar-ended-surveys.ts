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
export type EndedSurveyRef = {
  id: string;
  title?: string | null;
  description?: string | null;
  /** 이 설문으로 가는 버튼 문구. 비어 있으면 화면이 기본 문구("설문 참여하기")로 채운다. */
  ctaLabel?: string | null;
  /**
   * 응답 기간 — 화면이 **자기 시계로** 상태를 파생하도록 원본 값을 그대로 싣는다.
   *
   * 서버가 판정 결과만 보내면 그 값은 fetch 시점에 굳는다. 종료 화면은 웨비나가 끝난 뒤
   * 오래 열려 있어서, 예약 시각이 지나도 새로고침할 때까지 "아직 열리지 않았어요" 에 머물렀다.
   * 원본을 보내면 폴링이 갱신하는 serverNow 로 다시 판정해 시각이 되는 순간 스스로 열린다.
   */
  isOpen?: boolean;
  opensAt?: string | null;
  closesAt?: string | null;
};

/**
 * 화면이 그리는 카드 하나.
 *
 * `surveyId` 가 있으면 **우리 설문**이다 — 종료 화면이 새 창 대신 팝업으로 문항을 띄운다.
 * 없으면 외부 설문 URL(config.surveyUrl)이라 문항을 받아올 수 없어 새 탭으로 보낸다.
 * URL 을 파싱해 판정하지 않는 이유: 경로 형태가 바뀌면 조용히 오판한다.
 */
export type EndedSurveyLink = {
  url: string;
  surveyId?: string | null;
  title?: string | null;
  description?: string | null;
  ctaLabel?: string | null;
  /** 응답 기간 원본 — 화면이 자기 시계로 상태를 파생한다(위 EndedSurveyRef 주석 참고). */
  isOpen?: boolean;
  opensAt?: string | null;
  closesAt?: string | null;
};

/**
 * 종료 화면에 그릴 설문 목록. `buildUrl` 이 면마다 다른 URL 형태를 만든다
 * (뷰어는 상대 경로, 임베드는 절대 URL).
 */
export function endedSurveyLinks(
  surveys: readonly EndedSurveyRef[],
  externalUrl: unknown,
  buildUrl: (id: string) => string,
  /**
   * 자체 설문이 **하나라도 존재하는가** — 배타적 폴백의 진짜 기준.
   *
   * `surveys` 는 지금 보여줄 것만 담긴 목록이라 응답 기간을 벗어난 설문은 빠진다. 그걸 기준으로
   * 폴백을 판정하면, 시작 예약을 걸어 둔 창에서 자체 설문이 "없는 것"이 되어 **지웠다고 생각한
   * 옛 외부 URL 이 되살아난다** — 파트너 사이트 배너가 옛 폼을 가리키는 사고가 실제로 이렇게 났다.
   * 그래서 존재 여부를 따로 받는다. 생략하면 예전처럼 목록 길이로 판정한다.
   */
  internalExists: boolean = surveys.length > 0,
): EndedSurveyLink[] {
  if (surveys.length > 0) {
    return surveys.map((s) => ({
      url: buildUrl(s.id),
      surveyId: s.id,
      title: s.title ?? null,
      description: s.description ?? null,
      ctaLabel: s.ctaLabel ?? null,
      isOpen: s.isOpen,
      opensAt: s.opensAt ?? null,
      closesAt: s.closesAt ?? null,
    }));
  }
  // 자체 설문이 (지금 안 보이더라도) 있으면 외부 URL 은 끝까지 쓰지 않는다.
  if (internalExists) return [];
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

/**
 * 자체 설문이 하나라도 연결돼 있는가 — 배타적 폴백용 플래그를 응답에서 읽는다.
 *
 * 이 키가 없는 옛 배포 응답(캐시)에서는 `endedSurveys` 길이로 떨어진다. 그 창에서 폴백이
 * 옛 외부 URL 로 되살아날 수 있지만, 키를 요구하면 그 창에서 설문 카드가 통째로 사라진다 —
 * 둘 중 덜 나쁜 쪽을 고른다. **다음 배포에서 이 폴백 제거.**
 */
export function readHasInternalEndedSurvey(payload: Record<string, unknown>): boolean | undefined {
  const v = payload.hasInternalEndedSurvey;
  return typeof v === "boolean" ? v : undefined;
}
