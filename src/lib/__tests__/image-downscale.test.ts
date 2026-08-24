import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { downscaleUpload, extensionForContentType, isResizableImage } from "@/lib/image-downscale";

/**
 * 업로드 축소.
 *
 * 이게 없으면 둘 중 하나가 터진다:
 *  - 원본을 그대로 서빙 → egress 쿼터 소진 → Storage 402 → 라이브 이미지 전부 실종(실제 사고)
 *  - Supabase 변환 URL 로 우회 → 유료 기능이라 403 → 업로드는 되는데 화면에 안 보임(실제 증상)
 * 저장된 것 자체를 작게 만들어 둘 다 피한다.
 */
async function jpeg(width: number, height: number): Promise<File> {
  const buf = await sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 80, b: 40 } },
  }).jpeg({ quality: 100 }).toBuffer();
  return new File([new Uint8Array(buf)], "hero.jpg", { type: "image/jpeg" });
}

describe("업로드 축소", () => {
  it("큰 이미지는 긴 변 1600px 이하로 줄인다", async () => {
    const out = await downscaleUpload(await jpeg(4000, 2600));
    expect(out.resized).toBe(true);
    const meta = await sharp(out.body as Buffer).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1600);
  });

  it("줄인 결과가 원본보다 작다 — 이게 목적이다", async () => {
    const original = await jpeg(4000, 2600);
    const out = await downscaleUpload(original);
    expect((out.body as Buffer).byteLength).toBeLessThan(original.size);
  });

  it("원본보다 키우지 않는다 — 작은 이미지를 늘리면 용량만 는다", async () => {
    const out = await downscaleUpload(await jpeg(320, 200));
    if (out.resized) {
      const meta = await sharp(out.body as Buffer).metadata();
      expect(meta.width).toBeLessThanOrEqual(320);
    }
  });

  /** GIF 는 애니메이션이 죽고 SVG 는 래스터화하면 흐려지면서 오히려 커진다. */
  it("GIF·SVG·동영상은 손대지 않는다", async () => {
    for (const type of ["image/gif", "image/svg+xml", "video/mp4"]) {
      expect(isResizableImage(type)).toBe(false);
      const file = new File([new Uint8Array([1, 2, 3])], "x", { type });
      const out = await downscaleUpload(file);
      expect(out.resized).toBe(false);
      expect(out.contentType).toBe(type);
    }
  });

  /** 형식이 바뀌었는데 경로 확장자가 그대로면 .jpg 인데 내용은 webp 인 파일이 생긴다. */
  it("바뀐 형식에 맞는 확장자를 준다", () => {
    expect(extensionForContentType("image/webp", "jpg")).toBe("webp");
    expect(extensionForContentType("image/png", "jpg")).toBe("png");
    expect(extensionForContentType("video/mp4", "mp4")).toBe("mp4");
  });

  it("깨진 파일이면 원본을 그대로 돌려준다 — 업로드 자체를 막지 않는다", async () => {
    const broken = new File([new Uint8Array([0, 1, 2, 3])], "x.jpg", { type: "image/jpeg" });
    const out = await downscaleUpload(broken);
    expect(out.resized).toBe(false);
    expect(out.contentType).toBe("image/jpeg");
  });
});
