/**
 * Read-only release audit for Expo public embed surfaces.
 *
 * Run only after verify-expo-db-target.mjs and immediately before the separate
 * EXPO_PUBLIC_EMBED_RELEASE=on deployment approval.
 */

import { pathToFileURL } from "node:url";

const EXPECT_ARGUMENT = "--expect-page-ids=";
const EMPTY_SET_SENTINEL = "none";
const SID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PUBLIC_EMBED_QUERY = `
SELECT
  page."id" AS "pageId",
  page."siteId" AS "siteId",
  page."title" AS "title",
  page."liveAt" AS "liveAt",
  (
    jsonb_typeof(page."published") = 'object'
    AND jsonb_typeof(page."published"->'sections') = 'array'
  ) AS "publishedShapeValid",
  ARRAY(
    SELECT COALESCE(section->>'sid', '(missing sid)')
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(page."published"->'sections') = 'array'
            THEN page."published"->'sections'
          ELSE '[]'::jsonb
        END
      ) WITH ORDINALITY AS entry(section, position)
     WHERE jsonb_typeof(section) = 'object'
       AND section->'embedEnabled' = 'true'::jsonb
     ORDER BY position
  ) AS "embedEnabledSids",
  ARRAY(
    SELECT position::int
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(page."published"->'sections') = 'array'
            THEN page."published"->'sections'
          ELSE '[]'::jsonb
        END
      ) WITH ORDINALITY AS entry(section, position)
     WHERE jsonb_typeof(section) <> 'object'
        OR (
          jsonb_typeof(section) = 'object'
          AND section ? 'embedEnabled'
          AND jsonb_typeof(section->'embedEnabled') IS DISTINCT FROM 'boolean'
        )
        OR (
          jsonb_typeof(section) = 'object'
          AND section->'embedEnabled' = 'true'::jsonb
          AND (
            jsonb_typeof(section->'sid') IS DISTINCT FROM 'string'
            OR section->>'sid' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          )
        )
     ORDER BY position
  ) AS "ambiguousSectionPositions",
  ARRAY(
    SELECT section->>'sid'
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(page."published"->'sections') = 'array'
            THEN page."published"->'sections'
          ELSE '[]'::jsonb
        END
      ) WITH ORDINALITY AS entry(section, position)
     WHERE jsonb_typeof(section) = 'object'
       AND jsonb_typeof(section->'sid') = 'string'
     ORDER BY position
  ) AS "allSectionSids"
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
  publicSurface: "liveAt IS NOT NULL OR any published section has embedEnabled=true; enabled is intentionally ignored",
  renderability: "the loader additionally normalizes sections and checks content; the audit conservatively counts every raw embedEnabled=true section so it cannot undercount a renderable standalone surface",
  malformedPublished: "invalid root/sections shape, ambiguous embedEnabled types, invalid public sids, and duplicate sids fail before exact-set comparison",
  fields: ["pageId", "siteId", "title", "liveAt", "embedEnabledSids"],
  query: PUBLIC_EMBED_QUERY,
};

/** Mask quoted text/comments and split only on SQL statement separators. */
function sqlStatements(sql) {
  const statements = [];
  let masked = "";
  let state = "normal";
  let blockDepth = 0;
  let dollarTag = "";

  const push = () => {
    const statement = masked.trim();
    if (statement) statements.push(statement);
    masked = "";
  };

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (state === "line-comment") {
      if (char === "\n") { state = "normal"; masked += "\n"; }
      continue;
    }
    if (state === "block-comment") {
      if (char === "/" && next === "*") { blockDepth += 1; index += 1; }
      else if (char === "*" && next === "/") {
        blockDepth -= 1;
        index += 1;
        if (blockDepth === 0) state = "normal";
      }
      continue;
    }
    if (state === "single-quote") {
      if (char === "'" && next === "'") index += 1;
      else if (char === "'") state = "normal";
      continue;
    }
    if (state === "double-quote") {
      if (char === '"' && next === '"') index += 1;
      else if (char === '"') state = "normal";
      continue;
    }
    if (state === "dollar-quote") {
      if (sql.startsWith(dollarTag, index)) {
        index += dollarTag.length - 1;
        state = "normal";
      }
      continue;
    }

    // A removed comment is whitespace in SQL grammar; preserve that token boundary.
    if (char === "-" && next === "-") { state = "line-comment"; masked += " "; index += 1; continue; }
    if (char === "/" && next === "*") { state = "block-comment"; blockDepth = 1; masked += " "; index += 1; continue; }
    if (char === "'") { state = "single-quote"; masked += " "; continue; }
    if (char === '"') { state = "double-quote"; masked += " "; continue; }
    if (char === "$") {
      const match = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(index));
      if (match) {
        dollarTag = match[0];
        state = "dollar-quote";
        masked += " ";
        index += dollarTag.length - 1;
        continue;
      }
    }
    if (char === ";") {
      if (!masked.trim()) throw new Error("audit SQL has an extra statement terminator");
      push();
      continue;
    }
    masked += char;
  }

  if (state !== "normal" && state !== "line-comment") throw new Error("unterminated SQL quote or comment");
  push();
  return statements;
}

export function assertSingleReadOnlyStatement(sql) {
  const statements = sqlStatements(sql);
  if (statements.length !== 1) throw new Error("audit SQL must contain exactly one statement");
  const statement = statements[0];
  if (!/^SELECT\b/i.test(statement)) throw new Error("audit SQL must be a SELECT");
  if (/\b(?:INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|MERGE|CALL|COPY|DO)\b/i.test(statement)) {
    throw new Error("audit SQL contains a mutating command");
  }
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
  const embedEnabledSids = Array.isArray(row.embedEnabledSids)
    ? row.embedEnabledSids.filter((sid) => typeof sid === "string")
    : [];
  return {
    pageId: String(row.pageId),
    siteId: String(row.siteId),
    title: String(row.title),
    liveAt: row.liveAt === null ? null : new Date(row.liveAt).toISOString(),
    embedEnabledSids,
    publicSurface: row.liveAt !== null || embedEnabledSids.length > 0,
  };
}

function publishedProblem(row) {
  if (row.publishedShapeValid !== true) return "published must be an object with a sections array";
  const ambiguous = Array.isArray(row.ambiguousSectionPositions) ? row.ambiguousSectionPositions : [];
  if (ambiguous.length > 0) return `ambiguous sections at positions ${ambiguous.join(",")}`;
  const publicSids = Array.isArray(row.embedEnabledSids) ? row.embedEnabledSids : [];
  if (publicSids.some((sid) => typeof sid !== "string" || !SID.test(sid))) return "an embedEnabled section has an invalid sid";
  const allSids = Array.isArray(row.allSectionSids) ? row.allSectionSids.filter((sid) => typeof sid === "string") : [];
  if (new Set(allSids).size !== allSids.length) return "published sections contain duplicate sids";
  return null;
}

async function runCli() {
  assertSingleReadOnlyStatement(PUBLIC_EMBED_QUERY);
  if (process.argv.includes("--describe")) {
    console.log(JSON.stringify(DESCRIPTION, null, 2));
    return;
  }

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

  const malformed = rows.flatMap((row) => {
    const problem = publishedProblem(row);
    return problem ? [{ pageId: String(row.pageId), problem }] : [];
  });
  if (malformed.length > 0) {
    console.error("Expo public embed audit failed: malformed or ambiguous published JSON.");
    for (const problem of malformed) console.error(JSON.stringify(problem));
    process.exitCode = 1;
    return;
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

const direct = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (direct) {
  runCli().catch(() => {
    console.error("Expo public embed audit failed before completion.");
    process.exitCode = 1;
  });
}
