import { randomUUID } from "node:crypto";
import { processExpoRaster, processExpoSvg } from "@/lib/expo/image-process";
import { EXPO_IMAGE_LIMITS, sniffImageType } from "@/lib/expo/image-guard";
import { EXPO_VIDEO_RULES, inspectMp4 } from "@/lib/expo/video-guard";
import { EXPO_QUARANTINE_BUCKET } from "@/lib/expo/quarantine-bucket";
import { ASSET_BUCKET } from "@/lib/webinar-asset-bucket";

export interface ExpoMediaUploadResult {
  kind: "image" | "video";
  url: string;
  originalUrl: string;
  mimeType: string;
  width?: number;
  height?: number;
  bytes: number;
}

export const EXPO_SESSION_MEDIA_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/svg+xml", "video/mp4",
] as const;

const EXTENSION_BY_TYPE: Record<(typeof EXPO_SESSION_MEDIA_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
};

const asMediaType = (value: string): (typeof EXPO_SESSION_MEDIA_TYPES)[number] | null =>
  (EXPO_SESSION_MEDIA_TYPES as readonly string[]).includes(value)
    ? value as (typeof EXPO_SESSION_MEDIA_TYPES)[number]
    : null;

function sourceLimit(type: string): number {
  return type === "video/mp4" ? EXPO_VIDEO_RULES.sourceBytes : EXPO_IMAGE_LIMITS.sourceBytes;
}

export function normalizeStorageKey(path: string): string {
  if (!path || path.startsWith("/") || path.endsWith("/") || path.includes("\\") || /[\u0000-\u001f\u007f]/.test(path)) {
    throw new Error("Storage 경로가 올바르지 않아요");
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error("Storage 경로가 올바르지 않아요");
  }
  return segments.join("/");
}

export function quarantinePrefix(workspaceId: string, siteId: string, userId: string): string {
  const prefix = normalizeStorageKey(`${workspaceId}/expo-quarantine/${siteId}/${userId}`);
  return `${prefix}/`;
}

export function assertOwnedQuarantinePath(
  path: string,
  workspaceId: string,
  siteId: string,
  userId: string,
): string {
  const normalized = normalizeStorageKey(path);
  const expected = quarantinePrefix(workspaceId, siteId, userId);
  if (!normalized.startsWith(expected) || normalized.slice(expected.length).includes("/")) {
    throw new Error("격리 Storage 경로가 소유 범위와 일치하지 않아요");
  }
  return normalized;
}

export function createQuarantinePath(input: {
  workspaceId: string;
  siteId: string;
  userId: string;
  fileName: string;
  declaredType: string;
  randomUUID?: () => string;
}): string {
  const type = asMediaType(input.declaredType);
  if (!type) throw new Error("지원하지 않는 미디어 형식이에요");
  if (!input.fileName.trim() || input.fileName.length > 255 || /[/\\\u0000-\u001f]/.test(input.fileName)) {
    throw new Error("파일 이름이 올바르지 않아요");
  }
  const id = (input.randomUUID ?? randomUUID)();
  return normalizeStorageKey(`${quarantinePrefix(input.workspaceId, input.siteId, input.userId)}${id}.${EXTENSION_BY_TYPE[type]}`);
}

export function parseMediaSessionInput(value: unknown): { fileName: string; declaredType: string; bytes: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("업로드 정보가 올바르지 않아요");
  const input = value as Record<string, unknown>;
  const fileName = typeof input.fileName === "string" ? input.fileName : "";
  const declaredType = typeof input.declaredType === "string" ? input.declaredType : "";
  const type = asMediaType(declaredType);
  const bytes = typeof input.bytes === "number" ? input.bytes : NaN;
  if (!type) throw new Error("지원하지 않는 미디어 형식이에요");
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > sourceLimit(type)) throw new Error("파일 크기가 올바르지 않아요");
  if (!fileName.trim() || fileName.length > 255 || /[/\\\u0000-\u001f]/.test(fileName)) throw new Error("파일 이름이 올바르지 않아요");
  return { fileName, declaredType: type, bytes };
}

