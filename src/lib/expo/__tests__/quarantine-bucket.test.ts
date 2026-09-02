import { describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  ensureExpoQuarantineBucket,
  EXPO_QUARANTINE_BUCKET,
  EXPO_QUARANTINE_BUCKET_OPTIONS,
  verifyExpoStorageTarget,
} from "@/lib/expo/quarantine-bucket";
import { createMediaUploadSession } from "@/lib/expo/media-upload-session";

const goodEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc123.supabase.co",
  EXPO_APPROVED_SUPABASE_PROJECT_REF: "abc123",
  EXPO_APPROVED_DB_HOST: "db.abc123.supabase.co",
};

describe("Expo quarantine target", () => {
  it("requires the URL ref and canonical DB ref to match the separately approved ref", () => {
    expect(verifyExpoStorageTarget(goodEnv)).toEqual({
      supabaseUrl: "https://abc123.supabase.co",
      projectRef: "abc123",
    });
    expect(() => verifyExpoStorageTarget({ ...goodEnv, NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" })).toThrow();
    expect(() => verifyExpoStorageTarget({ ...goodEnv, EXPO_APPROVED_DB_HOST: "db.other.supabase.co" })).toThrow();
    expect(() => verifyExpoStorageTarget({ ...goodEnv, NEXT_PUBLIC_SUPABASE_URL: "https://abc123.supabase.co.evil.test" })).toThrow();
  });

  it("fails before constructing an admin client", async () => {
    const factory = vi.fn();
    await expect(ensureExpoQuarantineBucket({ env: { ...goodEnv, EXPO_APPROVED_SUPABASE_PROJECT_REF: "other" }, createAdmin: factory }))
      .rejects.toThrow();
    expect(factory).not.toHaveBeenCalled();
  });

  it("--check-target is network-free and never prints URL, password, or service key", () => {
    const serviceKey = "never-print-service-key";
    const loader = `data:text/javascript,${encodeURIComponent(`
      export async function resolve(specifier, context, nextResolve) {
        if (specifier === "@supabase/supabase-js") throw new Error("supabase import attempted");
        return nextResolve(specifier, context);
      }
    `)}`;
    const noFetch = `data:text/javascript,${encodeURIComponent('globalThis.fetch=()=>{throw new Error("network attempted")};')}`;
    const result = spawnSync(process.execPath, [
      "--experimental-loader", loader,
      "--import", noFetch,
      path.join(process.cwd(), "scripts/ensure-expo-quarantine-bucket.mjs"), "--check-target",
    ], {
      cwd: process.cwd(), encoding: "utf8",
      env: { ...process.env, ...goodEnv, SUPABASE_SERVICE_ROLE_KEY: serviceKey },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("abc123");
    expect(result.stdout + result.stderr).not.toContain(goodEnv.NEXT_PUBLIC_SUPABASE_URL);
    expect(result.stdout + result.stderr).not.toContain(serviceKey);
  });
});

describe("Expo quarantine provisioning", () => {
  it("creates a missing private bucket and verifies the exact settings", async () => {
    const getBucket = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: "not found" } })
      .mockResolvedValueOnce({ data: { id: EXPO_QUARANTINE_BUCKET, public: false, file_size_limit: EXPO_QUARANTINE_BUCKET_OPTIONS.fileSizeLimit, allowed_mime_types: [...EXPO_QUARANTINE_BUCKET_OPTIONS.allowedMimeTypes] }, error: null });
    const createBucket = vi.fn().mockResolvedValue({ data: { name: EXPO_QUARANTINE_BUCKET }, error: null });
    const updateBucket = vi.fn().mockResolvedValue({ data: {}, error: null });
    const admin = { storage: { getBucket, createBucket, updateBucket } };

    await expect(ensureExpoQuarantineBucket({ env: goodEnv, createAdmin: () => admin })).resolves.toBe(admin);
    expect(createBucket).toHaveBeenCalledWith(EXPO_QUARANTINE_BUCKET, EXPO_QUARANTINE_BUCKET_OPTIONS);
    expect(updateBucket).toHaveBeenCalledWith(EXPO_QUARANTINE_BUCKET, EXPO_QUARANTINE_BUCKET_OPTIONS);
  });

  it("repairs existing settings idempotently and fails closed when reread differs", async () => {
    const wrong = { id: EXPO_QUARANTINE_BUCKET, public: true, file_size_limit: 1, allowed_mime_types: ["*/*"] };
    const right = { id: EXPO_QUARANTINE_BUCKET, public: false, file_size_limit: EXPO_QUARANTINE_BUCKET_OPTIONS.fileSizeLimit, allowed_mime_types: [...EXPO_QUARANTINE_BUCKET_OPTIONS.allowedMimeTypes] };
    const getBucket = vi.fn().mockResolvedValueOnce({ data: wrong, error: null }).mockResolvedValueOnce({ data: right, error: null });
    const admin = { storage: { getBucket, createBucket: vi.fn(), updateBucket: vi.fn().mockResolvedValue({ data: {}, error: null }) } };
    await ensureExpoQuarantineBucket({ env: goodEnv, createAdmin: () => admin });
    expect(admin.storage.updateBucket).toHaveBeenCalledTimes(1);

    getBucket.mockReset().mockResolvedValue({ data: wrong, error: null });
    await expect(ensureExpoQuarantineBucket({ env: goodEnv, createAdmin: () => admin })).rejects.toThrow(/설정/);
  });
});

describe("one-use session housekeeping", () => {
  it("best-effort removes only this user's quarantine objects older than 24 hours", async () => {
    const list = vi.fn().mockResolvedValue({ data: [
      { id: "old", name: "old.png", created_at: "2026-08-30T00:00:00.000Z" },
      { id: "fresh", name: "fresh.png", created_at: "2026-09-01T11:00:00.000Z" },
    ], error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const createSignedUploadUrl = vi.fn(async (path: string) => ({
      data: { path, token: "one-use", signedUrl: "https://abc123.supabase.co/storage/v1/object/upload/sign/expo-quarantine/x?token=one-use" },
      error: null,
    }));
    const admin = { storage: { from: () => ({ list, remove, createSignedUploadUrl }) } };
    const session = await createMediaUploadSession({
      admin, workspaceId: "ws1", siteId: "site1", userId: "user1",
      fileName: "hero.png", declaredType: "image/png", bytes: 100,
      randomUUID: () => "new", now: new Date("2026-09-01T12:00:00.000Z"),
    });
    expect(remove).toHaveBeenCalledWith(["ws1/expo-quarantine/site1/user1/old.png"]);
    expect(createSignedUploadUrl).toHaveBeenCalledWith("ws1/expo-quarantine/site1/user1/new.png", { upsert: false });
    expect(session.token).toBe("one-use");
  });
});
