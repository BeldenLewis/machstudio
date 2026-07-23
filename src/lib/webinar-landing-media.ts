// 랜딩 히어로 배경 미디어(이미지/동영상) 업로드 규칙 — 라우트·에디터가 공유하는 단일 정의.
const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
};

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;

export const LANDING_IMAGE_ACCEPT = Object.keys(IMAGE_TYPES).join(",");
export const LANDING_VIDEO_ACCEPT = Object.keys(VIDEO_TYPES).join(",");
export const LANDING_MEDIA_MIME_TYPES = [...Object.keys(IMAGE_TYPES), ...Object.keys(VIDEO_TYPES)];

export function landingMediaKind(contentType: string): "image" | "video" | null {
  if (IMAGE_TYPES[contentType]) return "image";
  if (VIDEO_TYPES[contentType]) return "video";
  return null;
}

export function validateLandingMedia(file: { type: string; size: number }): string | null {
  const kind = landingMediaKind(file.type);
  if (!kind) return "JPG·PNG·WebP·GIF 이미지 또는 MP4·WebM 동영상만 올릴 수 있어요.";
  if (kind === "image" && file.size > MAX_IMAGE_SIZE_BYTES) return "이미지는 5MB 이하로 올려주세요.";
  if (kind === "video" && file.size > MAX_VIDEO_SIZE_BYTES) return "동영상은 50MB 이하로 올려주세요.";
  return null;
}

export function landingMediaExtension(contentType: string): string | null {
  return IMAGE_TYPES[contentType] ?? VIDEO_TYPES[contentType] ?? null;
}
