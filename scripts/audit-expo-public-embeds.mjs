/**
 * Read-only release audit for Expo public embed surfaces.
 *
 * Run only after verify-expo-db-target.mjs and immediately before the separate
 * EXPO_PUBLIC_EMBED_RELEASE=on deployment approval.
 */

const EXPECT_ARGUMENT = "--expect-page-ids=";
const EMPTY_SET_SENTINEL = "none";

const PUBLIC_EMBED_QUERY = `
SELECT
  page."id" AS "pageId",
  page."siteId" AS "siteId",
  page."title" AS "title",
  page."liveAt" AS "liveAt",
  ARRAY(
    SELECT COALESCE(section->>'sid', '(missing sid)')
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(page."published"->'sections') = 'array'
            THEN page."published"->'sections'
          ELSE '[]'::jsonb
        END
      ) AS section
     WHERE section->>'enabled' = 'true'
       AND section->>'embedEnabled' = 'true'
     ORDER BY COALESCE(section->>'sid', '(missing sid)')
  ) AS "enabledEmbedSids"
  FROM public."ExpoPage" AS page
  INNER JOIN public."ExpoSite" AS site ON site."id" = page."siteId"
 WHERE page."deletedAt" IS NULL
   AND site."deletedAt" IS NULL
   AND page."published" IS NOT NULL
 ORDER BY page."id" ASC
`.trim();

const DESCRIPTION = {
  readOnly: true,
  connection: { defaultTransactionReadOnly: true, statements: 1 },
  allowlist: {
    argument: "--expect-page-ids",
    emptySetSentinel: EMPTY_SET_SENTINEL,
    delimiter: ",",
    exactSet: true,
    trimsIds: true,
    rejectsEmpty: true,
    rejectsDuplicates: true,
    rejectsWhitespaceInsideIds: true,
    sentinelCannotBeMixed: true,
  },
  ownershipScope: "ExpoPage.siteId = ExpoSite.id",
  deletionScope: "ExpoPage.deletedAt IS NULL AND ExpoSite.deletedAt IS NULL",
  publishedScope: "ExpoPage.published IS NOT NULL",
  publicSurface: "liveAt IS NOT NULL OR an enabled published section has embedEnabled=true",
  fields: ["pageId", "siteId", "title", "liveAt", "enabledEmbedSids"],
  query: PUBLIC_EMBED_QUERY,
};

if (process.argv.includes("--describe")) {
  console.log(JSON.stringify(DESCRIPTION, null, 2));
  process.exit(0);
}

function invalidAllowlist(message) {
  console.error(`invalid --expect-page-ids: ${message}`);
  process.exit(2);
}

function parseExpectedPageIds(argv) {
  const values = argv
    .filter((argument) => argument.startsWith(EXPECT_ARGUMENT))
    .map((argument) => argument.slice(EXPECT_ARGUMENT.length));
  const unknown = argv.filter((argument) => !argument.startsWith(EXPECT_ARGUMENT));
  if (values.length !== 1 || unknown.length > 0) {
    invalidAllowlist("provide exactly one --expect-page-ids value.");
  }

  const raw = values[0];
  if (!raw || !raw.trim()) invalidAllowlist(`use literal ${EMPTY_SET_SENTINEL} for an empty set.`);
  const trimmed = raw.trim();
  if (trimmed === EMPTY_SET_SENTINEL) return new Set();

  const ids = raw.split(",").map((id) => id.trim());
  if (ids.some((id) => !id)) invalidAllowlist("empty page ids are not allowed.");
  if (ids.includes(EMPTY_SET_SENTINEL)) invalidAllowlist(`literal ${EMPTY_SET_SENTINEL} cannot be mixed with page ids.`);
  if (ids.some((id) => /\s/.test(id))) invalidAllowlist("page ids cannot contain whitespace.");
  if (new Set(ids).size !== ids.length) invalidAllowlist("duplicate page ids are not allowed.");
  return new Set(ids);
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function displayRow(row) {
  const enabledEmbedSids = Array.isArray(row.enabledEmbedSids)
    ? row.enabledEmbedSids.filter((sid) => typeof sid === "string")
    : [];
  return {
    pageId: String(row.pageId),
    siteId: String(row.siteId),
    title: String(row.title),
    liveAt: row.liveAt === null ? null : new Date(row.liveAt).toISOString(),
    enabledEmbedSids,
    publicSurface: row.liveAt !== null || enabledEmbedSids.length > 0,
  };
}

async function main() {
  const expected = parseExpectedPageIds(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.trim()) {
    console.error("Expo public embed audit failed: DATABASE_URL is required.");
    process.exitCode = 2;
    return;
  }

  // All DB-free argument handling stays above this dynamic import and construction.
  const { Client } = await import("pg");
  const client = new Client({
    connectionString: databaseUrl,
    application_name: "expo-public-embed-read-only-audit",
    options: "-c default_transaction_read_only=on",
  });

  let rows;
  try {
    await client.connect();
    ({ rows } = await client.query(PUBLIC_EMBED_QUERY));
  } catch {
    console.error("Expo public embed audit failed: read-only database query failed.");
    process.exitCode = 1;
    return;
  } finally {
    await client.end().catch(() => undefined);
  }

  const audited = rows.map(displayRow);
  const actual = new Set(audited.filter((row) => row.publicSurface).map((row) => row.pageId));
  const missing = sorted([...expected].filter((pageId) => !actual.has(pageId)));
  const unexpected = sorted([...actual].filter((pageId) => !expected.has(pageId)));

  console.log(`audited published pages: ${audited.length}`);
  for (const row of audited) console.log(JSON.stringify(row));

  if (missing.length > 0 || unexpected.length > 0) {
    console.error("Expo public embed audit failed: exact page-id set mismatch.");
    console.error(`expected public ids: ${JSON.stringify(sorted(expected))}`);
    console.error(`actual public ids: ${JSON.stringify(sorted(actual))}`);
    console.error(`missing approved ids: ${JSON.stringify(missing)}`);
    console.error(`unexpected public ids: ${JSON.stringify(unexpected)}`);
    process.exitCode = 1;
    return;
  }

  const verified = actual.size === 0 ? EMPTY_SET_SENTINEL : sorted(actual).join(",");
  console.log(`exact public page-id set verified: ${verified}`);
}

main().catch(() => {
  console.error("Expo public embed audit failed before completion.");
  process.exitCode = 1;
});
