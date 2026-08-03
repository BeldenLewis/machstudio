/**
 * UTM 값 정규화·추론 규칙의 **정본**.
 *
 * 왜 이 파일이 생겼나: 같은 규칙이 다섯 곳에 손으로 복제돼 있었고, 나중에 생긴 경로가
 * 규약을 안 따라서 같은 채널이 분석 표에 두 줄로 갈라졌다.
 *   · 임베드 로더(attribution-core) — source/medium 소문자 + trim
 *   · 자체 라이브 페이지 등록 봉투 — trim 도 안 함(대문자 그대로 저장)
 *   · 방문 비콘(seen) — trim + 100자
 *   · 서버 파서(webinar-attribution) — trim + 500자
 *   · 집계(analytics groupKey) — trim
 * 그래서 utm_source=Naver 광고 하나가 경로에 따라 naver / Naver 두 행이 되고, 방문은 한쪽에만
 * 붙어 양쪽 등록률이 모두 틀렸다.
 *
 * 이 모듈은 **런타임 비의존 순수 함수**다(브라우저·서버 양쪽에서 import 한다).
 * 임베드 로더는 JS 문자열을 서빙하므로 import 를 못 한다 — 대신 attribution-core.ts 가
 * 아래 맵을 JSON 으로 박아 문자열을 만든다(그래서 맵은 여기가 단일 소스다).
 */

/** 클릭 ID → source/medium. UTM 이 없을 때 광고 클릭을 유실하지 않도록 파생한다. */
export const CLICK_ID_MAP: Record<string, { source: string; medium: string }> = {
  gclid: { source: "google", medium: "cpc" },
  fbclid: { source: "facebook", medium: "paid_social" },
  msclkid: { source: "bing", medium: "cpc" },
  yclid: { source: "yandex", medium: "cpc" },
  dclid: { source: "doubleclick", medium: "display" },
  li_fat_id: { source: "linkedin", medium: "paid_social" },
};

/** 리퍼러 호스트 → [source, medium]. 매칭 안 되면 호스트명 + referral 로 떨어진다. */
export const REFERRER_MAP: Record<string, [string, string]> = {
  "google.com": ["google", "organic"],
  "naver.com": ["naver", "organic"],
  "daum.net": ["daum", "organic"],
  "bing.com": ["bing", "organic"],
  "yahoo.com": ["yahoo", "organic"],
  "duckduckgo.com": ["duckduckgo", "organic"],
  "facebook.com": ["facebook", "social"],
  "instagram.com": ["instagram", "social"],
  "twitter.com": ["twitter", "social"],
  "x.com": ["twitter", "social"],
  "youtube.com": ["youtube", "social"],
  "linkedin.com": ["linkedin", "social"],
  "kakao.com": ["kakao", "social"],
  "tistory.com": ["tistory", "referral"],
  "brunch.co.kr": ["brunch", "referral"],
};

export const UTM_QUERY_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
] as const;

/**
 * 저장 길이 상한 — **방문·등록이 같은 값을 써야 한다.**
 * 예전엔 방문 100자 / 등록 500자라, 100자를 넘는 utm_campaign 이 두 키로 갈라져
 * 같은 유입이 표에서 분리됐다.
 */
export const UTM_MAX_LENGTH = 500;

/**
 * "어트리뷰션 없음" 을 뜻하는 리터럴들.
 *
 * 임베드 로더의 inferDirect 가 "(direct)"/"(none)" 을 실제로 **저장**했고, 다른 경로는
 * 같은 상황을 null 또는 "" 로 저장했다. 집계는 이 셋을 다른 키로 봤고 표시는 셋 다
 * "직접 유입" 으로 렌더해서, 똑같은 라벨의 행이 두 줄 생기고 방문·등록이 갈라졌다.
 * → 저장·집계 시 전부 빈 문자열로 접는다. 표시 단계에서만 "(direct)" 라벨을 붙인다.
 */
const DIRECT_SENTINELS = new Set(["(direct)", "(none)", "(not set)", "direct", "none"]);

/** 센티널·공백을 빈 값으로 접는다. 표시용 라벨링은 호출부(화면)가 한다. */
export function foldDirectSentinel(value: string): string {
  return DIRECT_SENTINELS.has(value.trim().toLowerCase()) ? "" : value;
}

/**
 * source/medium 정규화 — 소문자 + trim + 센티널 접기 + 길이 컷.
 * 이 두 필드는 **집계 키**라 대소문자 차이가 곧 행 분열이다.
 */
export function normalizeUtmKey(value: unknown): string {
  if (typeof value !== "string") return "";
  return foldDirectSentinel(value.trim().toLowerCase()).slice(0, UTM_MAX_LENGTH);
}

/**
 * campaign/term/content/id 정규화 — trim + 길이 컷만.
 * 대소문자를 죽이지 않는 이유: 광고 플랫폼 리포트의 캠페인명과 사람이 읽는 값이라
 * 원문을 보존한다. 대신 광고비 조인은 대소문자를 무시해서 맞춘다(analytics 라우트).
 */
export function normalizeUtmText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, UTM_MAX_LENGTH);
}

/** 현재 URL 의 utm_* 를 읽는다(대문자·camelCase 키도 관용). 없으면 전부 빈 문자열. */
export function readUtmFromSearch(search: string): Record<string, string> {
  const params = new URLSearchParams(search);
  const pick = (key: string) =>
    params.get(key) ||
    params.get(key.toUpperCase()) ||
    params.get(key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())) ||
    "";
  return {
    utmSource: normalizeUtmKey(pick("utm_source")),
    utmMedium: normalizeUtmKey(pick("utm_medium")),
    utmCampaign: normalizeUtmText(pick("utm_campaign")),
    utmTerm: normalizeUtmText(pick("utm_term")),
    utmContent: normalizeUtmText(pick("utm_content")),
    utmId: normalizeUtmText(pick("utm_id")),
  };
}

/** URL 에 클릭 ID(gclid 등)가 있으면 그 광고 채널을 파생한다. */
export function findClickId(search: string): { id: string; source: string; medium: string } | null {
  const params = new URLSearchParams(search);
  for (const key of Object.keys(CLICK_ID_MAP)) {
    const value = params.get(key);
    if (value) return { id: value, source: CLICK_ID_MAP[key].source, medium: CLICK_ID_MAP[key].medium };
  }
  return null;
}

/**
 * 리퍼러에서 채널을 추론한다. 같은 호스트(내부 이동)면 null.
 * 검색·소셜은 맵으로, 나머지는 호스트명 + referral 로.
 */
export function inferFromReferrer(
  referrer: string,
  currentHost: string,
): { utmSource: string; utmMedium: string } | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (url.hostname === currentHost) return null;
    for (const key of Object.keys(REFERRER_MAP)) {
      if (host === key || host.endsWith(`.${key}`)) {
        return { utmSource: REFERRER_MAP[key][0], utmMedium: REFERRER_MAP[key][1] };
      }
    }
    return { utmSource: host, utmMedium: "referral" };
  } catch {
    return null;
  }
}

/** 광고비 조인용 키 — 캠페인명 대소문자·공백 차이를 무시해서 맞춘다. */
export function campaignJoinKey(name: string): string {
  return name.trim().toLowerCase();
}
