/**
 * 홈페이지 스키마의 **적용 전·후 확인**.
 *
 *   node scripts/check-expo-schema.mjs --expect=absent   # 적용 전 (깨끗한가)
 *   node scripts/check-expo-schema.mjs --expect=ready    # 적용 후 (전부 들어갔나)
 *
 * `DATABASE_URL` 을 쓴다(`node --env-file=.env.local`). 세션 URL 이든 풀러든 읽기만 한다.
 *
 * ── 왜 테이블 존재만 보지 않나 ────────────────────────────────────────
 * 마이그레이션은 테이블·인덱스·외래키·RLS·권한 회수까지 한 트랜잭션이다. 테이블만
 * 확인하면 **어중간하게 적용된 상태를 준비됨으로 오판**한다. 특히 RLS 를 빠뜨리면
 * Supabase Data API 로 초안이 그대로 노출된다 — 그게 이 검사가 있는 이유다.
 *
 * ── 부분 유니크 인덱스 10개를 함께 센다 ───────────────────────────────
 * 이 저장소에는 스키마로 표현할 수 없는 부분 유니크 인덱스가 10개 있고, `prisma db push`
 * 가 그것들을 **지운다**. 스키마 작업 전후로 이 숫자가 그대로인지 보는 것이 그 사고의
 * 유일한 조기 경보다.
 */
import { PrismaClient } from "../src/generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";

const TABLES = ["ExpoSite", "ExpoPage", "ExpoTemplate"];
const INDEXES = [
  "ExpoSite_previewToken_key",
  "ExpoSite_projectId_idx",
  "ExpoSite_workspaceId_idx",
  "ExpoPage_siteId_slug_key",
  "ExpoPage_siteId_sortOrder_idx",
  "ExpoTemplate_workspaceId_createdAt_idx",
];
const FKS = [
  "ExpoSite_workspaceId_fkey",
  "ExpoSite_projectId_fkey",
  "ExpoSite_collectSourceId_fkey",
  "ExpoPage_siteId_fkey",
  "ExpoPage_parentId_fkey",
  "ExpoTemplate_workspaceId_fkey",
];
/** Data API 롤. 이 테이블에는 권한이 하나도 없어야 한다. */
const DATA_API_ROLES = ["anon", "authenticated", "service_role"];
/** 스키마로 표현할 수 없어 db push 가 지우는 인덱스들 — 이 숫자가 기준선이다. */
const PARTIAL_UNIQUE_BASELINE = 10;

const expect = (process.argv.find((a) => a.startsWith("--expect=")) ?? "").split("=")[1];
if (expect !== "ready" && expect !== "absent") {
  console.error("사용법: node scripts/check-expo-schema.mjs --expect=ready|absent");
  process.exit(2);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }),
});

const problems = [];
const notes = [];

try {
  const tables = await prisma.$queryRawUnsafe(`
    SELECT c.relname, c.relrowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1)`, TABLES);
  const found = new Map(tables.map((r) => [r.relname, r.relrowsecurity]));

  if (expect === "absent") {
    for (const t of TABLES) {
      if (found.has(t)) problems.push(`${t} 가 이미 있습니다 — 적용 전 상태가 아닙니다.`);
    }
    notes.push(`Expo 테이블: ${found.size}/3`);
  } else {
    for (const t of TABLES) {
      if (!found.has(t)) problems.push(`${t} 가 없습니다.`);
      // 정책 없이 RLS 만 켠 상태가 의도다. RLS 가 꺼져 있으면 Data API 로 새어 나간다.
      else if (found.get(t) !== true) problems.push(`${t} 에 RLS 가 꺼져 있습니다.`);
    }
    notes.push(`Expo 테이블: ${found.size}/3 (RLS 전부 켜짐: ${[...found.values()].every(Boolean)})`);

    const indexes = await prisma.$queryRawUnsafe(`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'i' AND c.relname = ANY($1)`, INDEXES);
    const haveIndexes = new Set(indexes.map((r) => r.relname));
    for (const i of INDEXES) if (!haveIndexes.has(i)) problems.push(`인덱스 ${i} 가 없습니다.`);
    notes.push(`인덱스: ${haveIndexes.size}/${INDEXES.length}`);

    const fks = await prisma.$queryRawUnsafe(`
      SELECT conname FROM pg_constraint WHERE contype = 'f' AND conname = ANY($1)`, FKS);
    const haveFks = new Set(fks.map((r) => r.conname));
    for (const f of FKS) if (!haveFks.has(f)) problems.push(`외래키 ${f} 가 없습니다.`);
    notes.push(`외래키: ${haveFks.size}/${FKS.length}`);

    /**
     * 정책이 있으면 의도와 다르다. 이 테이블들은 서버 라우트(Prisma)만 접근하므로
     * 정책이 하나도 없어야 하고, 있으면 누가 Data API 경로를 열어 둔 것이다.
     */
    const policies = await prisma.$queryRawUnsafe(`
      SELECT tablename, policyname FROM pg_policies
       WHERE schemaname = 'public' AND tablename = ANY($1)`, TABLES);
    for (const p of policies) problems.push(`정책이 있습니다: ${p.tablename}.${p.policyname}`);
    notes.push(`정책: ${policies.length}개 (0이어야 함)`);

    const grants = await prisma.$queryRawUnsafe(`
      SELECT grantee, table_name, privilege_type
        FROM information_schema.role_table_grants
       WHERE table_schema = 'public' AND table_name = ANY($1) AND grantee = ANY($2)`,
      TABLES, [...DATA_API_ROLES, "PUBLIC"]);
    for (const g of grants) {
      problems.push(`${g.grantee} 에게 ${g.table_name} 권한이 남아 있습니다: ${g.privilege_type}`);
    }
    notes.push(`Data API 롤 권한: ${grants.length}건 (0이어야 함)`);
  }

  const partial = await prisma.$queryRawUnsafe(`
    SELECT count(*)::int AS n FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND i.indisunique AND i.indpred IS NOT NULL`);
  const count = partial[0].n;
  notes.push(`부분 유니크 인덱스: ${count} (기준선 ${PARTIAL_UNIQUE_BASELINE})`);
  if (count !== PARTIAL_UNIQUE_BASELINE) {
    problems.push(
      `부분 유니크 인덱스가 ${count}개입니다(기준선 ${PARTIAL_UNIQUE_BASELINE}). `
      + `db push 가 지웠을 수 있습니다 — scripts/ensure-partial-unique-indexes.mjs 를 확인하세요.`,
    );
  }
} finally {
  await prisma.$disconnect();
}

for (const note of notes) console.log("·", note);
if (problems.length > 0) {
  console.error(`\n홈페이지 스키마 검사 실패 (--expect=${expect}):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`\n홈페이지 스키마 검사 통과 (--expect=${expect})`);
