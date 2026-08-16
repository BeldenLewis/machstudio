/**
 * 완료 페이지 이동 — URL 템플릿 채우기와 **이동 직전 안전 검사**(설계 §8).
 *
 * ── 왜 이동 직전에 또 검사하나 ────────────────────────────────────────
 * 저장 시점 검사는 이미 있다(빌더형은 `safeHttpUrl`). 그런데 이 값은 **인증된 운영자가
 * 넣은 문자열이 방문자 브라우저에서 실행되는 자리**로 흘러간다 — `javascript:` 스킴이면
 * 파트너 오리진에서 임의 JS 가 돌고, `//evil.example` 이면 오픈 리다이렉트다.
 * 저장 경로는 여러 개고(연동형은 검사 없이 저장된 값이 이미 DB 에 있다) 앞으로 더 생긴다.
 * **쓰는 자리에서 한 번 더 보는 것**이 유일하게 확실한 지점이다.
 *
 * 연동형의 옛 값 호환: `/thank-you` 같은 **상대경로가 실제로 저장돼 있다.** 절대 URL 만
 * 허용하면 살아 있는 소스의 이동이 조용히 끊기므로, 같은 오리진 상대경로는 통과시킨다.
 * (`//` 로 시작하는 것은 상대경로가 아니라 프로토콜 상대 URL 이다 — 다른 호스트로 간다.)
 */

/** 템플릿에 채울 값. 없는 것은 빈 문자열로 치환된다. */
export interface RedirectVars {
  /** 참관객 유형(분기 기준 항목의 값) */
  type?: string;
  /** 등록번호 — §8 은 URL 에 넣지 **않기를** 권한다(기록·리퍼러에 남는다) */
  regNo?: string;
  /** 제출 식별자 — 전환 중복 병합용(Meta eventID / GA4 transaction_id) */
  rid?: string;
  lang?: string;
}

const PLACEHOLDERS = ["type", "regNo", "rid", "lang"] as const;

/**
 * `{type}` `{regNo}` `{rid}` `{lang}` 를 채운다.
 *
 * **값은 인코딩한다.** 유형 라벨은 운영자가 자유롭게 적는 문자열이라 `&`·공백·한글이
 * 얼마든지 들어온다. 그대로 이어 붙이면 쿼리스트링이 깨져 완료 페이지가 파라미터를
 * 잘못 읽고, 전환 조건이 조용히 안 맞는다.
 */
export function fillRedirectTemplate(template: string, vars: RedirectVars): string {
  let out = template;
  for (const key of PLACEHOLDERS) {
    const value = vars[key];
    out = out.split(`{${key}}`).join(encodeURIComponent(value ?? ""));
  }
  return out;
}

/**
 * 이동해도 되는 주소인가. 아니면 null — 호출부는 **이동하지 않는다**(오류로 만들지 않는다.
 * 등록은 이미 성공했고, 이동에 실패했다고 그 사실을 뒤집을 수는 없다).
 */
export function safeRedirectTarget(url: string): string | null {
  const raw = url.trim();
  if (!raw) return null;

  // 프로토콜 상대(`//evil.example`)는 상대경로처럼 생겼지만 다른 호스트로 간다.
  if (raw.startsWith("//")) return null;
  // 같은 오리진 상대경로 — 연동형에 실제로 저장돼 있는 모양이다.
  if (raw.startsWith("/")) return raw;

  // 나머지는 스킴을 직접 본다. `javascript:`·`data:`·`vbscript:` 를 막는 것이 요점이다.
  if (!/^https?:\/\//i.test(raw)) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? raw : null;
  } catch {
    return null;
  }
}

/** 템플릿을 채우고 안전 검사까지 한 번에. 이동할 수 없으면 null. */
export function resolveRedirect(template: string, vars: RedirectVars): string | null {
  const filled = fillRedirectTemplate(template, vars);
  return safeRedirectTarget(filled);
}
