// 웨비나 등록의 UTM 어트리뷰션 봉투(_utm) 파서.
// 키는 CollectRecord/collect 라우트와 동일한 flat camelCase — Phase 2 에서 collect-script 의
// utmCore 를 attribution-core 로 추출해 공용화할 때 양쪽 페이로드가 같은 모양이 되도록 한다.
//
// 봉투 예시 (로더/폼 위젯이 register POST body 에 _utm 으로 동봉):
// { utmSource, utmMedium, utmCampaign, utmTerm, utmContent, utmId,
//   firstUtmSource, ..., firstUtmId, firstReferrer, firstSeenAt,
//   journey: [{ utmSource, utmMedium, utmCampaign, seenAt }...], referrer }

import { normalizeUtmKey, normalizeUtmText, UTM_MAX_LENGTH } from "./attribution-normalize";

const MAX_TEXT_LENGTH = UTM_MAX_LENGTH;
const JOURNEY_MAX = 20;

export interface UtmJourneyTouchpoint {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  seenAt: string;
}

export interface UtmEnvelope {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  utmId: string | null;
  firstUtmSource: string | null;
  firstUtmMedium: string | null;
  firstUtmCampaign: string | null;
  firstUtmTerm: string | null;
  firstUtmContent: string | null;
  firstUtmId: string | null;
  firstReferrer: string | null;
  firstSeenAt: Date | null;
  journey: UtmJourneyTouchpoint[] | null;
  referrer: string | null;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().slice(0, MAX_TEXT_LENGTH);
  return text || null;
}

/**
 * source/medium 은 **집계 키**다 — 서버에서 정규화를 강제한다.
 *
 * 예전엔 trim 만 했다. 임베드 로더는 이미 소문자로 보내지만 자체 라이브 페이지 봉투는 URL 원문을
 * 그대로 보냈고, 방문(seen)은 항상 소문자로 쌓였다. 그래서 utm_source=Naver 광고 하나가 분석 표에
 * naver(방문+임베드 등록) / Naver(자체 페이지 등록, 방문 0) 두 줄로 갈라져 양쪽 등록률이 다 틀렸다.
 * 클라이언트를 믿지 않고 여기서 접는다 — 어느 경로로 들어와도 같은 키가 된다.
 */
function cleanKey(value: unknown): string | null {
  const normalized = normalizeUtmKey(value);
  return normalized || null;
}

/** campaign/term/content/id — 원문 대소문자를 보존한다(사람이 읽고 광고 리포트와 대조하는 값). */
function cleanLabel(value: unknown): string | null {
  const normalized = normalizeUtmText(value);
  return normalized || null;
}

function cleanDate(value: unknown): Date | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sanitizeJourney(value: unknown): UtmJourneyTouchpoint[] | null {
  if (!Array.isArray(value)) return null;
  const cleaned = value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item))
    .map((item) => ({
      // 여정도 같은 정규화를 거친다 — 나중에 여정으로 채널을 집계할 때 표와 어긋나지 않게.
      utmSource: normalizeUtmKey(item.utmSource),
      utmMedium: normalizeUtmKey(item.utmMedium),
      utmCampaign: normalizeUtmText(item.utmCampaign),
      seenAt: cleanText(item.seenAt) ?? "",
    }))
    .slice(-JOURNEY_MAX);
  return cleaned.length ? cleaned : null;
}

/** _utm 봉투를 파싱한다. 어트리뷰션 정보가 전혀 없으면 null. */
export function parseUtmEnvelope(raw: unknown): UtmEnvelope | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  const envelope: UtmEnvelope = {
    utmSource: cleanKey(o.utmSource),
    utmMedium: cleanKey(o.utmMedium),
    utmCampaign: cleanLabel(o.utmCampaign),
    utmTerm: cleanLabel(o.utmTerm),
    utmContent: cleanLabel(o.utmContent),
    utmId: cleanLabel(o.utmId),
    firstUtmSource: cleanKey(o.firstUtmSource),
    firstUtmMedium: cleanKey(o.firstUtmMedium),
    firstUtmCampaign: cleanLabel(o.firstUtmCampaign),
    firstUtmTerm: cleanLabel(o.firstUtmTerm),
    firstUtmContent: cleanLabel(o.firstUtmContent),
    firstUtmId: cleanLabel(o.firstUtmId),
    firstReferrer: cleanText(o.firstReferrer),
    firstSeenAt: cleanDate(o.firstSeenAt),
    journey: sanitizeJourney(o.journey),
    referrer: cleanText(o.referrer),
  };

  const hasAny =
    envelope.journey !== null ||
    envelope.firstSeenAt !== null ||
    Object.entries(envelope).some(([key, value]) => key !== "journey" && key !== "firstSeenAt" && value !== null);

  return hasAny ? envelope : null;
}
