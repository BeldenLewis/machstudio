export interface StatusRefreshResult {
  data: Record<string, unknown> | null;
  waitingCount: number | null;
}

/**
 * `/status` 한 번의 결과를 상태 갱신용으로 정리한다.
 *
 * 인원 값은 성공 응답에서 number/null 계약을 지킨 경우에만 신뢰한다. 요청·파싱·응답 계약 중
 * 하나라도 실패하면 null을 돌려 이전 성공값이 사회적 증거로 남지 않게 한다.
 */
export async function readStatusRefresh(
  request: () => Promise<Response>,
): Promise<StatusRefreshResult> {
  try {
    const response = await request();
    if (!response.ok) return { data: null, waitingCount: null };
    const value: unknown = await response.json();
    const data =
      value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
    const waitingCount =
      data && (typeof data.waitingCount === "number" || data.waitingCount === null)
        ? data.waitingCount
        : null;
    return { data, waitingCount };
  } catch {
    return { data: null, waitingCount: null };
  }
}
