// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  assertOwnedQuarantinePath, createQuarantinePath, finalizeExpoUpload, normalizeStorageKey,
  type ExpoFinalizeStorage,
} from "@/lib/expo/media-upload-session";
import { ASSET_BUCKET_MIME_TYPES } from "@/lib/webinar-asset-bucket";

const png = async (width = 20, height = 10) => new Uint8Array(await sharp({
  create: { width, height, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0.5 } },
}).png().toBuffer());

function storage(over: Partial<ExpoFinalizeStorage> = {}) {
  const calls = { info: 0, download: 0, uploads: [] as string[], removedQ: [] as string[], removedP: [] as string[] };
  const defaultBody = png();
  const value: ExpoFinalizeStorage = {
    async infoQuarantine() { calls.info++; return { size: (await defaultBody).length, contentType: "image/png" }; },
    async downloadQuarantine() { calls.download++; return defaultBody; },
    async uploadPublic(path) { calls.uploads.push(path); return { error: null }; },
    publicUrl: (path) => `https://abc.supabase.co/storage/v1/object/public/webinar-assets/${path}`,
    async removeQuarantine(paths) { calls.removedQ.push(...paths); return { error: null }; },
    async removePublic(paths) { calls.removedP.push(...paths); return { error: null }; },
    ...over,
  };
  return { value, calls };
}

const input = {
  workspaceId: "ws1", siteId: "site1", userId: "user1",
  path: "ws1/expo-quarantine/site1/user1/one.png", declaredType: "image/png",
  randomUUID: () => "00000000-0000-4000-8000-000000000001",
};

describe("quarantine key ownership", () => {
  it("uses the exact workspace/site/user prefix with no leading separator", () => {
    expect(createQuarantinePath({
      workspaceId: "ws1", siteId: "site1", userId: "user1", fileName: "hero.PNG", declaredType: "image/png",
      randomUUID: () => "id1",
    })).toBe("ws1/expo-quarantine/site1/user1/id1.png");
  });

  it.each(["", "/a/b", "a//b", "a/./b", "a/../b", "a/b/", "a\\b"])("rejects non-canonical key %j", (path) => {
    expect(() => normalizeStorageKey(path)).toThrow();
  });

  it("rejects sibling-prefix confusion", () => {
    expect(() => assertOwnedQuarantinePath("ws1/expo-quarantine/site10/user1/x.png", "ws1", "site1", "user1")).toThrow();
    expect(() => assertOwnedQuarantinePath("ws1/expo-quarantine/site1/user10/x.png", "ws1", "site1", "user1")).toThrow();
  });
});

