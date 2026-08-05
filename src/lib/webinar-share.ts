/**
 * 시청자 추천 링크(입소문 추적) — **누가 공유했고, 그 공유가 누구를 데려왔나.**
 *
 * 왜 생겼나: 공유 버튼이 세 곳(대기 "초대 공유" · 시청 "공유" · 종료 "링크 복사")에 있는데
 * 셋 다 `window.location.href` 를 그대로 복사했다. 추적 파라미터도, 기록도 없어서
 * "몇 명이 공유했나" 도 "그 공유로 몇 명이 등록했나" 도 답할 수 없었다.
 *
 * ## registrationId 를 링크에 넣으면 안 된다 (별도 코드를 쓰는 이유)
 * registrationId 는 사실상 **베어러 자격증명**이다 — 공개 라우트가 그 값만으로 채팅·Q&A 를
 * 그 사람 이름으로 쓰고(`POST /qa`, `POST /chat` 의 body.registrationId), 설문 완료 목록도
 * 내려준다. 공유 링크에 넣으면 링크를 받은 사람이 공유자를 사칭할 수 있다.
 * 그래서 추측 불가한 별도 코드를 발급해 링크에는 그것만 싣는다. 코드가 새어도 얻는 정보는
 * "이 방문이 어떤 공유에서 왔다" 뿐이고, 누가 공유했는지는 DB 를 봐야 알 수 있다.
 *
 * ## 서버·클라이언트 공용
 * 뷰어(브라우저)와 라우트(서버)가 같은 규칙을 써야 코드가 갈라지지 않으므로 node:crypto 대신
 * Web Crypto(globalThis.crypto)만 쓴다.
 */

/** 공유 링크의 쿼리 키. `?ref=<code>` */
export const SHARE_QUERY_KEY = "ref";

/**
 * 코드 길이 10 · 알파벳 56자 → 약 58비트. 추측 공격의 대상이 아니라(값을 맞혀도 방문 1건이
 * 잘못 귀속되는 것뿐) 충돌만 피하면 충분하다.
 */
export const SHARE_CODE_LENGTH = 10;

/** 사람이 링크를 손으로 옮겨 적을 수 있어 혼동 문자(0/O, 1/l/I)를 뺀 알파벳. */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** 어느 화면의 공유 버튼이었나 — 어느 순간에 입소문이 도는지 보려면 구분이 필요하다. */
export const SHARE_SURFACES = ["waiting", "live", "ended", "landing"] as const;
export type ShareSurface = (typeof SHARE_SURFACES)[number];

/** 어떻게 나갔나 — OS 공유 시트(native)와 링크 복사(copy)는 도달률이 크게 다르다. */
export const SHARE_CHANNELS = ["native", "copy"] as const;
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

export const SHARE_SURFACE_LABEL: Record<ShareSurface, string> = {
  waiting: "대기 화면",
  live: "시청 화면",
  ended: "종료 화면",
  landing: "랜딩 페이지",
};

export function isShareSurface(value: unknown): value is ShareSurface {
  return typeof value === "string" && (SHARE_SURFACES as readonly string[]).includes(value);
}

export function isShareChannel(value: unknown): value is ShareChannel {
  return typeof value === "string" && (SHARE_CHANNELS as readonly string[]).includes(value);
}

/** 새 추천 코드. 편향 없이 뽑기 위해 알파벳 길이의 배수를 넘는 바이트는 버린다. */
export function generateShareCode(length: number = SHARE_CODE_LENGTH): string {
  const max = Math.floor(256 / ALPHABET.length) * ALPHABET.length; // 256 % 56 = 32 → 224 이상은 버림
  let out = "";
  while (out.length < length) {
    const bytes = new Uint8Array(length * 2);
    globalThis.crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (out.length >= length) break;
      if (b >= max) continue;
      out += ALPHABET[b % ALPHABET.length];
    }
  }
  return out;
}

/**
 * 들어온 코드를 검증한다 — 알파벳·길이가 정확히 맞아야 한다.
 * 느슨하게 받으면 방문 집계 테이블이 남이 만든 임의 문자열로 오염된다.
 */
export function normalizeShareCode(value: unknown): string {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (raw.length !== SHARE_CODE_LENGTH) return "";
  for (const ch of raw) if (!ALPHABET.includes(ch)) return "";
  return raw;
}

/** URL 쿼리에서 추천 코드를 읽는다(`?ref=`). 값이 이상하면 빈 문자열. */
export function readShareCode(search: string): string {
  try {
    return normalizeShareCode(new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get(SHARE_QUERY_KEY));
  } catch {
    return "";
  }
}

/**
 * 공유용 URL — 현재 URL 에 `?ref=` 를 얹는다.
 *
 * 이미 붙어 있는 ref(내가 남의 추천 링크로 들어온 경우)는 **내 코드로 바꾼다** — 그러지 않으면
 * 내가 공유한 링크의 성과가 나를 초대한 사람에게 계속 귀속된다.
 * `?preview` 같은 운영용 파라미터는 공유 링크에 남기지 않는다(시청자에게 새는 걸 막는다).
 */
export function buildShareUrl(currentUrl: string, code: string): string {
  const clean = normalizeShareCode(code);
  try {
    const url = new URL(currentUrl);
    for (const key of ["preview", "view"]) url.searchParams.delete(key);
    if (clean) url.searchParams.set(SHARE_QUERY_KEY, clean);
    else url.searchParams.delete(SHARE_QUERY_KEY);
    return url.toString();
  } catch {
    return currentUrl;
  }
}
