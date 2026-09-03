export const AD_DETAIL_METRIC_COLUMNS = [
  { key: "cost", label: "지출 금액" },
  { key: "impressions", label: "노출" },
  { key: "reach", label: "도달" },
  { key: "clicks", label: "링크 클릭" },
  { key: "ctr", label: "링크 CTR" },
  { key: "cpm", label: "CPM" },
  { key: "cpc", label: "링크 CPC" },
  { key: "conversions", label: "결과" },
  { key: "costPerConversion", label: "결과당 비용" },
] as const;

export type AdDetailMetricColumn = (typeof AD_DETAIL_METRIC_COLUMNS)[number]["key"];
export const DEFAULT_AD_DETAIL_COLUMNS: AdDetailMetricColumn[] = AD_DETAIL_METRIC_COLUMNS.map(({ key }) => key);

export function normalizeAdDetailColumns(value: unknown): AdDetailMetricColumn[] {
  if (!Array.isArray(value)) return [...DEFAULT_AD_DETAIL_COLUMNS];
  const allowed = new Set<string>(AD_DETAIL_METRIC_COLUMNS.map(({ key }) => key));
  return Array.from(new Set(value.filter((key): key is AdDetailMetricColumn => typeof key === "string" && allowed.has(key))));
}

type MetaResultRow = {
  action_type?: string;
  indicator?: string;
  name?: string;
  title?: string;
  value?: string | number;
  values?: Array<{ value?: string | number }>;
};

function firstFiniteNumber(values: unknown[]) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/** Meta Ads Manager의 동적 '결과' 열 값을 그대로 읽는다. */
export function metaReportedResult(results: MetaResultRow[] | undefined, objectiveResults?: MetaResultRow[]) {
  const row = results?.[0] ?? objectiveResults?.[0];
  if (!row) return { value: 0, type: "result" };
  return {
    value: firstFiniteNumber([row.value, ...(row.values ?? []).map((item) => item.value)]),
    type: row.indicator || row.action_type || row.name || row.title || "result",
  };
}

/** Meta Ads Manager의 동적 '결과당 비용' 열 값을 그대로 읽는다. */
export function metaReportedCostPerResult(costPerResult: MetaResultRow[] | undefined, fallbackCost: number, resultValue: number) {
  const row = costPerResult?.[0];
  if (row) return firstFiniteNumber([row.value, ...(row.values ?? []).map((item) => item.value)]);
  return resultValue > 0 ? fallbackCost / resultValue : null;
}
