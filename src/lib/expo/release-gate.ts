/**
 * **밖으로 내보내는 것을 켜는 일**은 릴리스 승인 뒤에만 된다.
 *
 * ── 무엇을 막나 ───────────────────────────────────────────────────────
 * `EXPO_PUBLIC_EMBED_RELEASE` 가 꺼져 있는 동안 두 가지를 막는다:
 *  ① 페이지 공개(`liveAt` null→set)
 *  ② 구획의 `embedEnabled` false→true — 초안 저장과 발행 양쪽에서
 *
 * ②가 필요한 이유가 덜 분명하다. **구획 단독 임베드는 `liveAt` 을 보지 않는다** —
 * 발행본에 있고 `embedEnabled` 가 켜져 있고 내용이 있으면 그대로 나간다
 * (`model.ts` 의 `standaloneSection`, `app/h/[pageId]/loader.ts`). 그래서 ①만 막으면
 * **발행만으로 노출이 미리 장전된다**: 플래그를 켜는 순간 준비해 둔 구획이 그대로 나간다.
 * 계획서가 "the flag alone cannot expose prepared content" 라고 쓴 것이 이 상태다.
 *
 * ── 끄는 것은 언제나 허용이다 ─────────────────────────────────────────
 * 그 비대칭을 여기 한 곳에 담지 않는다. **켜는 경로에만 검사를 넣고 끄는 경로에는 한 줄도
 * 추가하지 않는 것**이 가장 확실한 보증이다. 이 파일의 함수도 "새로 켜진 것" 만 돌려준다 —
 * 끄는 것과 그대로인 것은 결과에 담길 수 없다.
 *
 * ── 왜 diff 인가 ──────────────────────────────────────────────────────
 * "지금 켜져 있는 것" 을 막으면 이미 켜 둔 구획이 있는 페이지가 **영구 저장 불가**가 된다.
 * `source-scope.ts` 의 `changedSourceRefs` 가 같은 함정을 같은 방식으로 피한다.
 *
 * 이 파일은 DB 도 정규화도 모른다. 던지지 않는다 — 무엇이 오든 판정만 낸다.
 */

/**
 * sid → embedEnabled. 원본을 그대로 읽는다. `config.ts` 의 정규화가 `=== true` 로 받는 것과
 * 같은 규칙이라, 512KB 짜리 JSON 을 정규화로 한 번 더 돌 이유가 없다.
 */
function embedFlags(raw: unknown): Map<string, boolean> {
  const found = new Map<string, boolean>();
  const sections = (raw as { sections?: unknown } | null)?.sections;
  if (!Array.isArray(sections)) return found;
  for (const s of sections) {
    if (!s || typeof s !== "object") continue;
    const sid = (s as { sid?: unknown }).sid;
    if (typeof sid !== "string") continue;
    found.set(sid, (s as { embedEnabled?: unknown }).embedEnabled === true);
  }
  return found;
}

/**
 * 이번에 **false→true 로 켜진** 구획들. 끄는 것도, 그대로인 것도 담기지 않는다.
 * 처음 보는 sid 는 이전 값이 없으므로 켜진 것으로 센다 — 새 구획을 켠 채로 들여올 수 없다.
 */
export function newlyEmbedEnabled(next: unknown, prior: unknown): string[] {
  const before = embedFlags(prior);
  const out: string[] = [];
  for (const [sid, on] of embedFlags(next)) {
    if (on && before.get(sid) !== true) out.push(sid);
  }
  return out;
}

/** 발행본에 이미 켜진 채 굳어 있는 구획 — 릴리스 프리플라이트가 0건임을 증명해야 한다. */
export function armedEmbedSections(published: unknown): string[] {
  return [...embedFlags(published)].filter(([, on]) => on).map(([sid]) => sid);
}
