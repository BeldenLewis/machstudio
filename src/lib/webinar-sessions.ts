/**
 * 세션 유형 규칙 한 곳 — 뷰어·어드민·랜딩이 같은 결론을 내야 한다.
 *
 * WebinarSession.type 은 "session" | "qa" | "break" 이고, qa/break 는 **진행 순서상의 항목**이지
 * 세션이 아니다(연사도 없다). 그런데 `number` 는 순서(정렬 키)와 표시 번호를 겸하고 있어서,
 * 중간에 break 가 끼면 실제 세션 번호가 1, 2, 4, 5 처럼 끊긴다 — 시청자에게 "세션 4"가
 * 세 번째 세션으로 보이는 상태였다.
 *
 * 그래서 두 축을 분리한다:
 *  - number      : DB 의 진행 순서. 정렬과 Q&A 참조(WebinarQA.sessionNumber)의 키. 절대 바꾸지 않는다.
 *  - 표시 순번    : 실제 세션만 1..N 으로 다시 센 값. 화면에 보이는 "세션 n" 은 이것을 쓴다.
 * number 를 renumber 하지 않는 이유: 이미 저장된 Q&A 의 sessionNumber 참조가 끊긴다.
 */

export interface SessionLike {
  number: number;
  type?: string | null;
}

/** qa/break 는 세션이 아니다. type 이 비어 있는 레거시 행은 세션으로 본다(스키마 기본값과 동일). */
export function isRealSession(s: SessionLike): boolean {
  return (s.type ?? "session") === "session";
}

/**
 * 레거시 오염값 정리. PATCH 라우트의 String(null) 버그로 문자열 "null" 이 저장된 행이 있었다.
 * 그 버그는 고쳤지만 이미 저장된 값이 남아 있을 수 있어 읽는 쪽에서도 한 번 걸러 준다
 * (해당 행을 어드민에서 다시 저장하면 자연히 사라진다).
 */
export function cleanSessionText(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  return s === "null" || s === "undefined" ? "" : s;
}

export interface SessionNumbering {
  /** 실제 세션 개수 (qa/break 제외) — "N개 세션", "n/N" 의 N. */
  realCount: number;
  /** DB number → 표시 순번(1-based). 실제 세션이 아니면 null. */
  displayNumber(number: number): number | null;
}

/**
 * 진행 순서(number 오름차순)를 기준으로 실제 세션만 1..N 으로 다시 센다.
 * 입력 순서에 의존하지 않도록 내부에서 number 로 정렬한다.
 */
export function buildSessionNumbering(rows: readonly SessionLike[]): SessionNumbering {
  const map = new Map<number, number>();
  let n = 0;
  for (const s of [...rows].sort((a, b) => a.number - b.number)) {
    if (!isRealSession(s)) continue;
    map.set(s.number, ++n);
  }
  return {
    realCount: n,
    displayNumber: (number: number) => map.get(number) ?? null,
  };
}
