const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export const SPEAKER_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

export function validateSpeakerPhoto(file: { type: string; size: number }): string | null {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) return "JPG, PNG, WebP 또는 GIF 이미지만 올릴 수 있어요.";
  if (file.size > MAX_IMAGE_SIZE_BYTES) return "사진은 5MB 이하로 올려주세요.";
  return null;
}

export function speakerPhotoExtension(contentType: string) {
  return ({
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  } as Record<string, string>)[contentType];
}
