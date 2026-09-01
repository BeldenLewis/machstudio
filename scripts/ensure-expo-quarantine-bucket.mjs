const BUCKET = "expo-quarantine";
const OPTIONS = {
  public: false,
  fileSizeLimit: 50 * 1024 * 1024,
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/svg+xml", "video/mp4"],
};

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`승인 설정이 없습니다: ${name}`);
  return value;
}

function verifyTarget() {
  const rawUrl = required("NEXT_PUBLIC_SUPABASE_URL");
  const approvedRef = required("EXPO_APPROVED_SUPABASE_PROJECT_REF");
  const dbHost = required("EXPO_APPROVED_DB_HOST").toLowerCase();
  let url;
  try { url = new URL(rawUrl); } catch { throw new Error("Storage URL 형식이 올바르지 않습니다."); }
  const match = /^([a-z0-9-]+)\.supabase\.co$/.exec(url.hostname.toLowerCase());
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash || !match) {
    throw new Error("Storage URL 형식이 올바르지 않습니다.");
  }
  if (match[1] !== approvedRef) throw new Error("Storage project ref가 승인값과 다릅니다.");
  const dbMatch = /^db\.([a-z0-9-]+)\.supabase\.co$/.exec(dbHost);
  if (dbMatch) {
    if (dbMatch[1] !== approvedRef) throw new Error("DB project ref가 승인값과 다릅니다.");
  } else {
    let record;
    try { record = JSON.parse(required("EXPO_APPROVED_SUPABASE_CHANGE_RECORD")); } catch { throw new Error("서명된 독립 승인 기록이 필요합니다."); }
    if (record.supabaseProjectRef !== approvedRef || record.dbHost !== dbHost || typeof record.signedAt !== "string") {
      throw new Error("서명된 독립 승인 기록이 일치하지 않습니다.");
    }
  }
  return { url: url.origin, projectRef: approvedRef };
}

function settingsMatch(bucket) {
  const actual = [...(bucket?.allowed_mime_types ?? bucket?.allowedMimeTypes ?? [])].sort();
  const expected = [...OPTIONS.allowedMimeTypes].sort();
  return bucket?.public === false
    && Number(bucket?.file_size_limit ?? bucket?.fileSizeLimit) === OPTIONS.fileSizeLimit
    && actual.length === expected.length
    && actual.every((item, index) => item === expected[index]);
}

async function main() {
  const mode = process.argv[2];
  if (!["--check-target", "--check", "--apply"].includes(mode)) {
    throw new Error("사용법: node scripts/ensure-expo-quarantine-bucket.mjs --check-target|--check|--apply");
  }
  const target = verifyTarget();
  if (mode === "--check-target") {
    process.stdout.write(`target ok: ${target.projectRef}\n`);
    return;
  }
  // Target-only validation must not even load the Supabase client module.
  const { createClient } = await import("@supabase/supabase-js");
  const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(target.url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  if (mode === "--apply") {
    const first = await admin.storage.getBucket(BUCKET);
    if (first.error) {
      const created = await admin.storage.createBucket(BUCKET, OPTIONS);
      if (created.error && !/already exists/i.test(created.error.message)) throw new Error("격리 버킷 생성에 실패했습니다.");
    }
    const updated = await admin.storage.updateBucket(BUCKET, OPTIONS);
    if (updated.error) throw new Error("격리 버킷 설정 변경에 실패했습니다.");
  }
  const checked = await admin.storage.getBucket(BUCKET);
  if (checked.error || !settingsMatch(checked.data)) throw new Error("격리 버킷 설정이 승인값과 다릅니다.");
  process.stdout.write(`${mode === "--apply" ? "applied" : "checked"}: ${BUCKET}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "격리 버킷 작업 실패"}\n`);
  process.exitCode = 1;
});
