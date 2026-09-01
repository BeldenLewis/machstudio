/** The URL-only path stays before the dynamic pg import and client construction. */
const URL_ONLY = process.argv.includes("--url-only");
const EXPECTED_PROTOCOL = "postgresql:";
const EXPECTED_PORT = "5432";

function fail(message) {
  console.error(`Expo DB target verification failed: ${message}`);
  process.exit(1);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) fail(`${name} is required.`);
  return value;
}

function decodeUrlPart(value, field) {
  try {
    return decodeURIComponent(value);
  } catch {
    fail(`${field} contains an invalid percent escape.`);
  }
}

function parseAndValidateUrl() {
  const rawUrl = requiredEnv("EXPO_SESSION_DATABASE_URL");
  const approved = {
    host: requiredEnv("EXPO_APPROVED_DB_HOST"),
    database: requiredEnv("EXPO_APPROVED_DB_NAME"),
    user: requiredEnv("EXPO_APPROVED_DB_USER"),
  };

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    fail("session URL is invalid.");
  }

  const actual = {
    protocol: parsed.protocol,
    host: decodeUrlPart(parsed.hostname, "hostname"),
    port: parsed.port,
    database: decodeUrlPart(parsed.pathname.replace(/^\//, ""), "database name"),
    user: decodeUrlPart(parsed.username, "username"),
  };
  const mismatches = [
    ["protocol", actual.protocol, EXPECTED_PROTOCOL],
    ["host", actual.host, approved.host],
    ["port", actual.port, EXPECTED_PORT],
    ["database", actual.database, approved.database],
    ["user", actual.user, approved.user],
  ].filter(([, actualValue, expectedValue]) => actualValue !== expectedValue);
  if (mismatches.length > 0) fail(`approved target mismatch: ${mismatches.map(([field]) => field).join(", ")}.`);

  return { rawUrl, approved, actual };
}

const target = parseAndValidateUrl();
if (URL_ONLY) {
  console.log(`Expo DB URL target verified: host=${target.approved.host} database=${target.approved.database} user=${target.approved.user} port=${EXPECTED_PORT}`);
  process.exit(0);
}

const { Client } = await import("pg");
const client = new Client({ connectionString: target.rawUrl });
try {
  await client.connect();
  const result = await client.query("SELECT current_database(), current_user, inet_server_addr(), inet_server_port()");
  const row = result.rows[0];
  const database = row.current_database;
  const user = row.current_user;
  const port = String(row.inet_server_port);
  if (database !== target.approved.database || user !== target.approved.user || port !== EXPECTED_PORT) {
    fail("connected server does not match the approved database, user, and port.");
  }
  console.log(`Expo DB server target verified: host=${target.approved.host} database=${database} user=${user} serverAddress=${row.inet_server_addr} port=${port}`);
} catch {
  fail("connection or server identity check failed.");
} finally {
  await client.end().catch(() => undefined);
}
