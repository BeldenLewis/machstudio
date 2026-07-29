export interface StatusRefreshResult {
  data: Record<string, unknown> | null;
  waitingCount: number | null;
}

const STATUS_VALUES = new Set(["upcoming", "registration", "live", "ended"]);

function readStatusData(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (typeof data.status !== "string" || !STATUS_VALUES.has(data.status)) return null;
  if (typeof data.entryOpen !== "boolean") return null;
  return data;
}

/**
 * `/status` 한 번의 결과를 상태 갱신용으로 정리한다.
 *
 * 화면 상태는 필수 status/entryOpen 계약을 모두 지킨 응답에서만 갱신한다. 인원 값은 그
 * 응답 안에서도 number/null 계약을 따로 지킨 경우에만 신뢰한다. 요청·파싱·응답 계약 중
 * 하나라도 실패하면 data/count 모두 null로 돌려 화면을 보존하고 이전 사회적 증거는 숨긴다.
 */
export async function readStatusRefresh(
  request: () => Promise<Response>,
): Promise<StatusRefreshResult> {
  try {
    const response = await request();
    if (!response.ok) return { data: null, waitingCount: null };
    const value: unknown = await response.json();
    const data = readStatusData(value);
    const waitingCount =
      data && (typeof data.waitingCount === "number" || data.waitingCount === null)
        ? data.waitingCount
        : null;
    return { data, waitingCount };
  } catch {
    return { data: null, waitingCount: null };
  }
}
