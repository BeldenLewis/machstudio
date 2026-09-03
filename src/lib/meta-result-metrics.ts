export const META_RESULT_METRICS = [
  { key: "lead", label: "리드", actionTypes: ["lead", "offsite_conversion.fb_pixel_lead"] },
  { key: "complete_registration", label: "등록 완료", actionTypes: ["complete_registration", "offsite_conversion.fb_pixel_complete_registration"] },
  { key: "purchase", label: "구매", actionTypes: ["purchase", "offsite_conversion.fb_pixel_purchase"] },
  { key: "link_click", label: "링크 클릭", actionTypes: ["link_click"] },
  { key: "landing_page_view", label: "랜딩 페이지 조회", actionTypes: ["landing_page_view"] },
] as const;

export type MetaResultMetric = (typeof META_RESULT_METRICS)[number]["key"];
export const DEFAULT_META_RESULT_METRIC: MetaResultMetric = "lead";

export const AD_DETAIL_METRIC_COLUMNS = [
  { key: "cost", label: "지출 금액" },
  { key: "impressions", label: "노출" },
  { key: "reach", label: "도달" },
  { key: "clicks", label: "클릭(전체)" },
  { key: "ctr", label: "CTR(전체)" },
  { key: "cpm", label: "CPM" },
  { key: "cpc", label: "CPC(전체)" },
  { key: "conversions", label: "결과" },
  { key: "costPerConversion", label: "결과당 비용" },
] as const;

export type AdDetailMetricColumn = (typeof AD_DETAIL_METRIC_COLUMNS)[number]["key"];
export const DEFAULT_AD_DETAIL_COLUMNS: AdDetailMetricColumn[] = AD_DETAIL_METRIC_COLUMNS.map(({ key }) => key);

export function normalizeMetaResultMetric(value: unknown): MetaResultMetric {
  return META_RESULT_METRICS.some((metric) => metric.key === value) ? value as MetaResultMetric : DEFAULT_META_RESULT_METRIC;
}

export function normalizeAdDetailColumns(value: unknown): AdDetailMetricColumn[] {
  if (!Array.isArray(value)) return [...DEFAULT_AD_DETAIL_COLUMNS];
  const allowed = new Set<string>(AD_DETAIL_METRIC_COLUMNS.map(({ key }) => key));
  return Array.from(new Set(value.filter((key): key is AdDetailMetricColumn => typeof key === "string" && allowed.has(key))));
}

export function metaResultValue(actions: Array<{ action_type: string; value: string }> | undefined, metricKey: unknown) {
  const metric = META_RESULT_METRICS.find(({ key }) => key === normalizeMetaResultMetric(metricKey))!;
  // 같은 이벤트의 일반 action과 Pixel 별칭이 함께 내려와도 더하지 않는다.
  for (const actionType of metric.actionTypes) {
    const action = actions?.find((item) => item.action_type === actionType);
    if (action) return Number(action.value || 0);
  }
  return 0;
}