describe("finalize Expo media", () => {
  it("the existing public bucket allowlist can retain only the validated SVG original", () => {
    expect(ASSET_BUCKET_MIME_TYPES).toContain("image/svg+xml");
  });

  it("verifies metadata before download and creates immutable original + derivative under the owning site", async () => {
    const order: string[] = [];
    const body = await png(1600, 900);
    const { value, calls } = storage({
      async infoQuarantine() { order.push("info"); return { size: body.length, contentType: "image/png" }; },
      async downloadQuarantine() { order.push("download"); return body; },
      async uploadPublic(path) { order.push(`upload:${path}`); calls.uploads.push(path); return { error: null }; },
    });
    const result = await finalizeExpoUpload(value, input);
    expect(order[0]).toBe("info");
    expect(order[1]).toBe("download");
    expect(calls.uploads).toHaveLength(2);
    expect(calls.uploads.every((path) => path.startsWith("ws1/expo/site1/"))).toBe(true);
    expect(calls.uploads[0]).toContain("original-");
    expect(calls.uploads[1]).toContain("optimized-");
    expect(result.kind).toBe("image");
    expect(Math.max(result.width ?? 0, result.height ?? 0)).toBeLessThanOrEqual(1400);
    expect(result.url).not.toBe(result.originalUrl);
    expect(calls.removedQ).toEqual([input.path]);
  });

  it("rejects an oversized metadata object before download and always cleans quarantine", async () => {
    const { value, calls } = storage({
      async infoQuarantine() { return { size: 12 * 1024 * 1024 + 1, contentType: "image/png" }; },
    });
    await expect(finalizeExpoUpload(value, input)).rejects.toThrow(/크/);
    expect(calls.download).toBe(0);
    expect(calls.uploads).toEqual([]);
    expect(calls.removedQ).toEqual([input.path]);
  });

  it("rejects prefix confusion and never touches storage", async () => {
    const { value, calls } = storage();
    await expect(finalizeExpoUpload(value, { ...input, path: "ws1/expo-quarantine/site10/user1/x.png" })).rejects.toThrow(/경로/);
    expect(calls.info).toBe(0);
    expect(calls.removedQ).toEqual([]);
  });

  it("cleans an owned quarantine object even when its declared type is invalid", async () => {
    const { value, calls } = storage();
    await expect(finalizeExpoUpload(value, { ...input, declaredType: "text/html" })).rejects.toThrow(/형식/);
    expect(calls.info).toBe(0);
    expect(calls.removedQ).toEqual([input.path]);
  });

  it("rejects malicious SVG before public upload and cleans quarantine", async () => {
    const bad = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    const { value, calls } = storage({
      async infoQuarantine() { return { size: bad.length, contentType: "image/svg+xml" }; },
      async downloadQuarantine() { calls.download++; return bad; },
    });
    await expect(finalizeExpoUpload(value, { ...input, path: "ws1/expo-quarantine/site1/user1/x.svg", declaredType: "image/svg+xml" })).rejects.toThrow(/SVG/);
    expect(calls.uploads).toEqual([]);
    expect(calls.removedQ).toHaveLength(1);
  });

  it("retains a validated SVG original but exposes a Sharp PNG derivative", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="#f60"/></svg>');
    const uploaded: Array<{ path: string; contentType: string }> = [];
    const { value } = storage({
      async infoQuarantine() { return { size: svg.length, contentType: "image/svg+xml" }; },
      async downloadQuarantine() { return svg; },
      async uploadPublic(path, _bytes, options) { uploaded.push({ path, contentType: options.contentType }); return { error: null }; },
    });
    const result = await finalizeExpoUpload(value, { ...input, path: "ws1/expo-quarantine/site1/user1/x.svg", declaredType: "image/svg+xml" });
    expect(uploaded).toEqual([
      expect.objectContaining({ path: expect.stringMatching(/original-.*\.svg$/), contentType: "image/svg+xml" }),
      expect.objectContaining({ path: expect.stringMatching(/optimized-.*\.png$/), contentType: "image/png" }),
    ]);
    expect(result).toMatchObject({ kind: "image", mimeType: "image/png", width: 100, height: 50 });
  });

  it("keeps a JPEG original extension and publishes a WebP derivative", async () => {
    const jpeg = new Uint8Array(await sharp({ create: { width: 40, height: 20, channels: 3, background: "red" } }).jpeg().toBuffer());
    const { value, calls } = storage({
      async infoQuarantine() { return { size: jpeg.length, contentType: "image/jpeg" }; },
      async downloadQuarantine() { return jpeg; },
    });
    const result = await finalizeExpoUpload(value, { ...input, path: "ws1/expo-quarantine/site1/user1/x.jpg", declaredType: "image/jpeg" });
    expect(calls.uploads[0]).toMatch(/original-.*\.jpg$/);
    expect(calls.uploads[1]).toMatch(/optimized-.*\.webp$/);
    expect(result.mimeType).toBe("image/webp");
  });

  it("removes only the first object created by this request if derivative upload fails", async () => {
    let upload = 0;
    const { value, calls } = storage({
      async uploadPublic(path) { calls.uploads.push(path); upload++; return { error: upload === 2 ? "failed" : null }; },
    });
    await expect(finalizeExpoUpload(value, input)).rejects.toThrow(/업로드/);
    expect(calls.removedP).toEqual([calls.uploads[0]]);
    expect(calls.removedQ).toEqual([input.path]);
  });

  it("stores a valid MP4 once with url === originalUrl and rejects MIME/byte mismatch", async () => {
    const mp4 = new Uint8Array([0, 0, 0, 16, ...Buffer.from("ftypisom"), 0, 0, 0, 0]);
    const ok = storage({
      async infoQuarantine() { return { size: mp4.length, contentType: "video/mp4" }; },
      async downloadQuarantine() { return mp4; },
    });
    const result = await finalizeExpoUpload(ok.value, { ...input, path: "ws1/expo-quarantine/site1/user1/x.mp4", declaredType: "video/mp4" });
    expect(result).toMatchObject({ kind: "video", mimeType: "video/mp4" });
    expect(result.url).toBe(result.originalUrl);
    expect(ok.calls.uploads).toHaveLength(1);

    const bad = storage({
      async infoQuarantine() { return { size: 20, contentType: "video/mp4" }; },
      async downloadQuarantine() { return new Uint8Array(20); },
    });
    await expect(finalizeExpoUpload(bad.value, { ...input, path: "ws1/expo-quarantine/site1/user1/x.mp4", declaredType: "video/mp4" })).rejects.toThrow(/MP4/);
    expect(bad.calls.uploads).toHaveLength(0);
  });
});
