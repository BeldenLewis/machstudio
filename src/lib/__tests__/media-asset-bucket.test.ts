// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MEDIA_VIDEO_MAX_BYTES } from "@/lib/media-asset";

/**
 * **재발 방지.** ensureMediaBucket 이 fileSizeLimit 을 `"50MB"` 같은 문자열로 주면
 * Supabase Storage 서버는 그걸 10진 MB(1,000,000B)로 해석한다 — MEDIA_VIDEO_MAX_BYTES 는
 * 2진 MiB(1024*1024=1,048,576B) 라 "50MB" 문자열의 실제 한도(50,000,000B)가 우리 앱이
 * 통과시키는 최대(52,428,800B)보다 낮아진다. 그 ~2.3MB 구간의 동영상은 validateMediaUpload
 * 는 통과하고 실제 업로드에서만 "The object exceeded the maximum allowed size" 로 실패했다
 * (2026-09-04 리포트, 격리 버킷으로 재현·확인). fileSizeLimit 은 반드시 **숫자**(바이트)로
 * 줘야 한다 — webinar-asset-bucket.ts 가 처음부터 쓰던 방식과 같다.
 */

const getBucket = vi.fn();
const createBucket = vi.fn();
const updateBucket = vi.fn();
const adminMock = { storage: { getBucket, createBucket, updateBucket } };

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminMock }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  createBucket.mockResolvedValue({ error: null });
  updateBucket.mockResolvedValue({ error: null });
});

describe("ensureMediaBucket — fileSizeLimit 은 숫자로 준다", () => {
  it("버킷이 없으면 createBucket 에 숫자 바이트 값을 준다 — 문자열이면 안 된다", async () => {
    getBucket.mockResolvedValue({ error: { message: "not found" } });
    const { ensureMediaBucket } = await import("@/lib/media-asset-bucket");
    await ensureMediaBucket();

    expect(createBucket).toHaveBeenCalledTimes(1);
    const options = createBucket.mock.calls[0][1];
    expect(typeof options.fileSizeLimit).toBe("number");
    expect(options.fileSizeLimit).toBe(MEDIA_VIDEO_MAX_BYTES);
  });

  it("버킷이 이미 있으면 updateBucket 도 같은 숫자 값으로 맞춘다", async () => {
    getBucket.mockResolvedValue({ error: null, data: { id: "media-library" } });
    const { ensureMediaBucket } = await import("@/lib/media-asset-bucket");
    await ensureMediaBucket();

    expect(updateBucket).toHaveBeenCalledTimes(1);
    const options = updateBucket.mock.calls[0][1];
    expect(typeof options.fileSizeLimit).toBe("number");
    expect(options.fileSizeLimit).toBe(MEDIA_VIDEO_MAX_BYTES);
  });
});
