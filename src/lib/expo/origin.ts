/**
 * 쓰기 요청의 **출처 가드** — 인증보다 먼저, 본문을 읽기도 전에 돈다.
 *
 * ── 왜 필요한가 ───────────────────────────────────────────────────────
 * 어드민 라우트는 쿠키 세션으로 인증한다. 쿠키는 브라우저가 **자동으로** 붙이므로,
 * 다른 사이트에 심어 둔 폼이나 스크립트가 로그인한 운영자의 브라우저를 시켜 우리 API 를
 * 부르면 그 요청도 인증을 통과한다. 홈페이지 API 는 발행·공개 스위치를 다루므로,
 * 그런 요청 하나가 **전시 홈페이지를 밖으로 내보낼 수 있다.**
 *
 * 이 저장소의 다른 어드민 라우트에는 아직 이 가드가 없다(실측). 새로 만드는 면에서는
 * 처음부터 걸어 두고, 기존 라우트로 넓히는 것은 별건으로 남긴다 — 한 번에 다 바꾸면
 * 무엇이 깨졌는지 알 수 없다.
 *
 * ── 두 겹 ─────────────────────────────────────────────────────────────
 * ① `Sec-Fetch-Site` — 브라우저가 붙이고 스크립트가 위조할 수 없다. 가장 믿을 만하다.
 * ② `Origin` — 위 헤더가 없는 오래된 브라우저·프록시 대비.
 * 그리고 본문은 `application/json` 만 받는다. 폼 전송(`text/plain`·`multipart`)은
 * 프리플라이트 없이 교차 출처로 날아올 수 있는 형식이라 애초에 거절한다.
 */

export type OriginGuardFailure = "cross-site" | "bad-media-type";

export interface OriginGuardResult {
  ok: boolean;
  failure?: OriginGuardFailure;
}

const JSON_TYPES = ["application/json"];

/**
 * 이 요청이 우리 화면에서 온 것인가.
 *
 * `allowedOrigins` 에는 우리 오리진들을 넣는다(빈 배열이면 Origin 비교를 건너뛰고
 * Sec-Fetch-Site 만 본다 — 오리진을 모르는 환경에서 전부 막아 버리지 않기 위해서다).
 */
export function guardWriteOrigin(
  request: { headers: { get(name: string): string | null } },
  allowedOrigins: readonly string[] = [],
): OriginGuardResult {
  // ① 브라우저가 붙이는 값 — 스크립트가 못 바꾼다.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    // "none" 은 주소창 직접 입력·북마크다. 쓰기에서는 드물지만 교차 출처는 아니다.
    return { ok: false, failure: "cross-site" };
  }

  // ② 헤더가 없는 환경 대비.
  const origin = request.headers.get("origin");
  if (!site && origin && allowedOrigins.length > 0) {
    const normalized = origin.replace(/\/+$/, "");
    if (!allowedOrigins.some((a) => a.replace(/\/+$/, "") === normalized)) {
      return { ok: false, failure: "cross-site" };
    }
  }

  // 본문 형식 — 폼 전송 형식은 프리플라이트 없이 교차 출처로 날아온다.
  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!JSON_TYPES.includes(contentType)) return { ok: false, failure: "bad-media-type" };

  return { ok: true };
}

export function originGuardStatus(failure: OriginGuardFailure): number {
  return failure === "bad-media-type" ? 415 : 403;
}

export function originGuardMessage(failure: OriginGuardFailure): string {
  return failure === "bad-media-type"
    ? "이 요청 형식은 받지 않아요"
    : "다른 사이트에서 온 요청은 처리하지 않아요";
}
