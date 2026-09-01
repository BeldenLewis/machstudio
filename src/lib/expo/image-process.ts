import sharp from "sharp";
import {
  checkDecodedMetadata, checkDownscaled, checkUploadCandidate, EXPO_IMAGE_LIMITS,
  sniffImageType,
} from "@/lib/expo/image-guard";
import { inspectSvg } from "@/lib/expo/svg-guard";

export const EXPO_IMAGE_PROCESS_RULES = EXPO_IMAGE_LIMITS;

export interface ProcessedExpoImage {
  original: { bytes: Uint8Array; mimeType: string; extension: "jpg" | "png" | "webp" | "svg" };
  optimized: { bytes: Uint8Array; mimeType: "image/png" | "image/webp"; extension: "png" | "webp" };
  width: number;
  height: number;
}

const extensionFor = (mimeType: string): "jpg" | "png" | "webp" => {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  return "webp";
};

async function optimizedRaster(bytes: Uint8Array, mimeType: string): Promise<ProcessedExpoImage> {
  const image = sharp(Buffer.from(bytes), { limitInputPixels: EXPO_IMAGE_LIMITS.maxPixels }).rotate();
  const meta = await image.metadata();
  const decoded = checkDecodedMetadata(meta);
  if (decoded) throw new Error(`이미지를 처리할 수 없어요 (${decoded})`);

  const transparentPng = mimeType === "image/png" && meta.hasAlpha === true;
  const pipeline = image.resize({
    width: EXPO_IMAGE_LIMITS.maxEdge,
    height: EXPO_IMAGE_LIMITS.maxEdge,
    fit: "inside",
    withoutEnlargement: true,
  });
  const output = transparentPng
    ? await pipeline.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
    : await pipeline.webp({ quality: 82, effort: 4 }).toBuffer({ resolveWithObject: true });
  const rejection = checkDownscaled({ bytes: output.data.length, width: output.info.width, height: output.info.height });
  if (rejection) throw new Error(`이미지를 최적화할 수 없어요 (${rejection})`);

  return {
    original: { bytes, mimeType, extension: extensionFor(mimeType) },
    optimized: {
      bytes: new Uint8Array(output.data),
      mimeType: transparentPng ? "image/png" : "image/webp",
      extension: transparentPng ? "png" : "webp",
    },
    width: output.info.width,
    height: output.info.height,
  };
}

export async function processExpoRaster(input: { bytes: Uint8Array; declaredType: string }): Promise<ProcessedExpoImage> {
  const candidate = checkUploadCandidate(input);
  if (candidate) throw new Error(`이미지를 처리할 수 없어요 (${candidate})`);
  const actual = sniffImageType(input.bytes);
  if (!actual || !["image/jpeg", "image/png", "image/webp"].includes(actual)) {
    throw new Error("이미지 형식이 올바르지 않아요");
  }
  return optimizedRaster(input.bytes, actual);
}

export async function processExpoSvg(bytes: Uint8Array): Promise<ProcessedExpoImage> {
  if (bytes.length > EXPO_IMAGE_LIMITS.sourceBytes) throw new Error("SVG가 너무 커요");
  const inspected = inspectSvg(bytes);
  if (!inspected.ok) throw new Error(`SVG를 안전하게 처리할 수 없어요 (${inspected.reason})`);
  if (inspected.width && inspected.height && inspected.width * inspected.height > EXPO_IMAGE_LIMITS.maxPixels) {
    throw new Error("SVG 픽셀 수가 너무 많아요");
  }
  const image = sharp(Buffer.from(bytes), { limitInputPixels: EXPO_IMAGE_LIMITS.maxPixels });
  const meta = await image.metadata();
  const decoded = checkDecodedMetadata(meta);
  if (decoded) throw new Error(`SVG를 읽을 수 없어요 (${decoded})`);
  const output = await image
    .resize({ width: EXPO_IMAGE_LIMITS.maxEdge, height: EXPO_IMAGE_LIMITS.maxEdge, fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });
  const rejection = checkDownscaled({ bytes: output.data.length, width: output.info.width, height: output.info.height });
  if (rejection) throw new Error(`SVG를 최적화할 수 없어요 (${rejection})`);
  return {
    original: { bytes, mimeType: "image/svg+xml", extension: "svg" },
    optimized: { bytes: new Uint8Array(output.data), mimeType: "image/png", extension: "png" },
    width: output.info.width,
    height: output.info.height,
  };
}
