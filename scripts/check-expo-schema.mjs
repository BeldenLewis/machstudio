/** `--describe` exits before loading Prisma or its PostgreSQL adapter. */
const V1_TABLES = ["ExpoSite", "ExpoPage", "ExpoTemplate"];
const REVISION_TABLE = "ExpoPageRevision";
const TABLES = [...V1_TABLES, REVISION_TABLE];
const V1_INDEXES = [
  "ExpoSite_previewToken_key",
  "ExpoSite_projectId_idx",
  "ExpoSite_workspaceId_idx",
  "ExpoPage_siteId_slug_key",
  "ExpoPage_siteId_sortOrder_idx",
  "ExpoTemplate_workspaceId_createdAt_idx",
];
const REVISION_INDEXES = ["ExpoPageRevision_pageId_sequence_key", "ExpoPageRevision_pageId_createdAt_idx"];
const V1_FKS = [
  "ExpoSite_workspaceId_fkey",
  "ExpoSite_projectId_fkey",
  "ExpoSite_collectSourceId_fkey",
  "ExpoPage_siteId_fkey",
  "ExpoPage_parentId_fkey",
  "ExpoTemplate_workspaceId_fkey",
];
const REVISION_FKS = ["ExpoPageRevision_pageId_fkey"];
const DATA_API_ROLES = ["anon", "authenticated", "service_role"];
const PARTIAL_UNIQUE_BASELINE = 10;

const description = {
  modes: {
    absent: { absentTables: TABLES },
    v1: { requiredTables: V1_TABLES, absentTables: [REVISION_TABLE] },
    ready: { requiredTables: TABLES },
  },
  tables: TABLES,
  indexes: [...V1_INDEXES, ...REVISION_INDEXES],
  foreignKeys: [...V1_FKS, ...REVISION_FKS],
  partialUniqueBaseline: PARTIAL_UNIQUE_BASELINE,
};

if (process.argv.includes("--describe")) {
  console.log(JSON.stringify(description));
  process.exit(0);
}

const expectMode = (process.argv.find((arg) => arg.startsWith("--expect=")) ?? "").split("=")[1];
if (expectMode !== "ready" && expectMode !== "v1" && expectMode !== "absent") {
  console.error("사용법: node scripts/check-expo-schema.mjs --expect=absent|v1|ready");
  process.exit(2);
}

const requiredTables = expectMode === "ready" ? TABLES : V1_TABLES;
const absentTables = expectMode === "absent" ? TABLES : expectMode === "v1" ? [REVISION_TABLE] : [];
const requiredIndexes = expectMode === "ready" ? [...V1_INDEXES, ...REVISION_INDEXES] : V1_INDEXES;
const requiredFks = expectMode === "ready" ? [...V1_FKS, ...REVISION_FKS] : V1_FKS;

const { PrismaClient, Prisma } = await import("../src/generated/prisma/index.js");
const { PrismaPg } = await import("@prisma/adapter-pg");
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
  const found = new Map(tables.map((row) => [row.relname, row.relrowsecurity]));

  for (const table of absentTables) if (found.has(table)) problems.push(`${table} 가 있으면 안 됩니다.`);
  for (const table of requiredTables) {
    if (!found.has(table)) problems.push(`${table} 가 없습니다.`);
    else if (found.get(table) !== true) problems.push(`${table} 에 RLS 가 꺼져 있습니다.`);
  }
  notes.push(`Expo 테이블: ${found.size}/${TABLES.length}`);

  if (expectMode !== "absent") {
    const expectedColumns = new Map(requiredTables.map((table) => {
      const model = Prisma.dmmf.datamodel.models.find((entry) => entry.name === table);
      return [table, new Set((model?.fields ?? []).filter((field) => field.kind !== "object").map((field) => field.name))];
    }));
    const columns = await prisma.$queryRawUnsafe(`
      SELECT c.relname AS "table", a.attname AS "column"
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1)`, requiredTables);
    const haveColumns = new Map(requiredTables.map((table) => [table, new Set()]));
    for (const row of columns) haveColumns.get(row.table)?.add(row.column);

    for (const table of requiredTables) {
      if (!found.has(table)) continue;
      const want = expectedColumns.get(table);
      const have = haveColumns.get(table);
      if (!want || want.size === 0) { problems.push(`${table} 를 schema.prisma 에서 찾지 못했습니다.`); continue; }
      for (const column of want) if (!have.has(column)) problems.push(`${table}.${column} 컬럼이 없습니다.`);
      for (const column of have) if (!want.has(column)) problems.push(`${table}.${column} 는 schema.prisma 에 없는 컬럼입니다.`);
      notes.push(`${table} 컬럼: ${have.size}/${want.size}`);
    }

    const indexes = await prisma.$queryRawUnsafe(`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'i' AND c.relname = ANY($1)`, requiredIndexes);
    const haveIndexes = new Set(indexes.map((row) => row.relname));
    for (const index of requiredIndexes) if (!haveIndexes.has(index)) problems.push(`인덱스 ${index} 가 없습니다.`);
    notes.push(`인덱스: ${haveIndexes.size}/${requiredIndexes.length}`);

    const fks = await prisma.$queryRawUnsafe(`
      SELECT conname FROM pg_constraint WHERE contype = 'f' AND conname = ANY($1)`, requiredFks);
    const haveFks = new Set(fks.map((row) => row.conname));
    for (const fk of requiredFks) if (!haveFks.has(fk)) problems.push(`외래키 ${fk} 가 없습니다.`);
    notes.push(`외래키: ${haveFks.size}/${requiredFks.length}`);

    const policies = await prisma.$queryRawUnsafe(`
      SELECT tablename, policyname FROM pg_policies
       WHERE schemaname = 'public' AND tablename = ANY($1)`, requiredTables);
    for (const policy of policies) problems.push(`정책이 있습니다: ${policy.tablename}.${policy.policyname}`);
    notes.push(`정책: ${policies.length}개 (0이어야 함)`);

    const grants = await prisma.$queryRawUnsafe(`
      SELECT grantee, table_name, privilege_type
        FROM information_schema.role_table_grants
       WHERE table_schema = 'public' AND table_name = ANY($1) AND grantee = ANY($2)`,
    requiredTables, [...DATA_API_ROLES, "PUBLIC"]);
    for (const grant of grants) problems.push(`${grant.grantee} 에게 ${grant.table_name} 권한이 남아 있습니다: ${grant.privilege_type}`);
    notes.push(`Data API 롤 권한: ${grants.length}건 (0이어야 함)`);
  }

  const partial = await prisma.$queryRawUnsafe(`
    SELECT count(*)::int AS n FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND i.indisunique AND i.indpred IS NOT NULL`);
  const count = partial[0].n;
  notes.push(`부분 유니크 인덱스: ${count} (기준선 ${PARTIAL_UNIQUE_BASELINE})`);
  if (count !== PARTIAL_UNIQUE_BASELINE) problems.push(`부분 유니크 인덱스가 ${count}개입니다(기준선 ${PARTIAL_UNIQUE_BASELINE}).`);
} finally {
  await prisma.$disconnect();
}

for (const note of notes) console.log("·", note);
if (problems.length > 0) {
  console.error(`\n홈페이지 스키마 검사 실패 (--expect=${expectMode}):`);
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}
console.log(`\n홈페이지 스키마 검사 통과 (--expect=${expectMode})`);
