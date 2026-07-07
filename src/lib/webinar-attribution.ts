// 웨비나 등록의 UTM 어트리뷰션 봉투(_utm) 파서.
// 키는 CollectRecord/collect 라우트와 동일한 flat camelCase — Phase 2 에서 collect-script 의
// utmCore 를 attribution-core 로 추출해 공용화할 때 양쪽 페이로드가 같은 모양이 되도록 한다.
//
// 봉투 예시 (로더/폼 위젯이 register POST body 에 _utm 으로 동봉):
// { utmSource, utmMedium, utmCampaign, utmTerm, utmContent, utmId,
//   firstUtmSource, ..., firstUtmId, firstReferrer, firstSeenAt,
//   journey: [{ utmSource, utmMedium, utmCampaign, seenAt }...], referrer }

const MAX_TEXT_LENGTH = 500;
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
      utmSource: cleanText(item.utmSource) ?? "",
      utmMedium: cleanText(item.utmMedium) ?? "",
      utmCampaign: cleanText(item.utmCampaign) ?? "",
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
    utmSource: cleanText(o.utmSource),
    utmMedium: cleanText(o.utmMedium),
    utmCampaign: cleanText(o.utmCampaign),
    utmTerm: cleanText(o.utmTerm),
    utmContent: cleanText(o.utmContent),
    utmId: cleanText(o.utmId),
    firstUtmSource: cleanText(o.firstUtmSource),
    firstUtmMedium: cleanText(o.firstUtmMedium),
    firstUtmCampaign: cleanText(o.firstUtmCampaign),
    firstUtmTerm: cleanText(o.firstUtmTerm),
    firstUtmContent: cleanText(o.firstUtmContent),
    firstUtmId: cleanText(o.firstUtmId),
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
