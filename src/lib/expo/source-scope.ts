/**
 * **사전등록 소스를 이 사이트가 써도 되는가** — 한 정의로 모은다.
 *
 * ── 왜 모으나 ─────────────────────────────────────────────────────────
 * 같은 판정이 네 곳에서 필요하다: 편집기에 목록을 줄 때, 사이트 기본 소스를 바꿀 때,
 * 공개 로더가 렌더할 때, 미리보기가 렌더할 때. 흩어져 있으면 한 곳만 느슨해진다 —
 * 실제로 사이트 PATCH 는 `mode === "builder"` 를 안 보고 있었다(capture 모드 소스를
 * 기본 소스로 붙일 수 있었다).
 *
 * 조건은 셋이다: **같은 프로젝트 · 지워지지 않음 · builder 모드.**
 * capture 모드는 아임웹에서 긁어 오는 쪽이라 폼이 아니고, 홈페이지가 그걸 폼으로
 * 그리면 방문자에게 빈 껍데기가 나간다.
 *
 * 이 파일은 **DB 를 모른다.** 무엇을 물어볼지(`sourceScopeWhere`)와 답으로 무슨 판정을
 * 내릴지(`isUsableSource`)만 정하고, 조회는 라우트가 한다. `request.ts`·`site-service.ts`
 * 가 순수 함수인 것과 같은 이유다.
 */

/** 조회에 그대로 넣는 조건. 네 호출부가 같은 것을 물어보게 한다. */
export function sourceScopeWhere(projectId: string, ids?: readonly string[]) {
  return {
    ...(ids ? { id: { in: [...ids] } } : {}),
    projectId,
    deletedAt: null,
    mode: "builder",
  } as const;
}

/** 조회해 온 행이 쓸 수 있는 것인가. 방어적 재검증에 쓴다. */
export function isUsableSource(
  row: { projectId: string; deletedAt: Date | null; mode: string } | null | undefined,
  projectId: string,
): boolean {
  return !!row && row.projectId === projectId && row.deletedAt === null && row.mode === "builder";
}

/**
 * draft 두 벌을 비교해 **이번에 새로 들어온** sourceRef 만 고른다.
 *
 * 왜 바뀐 것만 보나: `SourceRefField` 는 값이 후보 목록에 없으면 빈 select 로 그릴 뿐
 * `onChange` 를 내지 않는다 — 그래서 낡은 참조가 payload 에 계속 실린다. 매번 대조하면
 * 소스를 하나 지운 순간, 운영자가 **전혀 다른 구획의 글자 하나**를 고쳐도 그 페이지가
 * 영구히 저장 불가가 된다. 손대지 않은 참조는 발행 게이트와 공개·미리보기 재검증이 막는다.
 *
 * 안 바뀌었으면 빈 배열이고, 그러면 라우트는 **조회를 아예 하지 않는다**(자동저장 핫패스).
 */
export function changedSourceRefs(
  next: unknown,
  prior: unknown,
): Array<{ sid: string; value: string }> {
  const before = collectRefs(prior);
  const out: Array<{ sid: string; value: string }> = [];
  for (const [sid, value] of collectRefs(next)) {
    if (before.get(sid) !== value) out.push({ sid, value });
  }
  return out;
}

function collectRefs(raw: unknown): Map<string, string> {
  const found = new Map<string, string>();
  const sections = (raw as { sections?: unknown } | null)?.sections;
  if (!Array.isArray(sections)) return found;
  for (const s of sections) {
    if (!s || typeof s !== "object") continue;
    const sid = (s as { sid?: unknown }).sid;
    const content = (s as { content?: unknown }).content;
    if (typeof sid !== "string" || !content || typeof content !== "object") continue;
    const ref = (content as { sourceRef?: unknown }).sourceRef;
    if (typeof ref === "string" && ref.trim()) found.set(sid, ref.trim());
  }
  return found;
}
