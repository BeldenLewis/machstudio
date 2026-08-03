/**
 * 자체 호스팅 면(랜딩 단독 페이지 · 라이브 페이지)의 어트리뷰션 클라이언트.
 *
 * 임베드 로더는 attribution-core(JS 문자열)를 쓰지만 자체 면은 React 라 그걸 못 쓴다.
 * 예전엔 라이브 페이지가 자기만의 봉투 빌더를 갖고 있었고, 그 빌더는
 *   · source/medium 정규화를 안 해서 utm_source=Naver 가 별도 행으로 갈라졌고
 *   · 클릭ID(gclid)·리퍼러 추론이 없어 네이버 검색 유입이 (direct) 로 기록됐고
 *   · 방문 비콘이 없어 그 채널이 분석 표에서 분모 0(등록률 0%) 이 됐다.
 * 규칙을 attribution-normalize 한 곳에서 가져와 두 면이 같이 쓴다.
 *
 * 임베드 로더와의 차이(의도적): 자체 면은 로더의 localStorage 이력(first-touch·journey)에
 * 접근하지 않는다. 대신 로더가 남긴 값이 **있으면** 읽어 first-touch 를 살린다 —
 * 같은 브라우저가 파트너 사이트를 먼저 거쳤다면 그 최초 유입이 정본이다.
 */

import {
  findClickId,
  inferFromReferrer,
  normalizeUtmKey,
  normalizeUtmText,
  readUtmFromSearch,
} from "./attribution-normalize";

/** 로더(attribution-core)가 쓰는 localStorage 키 — 값을 읽기만 한다(쓰지 않는다). */
const UTM_FIRST_KEY = "mach_utm_first";
const JOURNEY_KEY = "mach_utm_journey";

type StoredUtm = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  utmId?: string;
  referrer?: string;
  seenAt?: string;
};

/** 로더가 남긴 값 읽기 — TTL 봉투({v,_exp})와 구형 평문 둘 다 관용. 실패하면 null. */
function readStored(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "_exp" in parsed) {
      const exp = (parsed as { _exp?: number })._exp;
      return typeof exp === "number" && exp > Date.now() ? (parsed as { v?: unknown }).v ?? null : null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * 지금 이 방문의 채널을 판정한다 — URL utm → 클릭ID → 리퍼러 순. 전부 없으면 빈 값(=직접 유입).
 * 리터럴 "(direct)" 를 저장하지 않는 이유는 attribution-normalize 의 센티널 주석에 있다.
 */
export function resolveCurrentChannel(): {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmTerm: string;
  utmContent: string;
  utmId: string;
} {
  const fromUrl = readUtmFromSearch(window.location.search);
  const click = findClickId(window.location.search);
  if (click) {
    // 클릭ID 는 UTM 이 비어 있을 때만 채운다 — 명시된 UTM 이 항상 이긴다.
    if (!fromUrl.utmSource) fromUrl.utmSource = normalizeUtmKey(click.source);
    if (!fromUrl.utmMedium) fromUrl.utmMedium = normalizeUtmKey(click.medium);
    if (!fromUrl.utmId) fromUrl.utmId = normalizeUtmText(click.id);
  }
  if (!fromUrl.utmSource && !fromUrl.utmMedium) {
    const ref = inferFromReferrer(document.referrer || "", window.location.hostname);
    if (ref) {
      fromUrl.utmSource = normalizeUtmKey(ref.utmSource);
      fromUrl.utmMedium = normalizeUtmKey(ref.utmMedium);
    }
  }
  return {
    utmSource: fromUrl.utmSource,
    utmMedium: fromUrl.utmMedium,
    utmCampaign: fromUrl.utmCampaign,
    utmTerm: fromUrl.utmTerm,
    utmContent: fromUrl.utmContent,
    utmId: fromUrl.utmId,
  };
}

/**
 * 등록 POST 에 실을 _utm 봉투. 서버 parseUtmEnvelope 와 같은 flat 키 계약.
 * 어트리뷰션 정보가 전혀 없으면 null(서버도 "정보 전무" 를 null 로 취급).
 */
export function buildUtmEnvelope(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  try {
    const current = resolveCurrentChannel();
    const referrer = document.referrer || null;

    // 로더가 남긴 first-touch 가 있으면 그것이 정본이다(파트너 사이트를 먼저 거친 방문자).
    const storedFirst = readStored(UTM_FIRST_KEY) as StoredUtm | null;
    const storedJourney = readStored(JOURNEY_KEY);

    const hasAny =
      Object.values(current).some(Boolean) || Boolean(referrer) || Boolean(storedFirst);
    if (!hasAny) return null;

    const first = storedFirst
      ? {
          firstUtmSource: normalizeUtmKey(storedFirst.utmSource),
          firstUtmMedium: normalizeUtmKey(storedFirst.utmMedium),
          firstUtmCampaign: normalizeUtmText(storedFirst.utmCampaign),
          firstUtmTerm: normalizeUtmText(storedFirst.utmTerm),
          firstUtmContent: normalizeUtmText(storedFirst.utmContent),
          firstUtmId: normalizeUtmText(storedFirst.utmId),
          firstReferrer: storedFirst.referrer || null,
          firstSeenAt: storedFirst.seenAt || new Date().toISOString(),
        }
      : {
          // 이력이 없으면 이번 방문이 곧 최초 유입이다.
          firstUtmSource: current.utmSource,
          firstUtmMedium: current.utmMedium,
          firstUtmCampaign: current.utmCampaign,
          firstUtmTerm: current.utmTerm,
          firstUtmContent: current.utmContent,
          firstUtmId: current.utmId,
          firstReferrer: referrer,
          firstSeenAt: new Date().toISOString(),
        };

    return {
      ...current,
      ...first,
      journey: Array.isArray(storedJourney) ? storedJourney : null,
      referrer,
    };
  } catch {
    return null;
  }
}

/**
 * 방문 1회를 기록한다 — **세션당 1회**. 임베드 seen 비콘의 자체 면 대응물.
 * 미리보기(?preview)에서는 부작용을 만들지 않는다(공개 페이지 규약).
 */
export function sendVisitBeacon(slug: string): void {
  if (typeof window === "undefined") return;
  try {
    if (new URLSearchParams(window.location.search).has("preview")) return;
    const key = `mach_visit_${slug}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // 스토리지가 막힌 브라우저에서는 중복 집계를 감수하고 보낸다 — 0 보다 낫다.
    }
    const channel = resolveCurrentChannel();
    const payload = JSON.stringify({ utmSource: channel.utmSource, utmMedium: channel.utmMedium });
    const url = `/api/webinar/${encodeURIComponent(slug)}/visit`;
    // 순수 문자열 = simple request. sendBeacon 은 preflight 를 못 하므로 JSON Blob 을 쓰지 않는다.
    if (navigator.sendBeacon) navigator.sendBeacon(url, payload);
    else void fetch(url, { method: "POST", body: payload, keepalive: true });
  } catch {
    /* 어트리뷰션 실패가 페이지를 깨뜨리지 않는다 */
  }
}