type SessionAdmin = {
  storage: {
    from(bucket: string): {
      createSignedUploadUrl(path: string, options: { upsert: boolean }): Promise<{
        data: { path: string; token: string; signedUrl: string } | null;
        error: { message?: string } | null;
      }>;
      list(path: string, options: Record<string, unknown>): Promise<{
        data: Array<{ name: string; id?: string | null; created_at?: string; createdAt?: string }> | null;
        error: { message?: string } | null;
      }>;
      remove(paths: string[]): Promise<{ error: { message?: string } | null }>;
    };
  };
};

async function cleanupStaleQuarantine(admin: SessionAdmin, prefix: string, now: Date): Promise<void> {
  const folder = prefix.slice(0, -1);
  const bucket = admin.storage.from(EXPO_QUARANTINE_BUCKET);
  const listed = await bucket.list(folder, { limit: 100, sortBy: { column: "created_at", order: "asc" } });
  if (listed.error || !listed.data) return;
  const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
  const stale = listed.data.flatMap((entry) => {
    const created = entry.created_at ?? entry.createdAt;
    const time = created ? Date.parse(created) : Number.NaN;
    return entry.id && Number.isFinite(time) && time < cutoff ? [`${folder}/${entry.name}`] : [];
  });
  if (stale.length > 0) await bucket.remove(stale).catch(() => undefined);
}

