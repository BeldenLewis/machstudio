// Rate limiter — Upstash Redis(있으면) / 메모리(없으면) 폴백
// 환경변수: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN

interface Bucket { hits: number[] }
const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5000;

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useRedis = !!(REDIS_URL && REDIS_TOKEN);

function evictIfNeeded() {
  if (buckets.size <= MAX_KEYS) return;
  const cutoff = Date.now() - 10 * 60_000;
  for (const [k, b] of buckets) {
    if (b.hits.length === 0 || b.hits[b.hits.length - 1] < cutoff) buckets.delete(k);
  }
}

function memoryRateLimit(key: string, opts: { limit: number; windowMs: number }) {
  const now = Date.now();
  const cutoff = now - opts.windowMs;
  let b = buckets.get(key);
  if (!b) { b = { hits: [] }; buckets.set(key, b); evictIfNeeded(); }
  while (b.hits.length > 0 && b.hits[0] < cutoff) b.hits.shift();
  if (b.hits.length >= opts.limit) {
    const retryAfterMs = b.hits[0] + opts.windowMs - now;
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, retryAfterMs) };
  }
  b.hits.push(now);
  return { allowed: true, remaining: opts.limit - b.hits.length, retryAfterMs: 0 };
}

// 동기 메모리 인터페이스 (기존 호출 호환)
export function rateLimit(key: string, opts: { limit: number; windowMs: number }) {
  return memoryRateLimit(key, opts);
}

// 기록 없이 현재 차단 여부만 확인 (메모리 전용).
// "실패했을 때만 기록"하는 카운터(예: verify 미스)를 조회 전에 선차단할 때 사용.
export function rateLimitPeek(key: string, opts: { limit: number; windowMs: number }): { blocked: boolean } {
  const b = buckets.get(key);
  if (!b) return { blocked: false };
  const cutoff = Date.now() - opts.windowMs;
  let recent = 0;
  for (let i = b.hits.length - 1; i >= 0 && b.hits[i] >= cutoff; i--) recent++;
  return { blocked: recent >= opts.limit };
}

// Redis 비동기 인터페이스 — 새 코드에서 사용 권장
export async function rateLimitAsync(
  key: string,
  opts: { limit: number; windowMs: number },
): Promise<{ allowed: boolean; remaining: number; retryAfterMs: number }> {
  if (!useRedis) return memoryRateLimit(key, opts);
  try {
    const now = Date.now();
    const windowKey = `rl:${key}:${Math.floor(now / opts.windowMs)}`;
    // INCR + EXPIRE pipeline (single round-trip)
    const res = await fetch(`${REDIS_URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", windowKey],
        ["PEXPIRE", windowKey, opts.windowMs],
      ]),
    });
    const data = await res.json();
    const count = Number(data?.[0]?.result ?? 0);
    if (count > opts.limit) {
      return { allowed: false, remaining: 0, retryAfterMs: opts.windowMs };
    }
    return { allowed: true, remaining: opts.limit - count, retryAfterMs: 0 };
  } catch {
    // Redis 실패 → 메모리 폴백
    return memoryRateLimit(key, opts);
  }
}

// 기록 없이 현재 차단 여부만 확인 (Redis 비동기) — rateLimitAsync 와 동일한 윈도 키를 GET 으로 조회.
// peek→검사→record(rateLimitAsync) 패턴(verify 미스·chat 3/10초)이 서버리스에서도 인스턴스 간 일관되게 동작.
export async function rateLimitPeekAsync(
  key: string,
  opts: { limit: number; windowMs: number },
): Promise<{ blocked: boolean }> {
  if (!useRedis) return rateLimitPeek(key, opts);
  try {
    const windowKey = `rl:${key}:${Math.floor(Date.now() / opts.windowMs)}`;
    const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(windowKey)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const data = await res.json();
    const count = Number(data?.result ?? 0);
    return { blocked: count >= opts.limit };
  } catch {
    return rateLimitPeek(key, opts);
  }
}
