import { describe, expect, it } from "vitest";
import {
  MEDIA_ALLOWED_MIME_TYPES,
  MEDIA_IMAGE_MAX_BYTES,
  MEDIA_VIDEO_MAX_BYTES,
  extensionForMimeType,
  formatBytes,
  kindForMimeType,
  validateMediaUpload,
} from "@/lib/media-asset";

/**
 * 여기서 재는 것은 **형식과 크기뿐**이다. 실제 바이트는 서버가 보지 않는다
 * (브라우저가 Storage 로 직접 올린다 — media-asset.ts 머리말 참고). 그래서 이 판정이
 * 유일한 서버 쪽 방어선이고, 총 함수여야 한다 — 무엇이 와도 던지지 않는다.
 */

describe("kindForMimeType / extensionForMimeType", () => {
  it("사진 네 종류를 안다", () => {
    expect(kindForMimeType("image/jpeg")).toBe("image");
    expect(kindForMimeType("image/png")).toBe("image");
    expect(kindForMimeType("image/webp")).toBe("image");
    expect(kindForMimeType("image/gif")).toBe("image");
  });

  it("동영상 세 종류를 안다", () => {
    expect(kindForMimeType("video/mp4")).toBe("video");
    expect(kindForMimeType("video/webm")).toBe("video");
    expect(kindForMimeType("video/quicktime")).toBe("video");
  });

  it("모르는 형식은 null", () => {
    for (const v of ["image/svg+xml", "application/pdf", "text/plain", "", "video/x-msvideo"]) {
      expect(kindForMimeType(v)).toBeNull();
    }
  });

  it("확장자가 실제로 그 형식으로 저장된다", () => {
    expect(extensionForMimeType("image/webp")).toBe("webp");
    expect(extensionForMimeType("video/quicktime")).toBe("mov");
    expect(extensionForMimeType("application/pdf")).toBeNull();
  });

  it("허용 목록과 판정이 어긋나지 않는다", () => {
    for (const mime of MEDIA_ALLOWED_MIME_TYPES) {
      expect(kindForMimeType(mime)).not.toBeNull();
      expect(extensionForMimeType(mime)).not.toBeNull();
    }
  });
});

describe("validateMediaUpload — 총 함수, 던지지 않는다", () => {
  it("정상 사진·동영상은 통과", () => {
    expect(validateMediaUpload({ mimeType: "image/webp", size: 1024 })).toBeNull();
    expect(validateMediaUpload({ mimeType: "video/mp4", size: 1024 * 1024 })).toBeNull();
  });

  it("경계값 — 상한과 정확히 같으면 통과, 한 바이트 넘으면 거절", () => {
    expect(validateMediaUpload({ mimeType: "image/jpeg", size: MEDIA_IMAGE_MAX_BYTES })).toBeNull();
    expect(validateMediaUpload({ mimeType: "image/jpeg", size: MEDIA_IMAGE_MAX_BYTES + 1 })).not.toBeNull();
    expect(validateMediaUpload({ mimeType: "video/mp4", size: MEDIA_VIDEO_MAX_BYTES })).toBeNull();
    expect(validateMediaUpload({ mimeType: "video/mp4", size: MEDIA_VIDEO_MAX_BYTES + 1 })).not.toBeNull();
  });

  /** 동영상 상한으로 사진을 재면 안 된다 — 종류마다 다른 상한을 쓴다. */
  it("사진에는 사진 상한을, 동영상에는 동영상 상한을 쓴다", () => {
    expect(validateMediaUpload({ mimeType: "image/png", size: MEDIA_IMAGE_MAX_BYTES + 1 })).not.toBeNull();
    // 같은 바이트 수라도 동영상이면 통과해야 한다(동영상 상한이 훨씬 크다).
    expect(validateMediaUpload({ mimeType: "video/webm", size: MEDIA_IMAGE_MAX_BYTES + 1 })).toBeNull();
  });

  it("허용 목록 밖 형식은 거절", () => {
    expect(validateMediaUpload({ mimeType: "application/pdf", size: 100 })).not.toBeNull();
  });

  it("모양이 이상해도 던지지 않는다", () => {
    // mimeType·size 는 unknown 으로 받는다 — 호출부가 무엇을 보내든(원격 요청이니까) 던지지 않아야 한다.
    for (const bad of [null, undefined, 3, {}, [], "x"] as unknown[]) {
      expect(() => validateMediaUpload({ mimeType: bad, size: bad })).not.toThrow();
    }
    expect(validateMediaUpload({ mimeType: "image/png", size: 0 })).not.toBeNull();
    expect(validateMediaUpload({ mimeType: "image/png", size: -1 })).not.toBeNull();
    expect(validateMediaUpload({ mimeType: "image/png", size: NaN })).not.toBeNull();
  });
});

describe("formatBytes", () => {
  it("단위를 1024 기준으로 올린다", () => {
    expect(formatBytes(500)).toBe("500B");
    expect(formatBytes(1024)).toBe("1KB");
    expect(formatBytes(1536)).toBe("1.5KB");
    expect(formatBytes(1024 * 1024)).toBe("1MB");
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1GB");
  });

  it("10 이상이면 소수점을 반올림한다", () => {
    expect(formatBytes(15.6 * 1024 * 1024)).toBe("16MB");
  });

  it("음수·NaN 은 던지지 않고 대시로", () => {
    expect(formatBytes(-1)).toBe("-");
    expect(formatBytes(NaN)).toBe("-");
  });
});
