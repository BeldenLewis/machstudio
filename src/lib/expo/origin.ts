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

import { getPublicAppOrigin } from "@/lib/app-url";

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

  /**
   * ③ 본문 형식 — 폼 전송 형식은 프리플라이트 없이 교차 출처로 날아온다.
   *
   * **헤더가 아예 없으면 본문이 없는 쓰기다** — 지우기처럼 URL 만으로 뜻이 완성되는 요청이다.
   * 이걸 막으면 안 된다. 이유:
   *  · `<form>` 은 content-type 을 **생략할 수 없다.** urlencoded·multipart·text/plain 셋 중
   *    하나를 반드시 붙인다(위 셋이 프리플라이트 없이 날아가는 그 형식들이고, 아래에서 걸린다).
   *  · 본문 없는 교차 출처 `fetch` 는 DELETE 가 CORS 안전 목록에 없어 **프리플라이트를 탄다.**
   *    우리는 그 프리플라이트에 응답하지 않는다.
   * 즉 "형식 없음 + 본문 없음" 은 위조할 수 없다. 위조 가능한 것은 전부 형식을 달고 온다.
   *
   * 이걸 JSON 만 허용으로 두었더니 트리의 페이지 삭제가 **항상 415** 였다 —
   * 본문 없는 `fetch(url, { method: "DELETE" })` 에는 브라우저가 content-type 을 안 붙인다.
   * 라우트 테스트가 헤더를 손으로 붙여 보내서 아무도 못 봤다.
   */
  const rawType = request.headers.get("content-type");
  if (rawType !== null) {
    const contentType = rawType.split(";")[0].trim().toLowerCase();
    if (!JSON_TYPES.includes(contentType)) return { ok: false, failure: "bad-media-type" };
  }

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

// ────────────────────────────────────────────────────────────────────────
// 공개 임베드가 쓰는 **절대 주소**
// ────────────────────────────────────────────────────────────────────────

/**
 * 왜 `getPublicAppOrigin()` 만으로 부족한가.
 *
 * 그 함수는 "이 배포가 밖에 내보내도 되는 주소" 를 준다. 홈페이지 임베드는 그보다 한 겹
 * 더 엄격해야 한다 — 여기서 나온 주소는 **파트너 사이트의 HTML 에 박혀서** 우리가 회수할
 * 수 없다. 프리뷰 배포에서 한 번 복사된 주소는 그 배포가 사라진 뒤에도 남아, 전시 홈페이지가
 * 조용히 죽는다. 그래서 운영자가 **명시적으로 선언한 주소**와 정확히 같을 때만 통과시킨다.
 *
 * 실패는 빈 문자열이나 상대경로로 **덮지 않는다.** 이유를 그대로 돌려주고, 호출부가
 * 코드를 만들지 않는다. 잘못된 주소가 박힌 코드는 없는 코드보다 나쁘다.
 */
export type ExpoOriginFailure =
  /** `EXPO_CANONICAL_PUBLIC_ORIGIN` 이 없다. */
  | "not-configured"
  /** https 가 아니거나 자격증명이 붙었다. */
  | "insecure"
  /** 경로·쿼리·해시가 붙었다 — 오리진만 받는다. */
  | "not-origin"
  /** 프로덕션 배포가 아니다. */
  | "not-production"
  /** 이 배포에 자동 부여된 호스트다 — 사라지는 주소다. */
  | "deployment-host"
  /** 이 배포가 밖에 쓰는 주소와 다르다. */
  | "not-canonical";

export type ExpoOriginResult =
  | { ok: true; origin: string }
  | { ok: false; reason: ExpoOriginFailure };

export function expoOriginMessage(reason: ExpoOriginFailure): string {
  switch (reason) {
    case "not-configured": return "공개 주소가 설정되지 않아 코드를 만들 수 없어요";
    case "insecure": return "공개 주소는 https 여야 해요";
    case "not-origin": return "공개 주소에는 경로 없이 도메인만 넣어 주세요";
    case "not-production": return "프로덕션 배포에서만 코드를 만들 수 있어요";
    case "deployment-host": return "이 배포에 임시로 붙은 주소예요. 고정 도메인을 설정해 주세요";
    case "not-canonical": return "공개 주소 설정 두 곳이 서로 달라요";
  }
}

const hostOf = (value: string | undefined): string => {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    return "";
  }
};

/**
 * 임베드에 박아도 되는 주소. **서버에서만** 부른다.
 *
 * 브라우저에서 부르면 `EXPO_CANONICAL_PUBLIC_ORIGIN` 이 없어 조용히 "설정 안 됨" 이
 * 되는데, 그건 사실이 아니라 **부른 자리가 틀린 것**이다. 그래서 던진다.
 */
export function getRequiredExpoPublicOrigin(): ExpoOriginResult {
  if (typeof window !== "undefined") {
    throw new Error("getRequiredExpoPublicOrigin 은 서버에서만 부를 수 있어요");
  }

  const declared = (process.env.EXPO_CANONICAL_PUBLIC_ORIGIN ?? "").trim();
  if (!declared) return { ok: false, reason: "not-configured" };

  let url: URL;
  try {
    url = new URL(declared);
  } catch {
    return { ok: false, reason: "not-origin" };
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    return { ok: false, reason: "insecure" };
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    return { ok: false, reason: "not-origin" };
  }

  // Vercel 위에서 돌 때만 스코프를 볼 수 있다. 프리뷰 배포가 임베드 코드를 만들면
  // 그 배포가 사라진 뒤 파트너 사이트에서 코드가 죽는다.
  if (process.env.VERCEL && process.env.VERCEL_ENV !== "production") {
    return { ok: false, reason: "not-production" };
  }

  // 배포마다 새로 붙는 호스트는 고정 주소가 아니다.
  const host = url.hostname.toLowerCase();
  if (host === hostOf(process.env.VERCEL_URL) || host === hostOf(process.env.VERCEL_BRANCH_URL)) {
    return { ok: false, reason: "deployment-host" };
  }

  // 마지막으로, 이 배포가 다른 면에서 쓰는 주소와 같아야 한다. 두 설정이 갈라지면
  // 홈페이지 코드와 사전등록 코드가 서로 다른 곳을 가리킨다.
  if (getPublicAppOrigin() !== url.origin) return { ok: false, reason: "not-canonical" };

  return { ok: true, origin: url.origin };
}