export async function createMediaUploadSession(input: {
  admin: SessionAdmin;
  workspaceId: string;
  siteId: string;
  userId: string;
  fileName: string;
  declaredType: string;
  bytes: number;
  randomUUID?: () => string;
  now?: Date;
}): Promise<{ path: string; token: string; signedUrl: string }> {
  const parsed = parseMediaSessionInput(input);
  const path = createQuarantinePath({ ...input, ...parsed });
  const prefix = quarantinePrefix(input.workspaceId, input.siteId, input.userId);
  await cleanupStaleQuarantine(input.admin, prefix, input.now ?? new Date()).catch(() => undefined);
  const signed = await input.admin.storage.from(EXPO_QUARANTINE_BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (signed.error || !signed.data || signed.data.path !== path) throw new Error("일회용 업로드 주소를 만들 수 없어요");
  return { path, token: signed.data.token, signedUrl: signed.data.signedUrl };
}

export interface ExpoFinalizeStorage {
  infoQuarantine(path: string): Promise<{ size: number; contentType: string }>;
  downloadQuarantine(path: string): Promise<Uint8Array>;
  uploadPublic(path: string, bytes: Uint8Array, options: { contentType: string; cacheControl: string; upsert: false }): Promise<{ error: string | null }>;
  publicUrl(path: string): string;
  removeQuarantine(paths: string[]): Promise<{ error: string | null }>;
  removePublic(paths: string[]): Promise<{ error: string | null }>;
}

type FinalizeBucket = {
  info(path: string): Promise<{ data: { size?: number; content_type?: string; contentType?: string } | null; error: { message?: string } | null }>;
  download(path: string): Promise<{ data: Blob | null; error: { message?: string } | null }>;
  upload(path: string, body: Uint8Array, options: Record<string, unknown>): Promise<{ error: { message?: string } | null }>;
  getPublicUrl(path: string): { data: { publicUrl: string } };
  remove(paths: string[]): Promise<{ error: { message?: string } | null }>;
};

type FinalizeAdmin = {
  storage: {
    from(bucket: string): FinalizeBucket;
  };
};

export function createExpoFinalizeStorage(admin: FinalizeAdmin): ExpoFinalizeStorage {
  const quarantine = () => admin.storage.from(EXPO_QUARANTINE_BUCKET);
  const publicBucket = () => admin.storage.from(ASSET_BUCKET);
  return {
    async infoQuarantine(path) {
      const result = await quarantine().info(path);
      const size = Number(result.data?.size);
      const contentType = result.data?.content_type ?? result.data?.contentType ?? "";
      if (result.error || !Number.isSafeInteger(size) || size < 0 || !contentType) throw new Error("격리 파일 정보를 확인할 수 없어요");
      return { size, contentType };
    },
    async downloadQuarantine(path) {
      const result = await quarantine().download(path);
      if (result.error || !result.data) throw new Error("격리 파일을 받을 수 없어요");
      return new Uint8Array(await result.data.arrayBuffer());
    },
    async uploadPublic(path, bytes, options) {
      const result = await publicBucket().upload(path, bytes, options);
      return { error: result.error?.message ?? null };
    },
    publicUrl(path) { return publicBucket().getPublicUrl(path).data.publicUrl; },
    async removeQuarantine(paths) {
      const result = await quarantine().remove(paths);
      return { error: result.error?.message ?? null };
    },
    async removePublic(paths) {
      const result = await publicBucket().remove(paths);
      return { error: result.error?.message ?? null };
    },
  };
}

function expectedExtension(type: string): string {
  const media = asMediaType(type);
  if (!media) throw new Error("지원하지 않는 미디어 형식이에요");
  return EXTENSION_BY_TYPE[media];
}

function assertPathType(path: string, declaredType: string): void {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  if (ext !== expectedExtension(declaredType)) throw new Error("격리 경로와 파일 형식이 일치하지 않아요");
}

export async function finalizeExpoUpload(
  storage: ExpoFinalizeStorage,
  input: {
    workspaceId: string;
    siteId: string;
    userId: string;
    path: string;
    declaredType: string;
    randomUUID?: () => string;
  },
): Promise<ExpoMediaUploadResult> {
  const path = assertOwnedQuarantinePath(input.path, input.workspaceId, input.siteId, input.userId);
  const created: string[] = [];
  const uuid = input.randomUUID ?? randomUUID;
  const sitePrefix = normalizeStorageKey(`${input.workspaceId}/expo/${input.siteId}`);

  try {
    const type = asMediaType(input.declaredType);
    if (!type) throw new Error("지원하지 않는 미디어 형식이에요");
    assertPathType(path, type);
    const info = await storage.infoQuarantine(path);
    if (info.contentType !== type) throw new Error("저장된 MIME이 요청과 일치하지 않아요");
    if (info.size <= 0 || info.size > sourceLimit(type)) throw new Error("저장된 파일 크기가 허용 범위를 벗어났어요");
    const bytes = await storage.downloadQuarantine(path);
    if (bytes.length !== info.size) throw new Error("저장된 파일 크기와 실제 바이트가 일치하지 않아요");

    if (type === "video/mp4") {
      const inspected = inspectMp4({ declaredType: type, bytes });
      if (!inspected.ok) throw new Error(`MP4를 안전하게 처리할 수 없어요 (${inspected.reason})`);
      const originalKey = normalizeStorageKey(`${sitePrefix}/original-${uuid()}.mp4`);
      const uploaded = await storage.uploadPublic(originalKey, bytes, {
        contentType: type, cacheControl: "31536000, immutable", upsert: false,
      });
      if (uploaded.error) throw new Error("공개 원본 업로드에 실패했어요");
      created.push(originalKey);
      const url = storage.publicUrl(originalKey);
      return { kind: "video", url, originalUrl: url, mimeType: type, bytes: bytes.length };
    }

    const actual = sniffImageType(bytes);
    if (actual !== type) throw new Error("이미지 매직과 저장 MIME이 일치하지 않아요");
    const processed = type === "image/svg+xml"
      ? await processExpoSvg(bytes)
      : await processExpoRaster({ bytes, declaredType: type });
    const originalKey = normalizeStorageKey(`${sitePrefix}/original-${uuid()}.${processed.original.extension}`);
    const optimizedKey = normalizeStorageKey(`${sitePrefix}/optimized-${uuid()}.${processed.optimized.extension}`);
    const originalUpload = await storage.uploadPublic(originalKey, processed.original.bytes, {
      contentType: processed.original.mimeType, cacheControl: "31536000, immutable", upsert: false,
    });
    if (originalUpload.error) throw new Error("공개 원본 업로드에 실패했어요");
    created.push(originalKey);
    const optimizedUpload = await storage.uploadPublic(optimizedKey, processed.optimized.bytes, {
      contentType: processed.optimized.mimeType, cacheControl: "31536000, immutable", upsert: false,
    });
    if (optimizedUpload.error) throw new Error("공개 최적화본 업로드에 실패했어요");
    created.push(optimizedKey);
    return {
      kind: "image",
      url: storage.publicUrl(optimizedKey),
      originalUrl: storage.publicUrl(originalKey),
      mimeType: processed.optimized.mimeType,
      width: processed.width,
      height: processed.height,
      bytes: processed.optimized.bytes.length,
    };
  } catch (error) {
    if (created.length > 0) await storage.removePublic(created).catch(() => undefined);
    throw error;
  } finally {
    await storage.removeQuarantine([path]).catch(() => undefined);
  }
}
