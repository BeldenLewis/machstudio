/**
 * 스키마가 실제로 적용됐는지 **카탈로그로 확인**한다.
 *
 * ── 왜 Prisma 델리게이트로 안 하나 ────────────────────────────────────
 * `prisma.expoSite.count()` 로 확인하려면 이미 그 델리게이트를 부르는 것이고, 테이블이
 * 없으면 던진다. "준비됐는지 모르는 상태" 에서 부르면 안 되는 그 델리게이트를 확인하려고
 * 부르는 셈이라 순서가 뒤집힌다. 그래서 `pg_catalog` 만 본다.
 *
 * ── 왜 캐시하나 ───────────────────────────────────────────────────────
 * 이 조회는 **모든 홈페이지 요청의 첫 줄**이다. 매번 두드리면 커넥션 풀을 먹는다 —
 * 이 저장소는 그것으로 라이브 장애를 겪었다(2026-08-11). 짧게 캐시하되,
 * **실패는 캐시하지 않는다**: 굳히면 스키마를 적용한 뒤에도 한동안 닫힌 채로 남는다.
 */
import { prisma } from "@/lib/prisma";
import { EXPO_SCHEMA_CAPABILITY_VERSION } from "@/lib/expo/capability";

const EXPECTED_TABLES = ["ExpoSite", "ExpoPage", "ExpoTemplate"] as const;

/** 성공 판정만 이 시간 동안 재사용한다. */
const TTL_MS = 30_000;

let cached: { at: number; ready: boolean; version: string } | null = null;

/**
 * 세 테이블이 있고 RLS 가 켜져 있는가.
 *
 * RLS 까지 보는 이유: 테이블만 만들고 RLS 를 빠뜨리면 Data API 로 노출될 수 있다.
 * 마이그레이션이 통째로 적용됐는지를 한 번에 확인하려면 그 표식이 필요하다.
 */
export async function probeExpoSchema(): Promise<boolean> {
  const now = Date.now();
  if (cached && cached.version === EXPO_SCHEMA_CAPABILITY_VERSION && now - cached.at < TTL_MS) {
    return cached.ready;
  }

  // 던지면 호출부(getExpoCapabilities)가 닫힘으로 답한다 — 여기서 삼키지 않는다.
  const rows = await prisma.$queryRaw<Array<{ relname: string; relrowsecurity: boolean }>>`
    SELECT c.relname, c.relrowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND c.relname IN ('ExpoSite', 'ExpoPage', 'ExpoTemplate')
  `;

  const found = new Map(rows.map((r) => [r.relname, r.relrowsecurity]));
  const ready = EXPECTED_TABLES.every((t) => found.get(t) === true);

  // 성공/실패 판정 모두 캐시하되, **예외는 캐시하지 않는다**(여기 오지 못하므로 자연히 그렇다).
  cached = { at: now, ready, version: EXPO_SCHEMA_CAPABILITY_VERSION };
  return ready;
}

/** 테스트·배포 검증에서 캐시를 비운다. */
export function resetExpoSchemaProbeCache(): void {
  cached = null;
}
