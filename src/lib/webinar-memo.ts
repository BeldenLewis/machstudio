// 등록자 memo 컬럼의 형식 — **한 곳에서만** 정의한다.
//
// 공개 등록 라우트는 memo 컬럼에 평문이 아니라 JSON 을 넣는다:
//   JSON.stringify({ memo: "본인이 쓴 메모", customFields: { "직무": "개발", … } }, null, 2)
// 등록 폼의 커스텀 문항 답변이 여기 함께 들어간다. 그런데 이 형식을 아는 코드가 CSV 내보내기
// 하나뿐이었다 → 등록자 상세 패널은 이 JSON **원문**을 textarea 에 그대로 물려 두었고,
// 운영자가 메모를 한 글자 고쳐 저장하면 textarea 의 내용이 memo 컬럼을 통째로 덮어써
// customFields(= 응답자가 제출한 커스텀 답변) 가 사라졌다.
//
// 읽기(parseMemo)와 쓰기(buildMemo)를 짝으로 두어, 편집이 note 만 갈아끼우고 customFields 는
// 보존하도록 한다.

export type ParsedMemo = { note: string; customFields: Record<string, unknown> };

/** memo 는 JSON 문자열({ memo, customFields }) 또는 (구버전) 평문일 수 있다. */
export function parseMemo(memo: string | null | undefined): ParsedMemo {
  if (!memo) return { note: "", customFields: {} };
  try {
    const parsed = JSON.parse(memo);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const p = parsed as Record<string, unknown>;
      return {
        note: typeof p.memo === "string" ? p.memo : "",
        customFields:
          p.customFields && typeof p.customFields === "object" && !Array.isArray(p.customFields)
            ? (p.customFields as Record<string, unknown>)
            : {},
      };
    }
  } catch {
    /* 평문 memo — 그대로 note 로 본다 */
  }
  return { note: memo, customFields: {} };
}

/**
 * note + customFields 를 저장 형태로 되돌린다.
 * 둘 다 비면 null(= 컬럼 비움). customFields 가 없고 note 만 있으면 register 라우트와 같은
 * 모양({ memo })으로 넣어 형식을 한 가지로 유지한다.
 */
export function buildMemo(note: string, customFields: Record<string, unknown>): string | null {
  const trimmed = (note ?? "").trim();
  const hasCustom = Object.keys(customFields ?? {}).length > 0;
  if (!trimmed && !hasCustom) return null;
  return JSON.stringify(
    { ...(trimmed ? { memo: trimmed } : {}), ...(hasCustom ? { customFields } : {}) },
    null,
    2,
  );
}
