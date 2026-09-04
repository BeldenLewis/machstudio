import { describe, expect, it } from "vitest";
import {
  MEDIA_FILE_MAX_BYTES,
  MEDIA_IMAGE_MAX_BYTES,
  MEDIA_VIDEO_MAX_BYTES,
  extensionFromFilename,
  formatBytes,
  kindForMimeType,
  validateMediaUpload,
} from "@/lib/media-asset";

/**
 * 여기서 재는 것은 **종류(사진/동영상/그 외)와 크기뿐**이다. 형식은 막지 않는다 —
 * 한글·엑셀·CSV 같은 문서도 전부 "file" 로 받는다(media-asset.ts 머리말 참고). 실제
 * 바이트는 서버가 보지 않는다(브라우저가 Storage 로 직접 올린다). 그래서 이 판정이
 * 유일한 서버 쪽 방어선이고, 총 함수여야 한다 — 무엇이 와도 던지지 않는다.
 */

describe("kindForMimeType — 총 함수, 모르는 형식은 file", () => {
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

  /** 한글(HWP)·엑셀·CSV·PDF·zip — 전부 file. null 이 아니라 항상 값을 돌려준다. */
  it("사진·동영상이 아니면 전부 file — 거절하지 않는다", () => {
    for (const v of [
      "application/x-hwp", "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv", "application/pdf", "application/zip", "application/octet-stream",
      "image/svg+xml", "video/x-msvideo", "", "أي شيء",
    ]) {
      expect(kindForMimeType(v)).toBe("file");
    }
  });
});

describe("extensionFromFilename — MIME 이 아니라 원본 이름에서 뽑는다", () => {
  it("평범한 파일 이름에서 소문자로 뽑는다", () => {
    expect(extensionFromFilename("보고서.HWP")).toBe("hwp");
    expect(extensionFromFilename("2026년 실적.xlsx")).toBe("xlsx");
    expect(extensionFromFilename("data.csv")).toBe("csv");
    expect(extensionFromFilename("clip.mp4")).toBe("mp4");
  });

  it("점이 여러 개면 마지막 것만", () => {
    expect(extensionFromFilename("archive.tar.gz")).toBe("gz");
  });

  it("확장자가 없거나 못 믿을 모양이면 빈 문자열", () => {
    expect(extensionFromFilename("이름만있음")).toBe("");
    expect(extensionFromFilename(".hidden")).toBe(""); // 점이 맨 앞 — 확장자가 아니라 숨김파일 이름
    expect(extensionFromFilename("trailing.")).toBe(""); // 점이 맨 끝
    expect(extensionFromFilename("weird.exe;rm -rf")).toBe(""); // 영숫자 아닌 문자
    expect(extensionFromFilename("way-too-long.abcdefghijklmnop")).toBe("");
  });

  it("모양이 이상해도 던지지 않는다", () => {
    for (const bad of [null, undefined, 3, {}, []] as unknown[]) {
      expect(() => extensionFromFilename(bad as string)).not.toThrow();
      expect(extensionFromFilename(bad as string)).toBe("");
    }
  });
});

/**
 * **버킷을 만들기도 전에 실패하던 사고.** 동영상 상한을 200MB 로 뒀더니
 * `createBucket({ fileSizeLimit: "200MB" })` 자체가 이 Supabase 프로젝트의 전역 업로드
 * 상한(대시보드 설정, 기본 50MB)에 막혀 413 으로 거절당했다 — 버킷이 아예 안 만들어지니
 * 모든 업로드가 "업로드 준비에 실패했어요" 로 죽었다(사진도 포함, 버킷 자체가 없어서).
 * 실측(2026-09-02, raw 바이트 기준): 52,428,800(50MiB) 은 되고 52,900,000 부터 막힌다.
 * 상한을 다시 올릴 일이 생기면 **코드보다 먼저 Supabase 프로젝트 설정을 올려야 한다**
 * — 여기서 그 사실을 못박는다.
 */
describe("동영상 상한은 이 프로젝트가 실제로 받아 주는 값 안에 있다", () => {
  it("Supabase 프로젝트 전역 상한(실측 50MiB) 을 넘지 않는다", () => {
    expect(MEDIA_VIDEO_MAX_BYTES).toBeLessThanOrEqual(52_428_800);
  });

  /** 버킷의 fileSizeLimit 은 가장 큰 값(동영상) 하나뿐이다 — 다른 종류 상한도 그 안에 있어야 한다. */
  it("사진·문서 상한도 버킷 자체 한도(동영상 상한) 를 넘지 않는다", () => {
    expect(MEDIA_IMAGE_MAX_BYTES).toBeLessThanOrEqual(MEDIA_VIDEO_MAX_BYTES);
    expect(MEDIA_FILE_MAX_BYTES).toBeLessThanOrEqual(MEDIA_VIDEO_MAX_BYTES);
  });
});

describe("validateMediaUpload — 총 함수, 던지지 않는다", () => {
  it("정상 사진·동영상·문서는 통과", () => {
    expect(validateMediaUpload({ mimeType: "image/webp", size: 1024 })).toBeNull();
    expect(validateMediaUpload({ mimeType: "video/mp4", size: 1024 * 1024 })).toBeNull();
    expect(validateMediaUpload({ mimeType: "application/vnd.ms-excel", size: 1024 })).toBeNull();
  });

  it("경계값 — 상한과 정확히 같으면 통과, 한 바이트 넘으면 거절", () => {
    expect(validateMediaUpload({ mimeType: "image/jpeg", size: MEDIA_IMAGE_MAX_BYTES })).toBeNull();
    expect(validateMediaUpload({ mimeType: "image/jpeg", size: MEDIA_IMAGE_MAX_BYTES + 1 })).not.toBeNull();
    expect(validateMediaUpload({ mimeType: "video/mp4", size: MEDIA_VIDEO_MAX_BYTES })).toBeNull();
    expect(validateMediaUpload({ mimeType: "video/mp4", size: MEDIA_VIDEO_MAX_BYTES + 1 })).not.toBeNull();
    expect(validateMediaUpload({ mimeType: "text/csv", size: MEDIA_FILE_MAX_BYTES })).toBeNull();
    expect(validateMediaUpload({ mimeType: "text/csv", size: MEDIA_FILE_MAX_BYTES + 1 })).not.toBeNull();
  });

  /** 세 종류가 각자 다른 상한을 쓴다 — 같은 바이트 수라도 종류에 따라 통과·거절이 갈린다. */
  it("사진·동영상·문서가 각자 다른 상한을 쓴다", () => {
    const overImage = MEDIA_IMAGE_MAX_BYTES + 1;
    expect(validateMediaUpload({ mimeType: "image/png", size: overImage })).not.toBeNull();
    expect(validateMediaUpload({ mimeType: "video/webm", size: overImage })).toBeNull(); // 동영상 상한이 훨씬 크다
    expect(validateMediaUpload({ mimeType: "text/csv", size: overImage })).toBeNull(); // 문서 상한도 사진보다 크다
  });

  it("형식은 더 이상 거절하지 않는다 — 허용 목록 밖 MIME 도 크기만 맞으면 통과", () => {
    expect(validateMediaUpload({ mimeType: "application/pdf", size: 100 })).toBeNull();
    expect(validateMediaUpload({ mimeType: "application/x-hwp", size: 100 })).toBeNull();
    expect(validateMediaUpload({ mimeType: "", size: 100 })).toBeNull();
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
