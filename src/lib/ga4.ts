/**
 * GA4 Data API 조회 — 사전등록 폼엔 자체 방문 추적이 없어서(collect-script.ts는 제출만 잡음),
 * 이미 설치된 GA4/GTM에서 방문자 수를 직접 끌어온다. 서비스 계정 인증, 크리덴셜/조회 실패는
 * 항상 null 로 흡수한다 — GA4 미설정 프로젝트에서도 대시보드 나머지는 정상 동작해야 하기 때문.
 */
import { BetaAnalyticsDataClient } from "@google-analytics/data";

const KST_OFFSET = 9 * 60 * 60_000;

let cachedClient: BetaAnalyticsDataClient | null | undefined;

function getClient(): BetaAnalyticsDataClient | null {
  if (cachedClient !== undefined) return cachedClient;

  const raw = process.env.GA4_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    cachedClient = null;
    return cachedClient;
  }
  try {
    const credentials = JSON.parse(raw);
    cachedClient = new BetaAnalyticsDataClient({ credentials });
  } catch (error) {
    console.error("[ga4] GA4_SERVICE_ACCOUNT_KEY 파싱 실패", error);
    cachedClient = null;
  }
  return cachedClient;
}

/** GA4 API는 YYYY-MM-DD (속성 기준 타임존)를 기대함 — 이 앱의 다른 곳과 동일하게 KST 달력일로 맞춘다. */
function toGa4Date(date: Date) {
  const kst = new Date(date.getTime() + KST_OFFSET);
  return kst.toISOString().slice(0, 10);
}

export async function getGa4ActiveUsers(options: {
  propertyId: string;
  pagePathPrefix?: string | null;
  from: Date;
  to: Date;
}): Promise<number | null> {
  const client = getClient();
  if (!client) return null;

  try {
    const [response] = await client.runReport({
      property: `properties/${options.propertyId}`,
      dateRanges: [{ startDate: toGa4Date(options.from), endDate: toGa4Date(options.to) }],
      metrics: [{ name: "activeUsers" }],
      ...(options.pagePathPrefix
        ? {
            dimensionFilter: {
              filter: {
                fieldName: "pagePath",
                stringFilter: { matchType: "BEGINS_WITH", value: options.pagePathPrefix },
              },
            },
          }
        : {}),
    });
    const value = response.rows?.[0]?.metricValues?.[0]?.value;
    return value !== undefined ? Number(value) || 0 : 0;
  } catch (error) {
    console.error("[ga4] runReport 실패", options.propertyId, error);
    return null;
  }
}

/**
 * 요약 카드의 미니 추이선(Sparkline)용 — 홈페이지/사전등록 페이지 방문자를 날짜별로 쪼개서 받는다.
 * GA4는 그 날 방문이 0이면 행 자체를 안 주므로, 빈 날짜를 채우는 건 호출부(날짜 범위를 아는 쪽) 몫이다.
 * date는 GA4 표준 형식 그대로("YYYYMMDD", 8자리, 하이픈 없음) 돌려준다.
 */
export async function getGa4ActiveUsersByDay(options: {
  propertyId: string;
  pagePathPrefix?: string | null;
  from: Date;
  to: Date;
}): Promise<Array<{ date: string; count: number }> | null> {
  const client = getClient();
  if (!client) return null;

  try {
    const [response] = await client.runReport({
      property: `properties/${options.propertyId}`,
      dateRanges: [{ startDate: toGa4Date(options.from), endDate: toGa4Date(options.to) }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "activeUsers" }],
      ...(options.pagePathPrefix
        ? {
            dimensionFilter: {
              filter: {
                fieldName: "pagePath",
                stringFilter: { matchType: "BEGINS_WITH", value: options.pagePathPrefix },
              },
            },
          }
        : {}),
    });
    return (response.rows ?? []).map((row) => ({
      date: row.dimensionValues?.[0]?.value ?? "",
      count: Number(row.metricValues?.[0]?.value) || 0,
    }));
  } catch (error) {
    console.error("[ga4] runReport(일별) 실패", options.propertyId, error);
    return null;
  }
}
