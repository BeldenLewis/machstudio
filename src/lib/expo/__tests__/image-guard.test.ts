import { describe, expect, it } from "vitest";
import {
  checkDecodedMetadata, checkDownscaled, checkUploadCandidate, EXPO_IMAGE_LIMITS,
  EXPO_IMAGE_MESSAGES, expoObjectPrefix, isOwnedExpoObject, sniffImageType,
} from "@/lib/expo/image-guard";

/**
 * 업로드 검증 — **Storage 에 닿기 전에** 끝낸다.
 *
 * 여기 올라간 파일은 파트너 사이트에 임베드되어 나간다. `Content-Type` 은 올리는 쪽이
 * 정하는 값이라, `image/png` 라고 적고 SVG 를 올리면 스크립트를 담은 파일이 우리
 * Storage 에서 서빙된다. 그래서 **바이트를 직접 읽어** 실제 형식을 확인한다.
 */

const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const webp = () => new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]);
const gif = () => new Uint8Array([...Buffer.from("GIF89a"), 0, 0, 0, 0, 0, 0]);
const svg = () => new Uint8Array(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'));
const mp4 = () => new Uint8Array([0, 0, 0, 0x20, ...Buffer.from("ftypisom"), 0, 0, 0, 0]);

describe("실제 형식을 바이트로 판정한다", () => {
  it("허용 형식 셋을 알아본다", () => {
    expect(sniffImageType(jpeg())).toBe("image/jpeg");
    expect(sniffImageType(png())).toBe("image/png");
    expect(sniffImageType(webp())).toBe("image/webp");
  });

  /** 거절 대상이라도 무엇인지 알면 문구가 정확해진다. */
  it("GIF·SVG·영상도 알아본다", () => {
    expect(sniffImageType(gif())).toBe("image/gif");
    expect(sniffImageType(svg())).toBe("image/svg+xml");
    expect(sniffImageType(mp4())).toBe("video/mp4");
  });

  it("너무 짧거나 모르는 바이트는 null", () => {
    expect(sniffImageType(new Uint8Array([1, 2]))).toBeNull();
    expect(sniffImageType(new Uint8Array(20))).toBeNull();
  });
});

describe("업로드 후보 검사", () => {
  it("Expo 전용 처리 상한은 원본 12MiB·저장 1.5MiB·긴 변 1400·50MP다", () => {
    expect(EXPO_IMAGE_LIMITS).toEqual({
      sourceBytes: 12 * 1024 * 1024,
      storedBytes: 1.5 * 1024 * 1024,
      maxEdge: 1400,
      maxPixels: 50_000_000,
    });
  });

  it("정상 이미지는 통과", () => {
    expect(checkUploadCandidate({ declaredType: "image/jpeg", bytes: jpeg() })).toBeNull();
    expect(checkUploadCandidate({ declaredType: "image/png; charset=binary", bytes: png() })).toBeNull();
  });

  it("허용하지 않는 형식은 거절", () => {
    for (const t of ["image/gif", "image/svg+xml", "video/mp4", "application/pdf", ""]) {
      expect(checkUploadCandidate({ declaredType: t, bytes: png() })).toBe("type-not-allowed");
    }
  });

  /**
   * **핵심 방어.** `image/png` 라고 적고 SVG 를 올리면 스크립트를 담은 파일이 우리
   * Storage 에서 서빙된다.
   */
  it("선언과 실제가 다르면 거절", () => {
    expect(checkUploadCandidate({ declaredType: "image/png", bytes: svg() })).toBe("content-mismatch");
    expect(checkUploadCandidate({ declaredType: "image/jpeg", bytes: gif() })).toBe("content-mismatch");
    expect(checkUploadCandidate({ declaredType: "image/webp", bytes: mp4() })).toBe("content-mismatch");
  });

  it("읽을 수 없는 바이트는 거절", () => {
    expect(checkUploadCandidate({ declaredType: "image/png", bytes: new Uint8Array(20) })).toBe("unreadable");
  });

  it("원본 상한을 넘으면 거절", () => {
    const big = new Uint8Array(EXPO_IMAGE_LIMITS.sourceBytes + 1);
    big.set(png());
    expect(checkUploadCandidate({ declaredType: "image/png", bytes: big })).toBe("too-large");
  });
});

describe("디코딩 결과 검사", () => {
  it("정상 크기는 통과", () => {
    expect(checkDecodedMetadata({ width: 1920, height: 1080 })).toBeNull();
  });

  it("크기를 못 읽으면 거절", () => {
    expect(checkDecodedMetadata({})).toBe("unreadable");
    expect(checkDecodedMetadata({ width: 0, height: 100 })).toBe("unreadable");
  });

  /** 픽셀 수가 과한 이미지는 축소 자체가 메모리를 먹는다 — 압축 폭탄 방어. */
  it("픽셀이 너무 많으면 축소 전에 거절", () => {
    expect(checkDecodedMetadata({ width: 30000, height: 30000 })).toBe("too-many-pixels");
  });
});

describe("축소 결과를 다시 잰다", () => {
  it("상한 안이면 통과", () => {
    expect(checkDownscaled({ bytes: 400_000, width: 1400, height: 900 })).toBeNull();
  });

  /**
   * 공용 축소 헬퍼는 실패하면 **원본을 그대로 돌려준다**(fail-open). 그 동작은 다른
   * 소비처가 전제하므로 안 바꾼다 — 대신 여기서 거절한다. 안 그러면 5MB 짜리가
   * 파트너 사이트마다 로드된다.
   */
  it("축소가 안 됐으면 원본을 저장하지 않고 거절한다", () => {
    expect(checkDownscaled({ bytes: EXPO_IMAGE_LIMITS.storedBytes + 1, width: 800, height: 600 }))
      .toBe("downscale-failed");
    expect(checkDownscaled({ bytes: 100_000, width: 4000, height: 3000 })).toBe("downscale-failed");
  });
});

describe("Storage 경로 소유", () => {
  it("경로 규칙", () => {
    expect(expoObjectPrefix("w1", "s1")).toBe("w1/expo/s1/");
  });

  it("자기 사이트 파일만 소유로 본다", () => {
    expect(isOwnedExpoObject("w1/expo/s1/abc.jpg", "w1", "s1")).toBe(true);
    expect(isOwnedExpoObject("w1/expo/s2/abc.jpg", "w1", "s1")).toBe(false);
    expect(isOwnedExpoObject("w2/expo/s1/abc.jpg", "w1", "s1")).toBe(false);
  });

  /** 지우거나 복사할 때 경계를 벗어나면 남의 파일을 건드린다. */
  it("경로 탈출을 막는다", () => {
    expect(isOwnedExpoObject("w1/expo/s1/../s2/abc.jpg", "w1", "s1")).toBe(false);
    expect(isOwnedExpoObject("w1/expo/s1/nested/abc.jpg", "w1", "s1")).toBe(false);
  });
});

describe("문구", () => {
  it("모든 거절 사유에 사람이 읽을 문구가 있다", () => {
    for (const [code, msg] of Object.entries(EXPO_IMAGE_MESSAGES)) {
      expect(`${code}: ${msg.trim() !== ""}`).toBe(`${code}: true`);
      expect(msg).not.toMatch(/undefined|null|Error/);
    }
  });
});
