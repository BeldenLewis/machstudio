/**
 * 아임웹에 붙일 **코드 조각**을 만든다.
 *
 * ── 왜 서버에서만 만드나 ──────────────────────────────────────────────
 * 여기서 나온 문자열은 **파트너 사이트의 HTML 에 박혀서 우리가 회수할 수 없다.** 그래서
 * 주소는 `getRequiredExpoPublicOrigin()` 이 통과시킨 것만 쓴다(`origin.ts`) — 그 함수는
 * 프리뷰 배포·임시 호스트·설정 불일치를 전부 거절한다. 브라우저에서 만들면 그 검사를
 * 통째로 건너뛰므로, 이 모듈은 조립만 하고 주소는 **받는다.**
 *
 * ── 못 만들면 만들지 않는다 ──────────────────────────────────────────
 * 주소를 못 구하면 빈 문자열이나 상대경로로 덮지 않는다. **잘못된 주소가 박힌 코드는
 * 없는 코드보다 나쁘다** — 붙인 사람은 붙였다고 믿고, 전시 기간에 조용히 빈 자리가 된다.
 * 이유를 그대로 들고 올라가 화면이 말한다.
 */

/** 붙여 넣는 자리를 표시하는 빈 상자의 속성. 런타임이 이걸 찾아 그 안에 그린다. */
export const EXPO_PAGE_MOUNT_ATTR = "data-mach-expo";
export const EXPO_SECTION_MOUNT_ATTR = "data-mach-expo-section";

export interface ExpoSnippet {
  /** 아임웹 코드블럭에 그대로 붙이는 두 줄. */
  code: string;
  /** 이 코드가 부르는 주소 — 화면이 "무엇을 붙이는지" 보여줄 때 쓴다. */
  src: string;
}

const joinOrigin = (origin: string, path: string) => `${origin.replace(/\/+$/, "")}${path}`;

/**
 * 페이지 통짜.
 *
 * `async` 를 쓰는 이유: 아임웹 편집기가 코드블럭을 문서 중간에 넣으므로, 동기 스크립트면
 * 그 지점에서 파싱이 멈춰 페이지 전체가 늦어진다. 마운트 지점은 스크립트가 아니라
 * **빈 상자**가 정하므로 실행 순서에 기대지 않는다.
 */
export function expoPageSnippet(origin: string, pageId: string): ExpoSnippet {
  const src = joinOrigin(origin, `/h/${encodeURIComponent(pageId)}`);
  return {
    src,
    code: `<script async src="${src}"></script>\n<div ${EXPO_PAGE_MOUNT_ATTR}></div>`,
  };
}

/**
 * 구획 하나만 — 부분 이행의 수단이다.
 *
 * 페이지의 공개 스위치와 **무관하게** 동작한다("페이지는 아직인데 히어로만 먼저").
 * 대신 그 구획이 발행본에 있고 따로 내보내기가 켜져 있어야 한다 —
 * 그 판정은 `readiness.ts` 의 `sectionSnippetIssues` 가 한다.
 */
export function expoSectionSnippet(origin: string, pageId: string, sid: string): ExpoSnippet {
  const src = joinOrigin(origin, `/h/${encodeURIComponent(pageId)}/${encodeURIComponent(sid)}`);
  return {
    src,
    code: `<script async src="${src}"></script>\n<div ${EXPO_SECTION_MOUNT_ATTR}></div>`,
  };
}
