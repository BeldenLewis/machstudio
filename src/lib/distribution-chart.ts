export type DistributionChartKind = "split" | "donut" | "ranked";

/**
 * 범주 수만으로 원형 차트를 고르지 않는다. 3~5개이면서 가장 큰 값과 작은 값의 차이가
 * 눈에 띌 때만 전체 구성비를 빠르게 읽는 도넛을 쓰고, 비슷한 값의 정밀 비교는 공통
 * 기준선이 있는 순위형 차트에 맡긴다.
 */
export function chooseDistributionChart(
  items: ReadonlyArray<{ count: number }>,
): DistributionChartKind {
  if (items.length <= 2) return "split";
  if (items.length > 5) return "ranked";

  const positive = items.map((item) => item.count).filter((count) => count > 0);
  if (positive.length < 2) return "ranked";
  const largest = Math.max(...positive);
  const smallest = Math.min(...positive);
  return largest / smallest >= 1.35 ? "donut" : "ranked";
}
