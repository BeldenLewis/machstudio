import { createAdminClient } from "@/lib/supabase/admin";

export const EXPO_QUARANTINE_BUCKET = "expo-quarantine";
export const EXPO_QUARANTINE_MIME_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/svg+xml", "video/mp4",
] as const;
export const EXPO_QUARANTINE_BUCKET_OPTIONS = {
  public: false,
  fileSizeLimit: 50 * 1024 * 1024,
  allowedMimeTypes: [...EXPO_QUARANTINE_MIME_TYPES],
} as const;

type Env = Record<string, string | undefined>;
type StorageAdmin = {
  storage: {
    getBucket(id: string): Promise<{ data: unknown; error: { message?: string } | null }>;
    createBucket(id: string, options: { public: boolean; fileSizeLimit: number; allowedMimeTypes: string[] }): Promise<{ data: unknown; error: { message?: string } | null }>;
    updateBucket(id: string, options: { public: boolean; fileSizeLimit: number; allowedMimeTypes: string[] }): Promise<{ data: unknown; error: { message?: string } | null }>;
  };
};

function required(env: Env, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Expo Storage 승인 설정이 없어요 (${name})`);
  return value;
}

function changeRecordMatches(env: Env, projectRef: string, dbHost: string): boolean {
  const raw = env.EXPO_APPROVED_SUPABASE_CHANGE_RECORD;
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed.supabaseProjectRef === projectRef && parsed.dbHost === dbHost && typeof parsed.signedAt === "string";
  } catch {
    return false;
  }
}

/** URL, 별도 승인 ref, canonical direct-DB ref를 네트워크·admin 생성 전에 교차 확인한다. */
export function verifyExpoStorageTarget(env: Env = process.env): { supabaseUrl: string; projectRef: string } {
  const rawUrl = required(env, "NEXT_PUBLIC_SUPABASE_URL");
  const approvedRef = required(env, "EXPO_APPROVED_SUPABASE_PROJECT_REF");
  const approvedDbHost = required(env, "EXPO_APPROVED_DB_HOST").toLowerCase();
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Expo Storage URL 형식이 올바르지 않아요");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Expo Storage URL 형식이 올바르지 않아요");
  }
  const match = /^([a-z0-9-]+)\.supabase\.co$/.exec(url.hostname.toLowerCase());
  if (!match || match[1] !== approvedRef) throw new Error("Expo Storage 승인 대상이 일치하지 않아요");
  const dbMatch = /^db\.([a-z0-9-]+)\.supabase\.co$/.exec(approvedDbHost);
  if (dbMatch) {
    if (dbMatch[1] !== approvedRef) throw new Error("Expo DB 승인 대상이 Storage와 일치하지 않아요");
  } else if (!changeRecordMatches(env, approvedRef, approvedDbHost)) {
    throw new Error("비정규 DB 호스트에는 서명된 독립 승인 기록이 필요해요");
  }
  return { supabaseUrl: url.origin, projectRef: approvedRef };
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? value as Record<string, unknown> : {};

function bucketSettingsMatch(value: unknown): boolean {
  const bucket = asRecord(value);
  const fileSize = Number(bucket.file_size_limit ?? bucket.fileSizeLimit);
  const allowed = bucket.allowed_mime_types ?? bucket.allowedMimeTypes;
  const actual = Array.isArray(allowed) ? allowed.filter((item): item is string => typeof item === "string").sort() : [];
  const expected = [...EXPO_QUARANTINE_MIME_TYPES].sort();
  return bucket.public === false
    && fileSize === EXPO_QUARANTINE_BUCKET_OPTIONS.fileSizeLimit
    && actual.length === expected.length
    && actual.every((item, index) => item === expected[index]);
}

/** 전용 private bucket을 만들거나 수리한 뒤 다시 읽어 exact settings가 아니면 실패한다. */
export async function ensureExpoQuarantineBucket({
  env = process.env,
  createAdmin = createAdminClient as unknown as () => StorageAdmin,
}: {
  env?: Env;
  createAdmin?: () => StorageAdmin;
} = {}): Promise<StorageAdmin> {
  verifyExpoStorageTarget(env);
  const admin = createAdmin();
  const first = await admin.storage.getBucket(EXPO_QUARANTINE_BUCKET);
  if (first.error) {
    const created = await admin.storage.createBucket(EXPO_QUARANTINE_BUCKET, {
      public: EXPO_QUARANTINE_BUCKET_OPTIONS.public,
      fileSizeLimit: EXPO_QUARANTINE_BUCKET_OPTIONS.fileSizeLimit,
      allowedMimeTypes: [...EXPO_QUARANTINE_BUCKET_OPTIONS.allowedMimeTypes],
    });
    if (created.error && !/already exists/i.test(created.error.message ?? "")) {
      throw new Error("Expo 격리 버킷을 만들 수 없어요");
    }
  }
  const updated = await admin.storage.updateBucket(EXPO_QUARANTINE_BUCKET, {
    public: EXPO_QUARANTINE_BUCKET_OPTIONS.public,
    fileSizeLimit: EXPO_QUARANTINE_BUCKET_OPTIONS.fileSizeLimit,
    allowedMimeTypes: [...EXPO_QUARANTINE_BUCKET_OPTIONS.allowedMimeTypes],
  });
  if (updated.error) throw new Error("Expo 격리 버킷 설정을 맞출 수 없어요");
  const verified = await admin.storage.getBucket(EXPO_QUARANTINE_BUCKET);
  if (verified.error || !bucketSettingsMatch(verified.data)) {
    throw new Error("Expo 격리 버킷 설정 검증에 실패했어요");
  }
  return admin;
}
