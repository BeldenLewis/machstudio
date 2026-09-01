/**
 * 스키마가 실제로 적용됐는지 **카탈로그로 확인**한다.
 *
 * ── 왜 Prisma 델리게이트로 안 하나 ────────────────────────────────────
 * `prisma.expoSite.count()` 로 확인하려면 이미 그 델리게이트를 부르는 것이고, 테이블이
 * 없으면 던진다. "준비됐는지 모르는 상태" 에서 부르면 안 되는 그 델리게이트를 확인하려고
 * 부르는 셈이라 순서가 뒤집힌다. 그래서 `pg_catalog` 만 본다.
 *
 * ── 왜 캐시하나 ───────────────────────────────────────────────────────
 * 이 조회는 **모든 홈페이지 요청의 첫 줄**이다 — 어드민만이 아니라 공개 임베드 로더
 * (`app/h/[pageId]/loader.ts`)도 지난다. 매번 두드리면 커넥션 풀을 먹는다. 이 저장소는
 * 그것으로 라이브 장애를 겪었다(2026-08-11).
 *
 * **성공도 실패도 같이 캐시한다.** 앞 판의 주석은 "실패는 캐시하지 않는다" 고 했는데
 * 코드는 처음부터 둘 다 캐시했다. 그리고 둘 다 캐시하는 쪽이 맞다 — 실패를 매번 다시
 * 물으면 **스키마가 없는 배포에서 방문자 트래픽이 그대로 DB 로 간다**. 그게 위 장애의
 * 모양이다. 대가는 스키마를 적용한 직후 최대 30초간 닫힌 채로 남는 것이고, 그건 배포
 * 절차 안에서 한 번 기다리면 되는 일이다.
 */
import { prisma } from "@/lib/prisma";
import { EXPO_SCHEMA_CAPABILITY_VERSION } from "@/lib/expo/capability";

const EXPECTED_TABLES = ["ExpoSite", "ExpoPage", "ExpoTemplate", "ExpoPageRevision"] as const;

/** 성공·실패 판정을 이 시간 동안 재사용한다(예외는 캐시되지 않는다 — 아래 참고). */
const TTL_MS = 30_000;

let cached: { at: number; ready: boolean; version: string } | null = null;

/**
 * 네 테이블이 있고 RLS 가 켜져 있는가.
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
       AND c.relname IN ('ExpoSite', 'ExpoPage', 'ExpoTemplate', 'ExpoPageRevision')
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
