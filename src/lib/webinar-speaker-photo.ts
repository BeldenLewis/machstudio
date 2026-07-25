const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * 4MB. 예전엔 5MB 라고 안내했는데 Vercel 서버리스 요청 본문 상한이 4.5MB 라,
 * 4.5~5MB 파일은 우리 검증에 통과한 뒤 플랫폼 단계에서 잘려 "업로드 실패"만 뜨고
 * 이유를 알 수 없었다. 안내와 실제 한도를 상한 아래로 맞춘다.
 */
const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024;
export const SPEAKER_PHOTO_MAX_LABEL = "4MB";

export const SPEAKER_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

export function validateSpeakerPhoto(file: { type: string; size: number }): string | null {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) return "JPG, PNG, WebP 또는 GIF 이미지만 올릴 수 있어요.";
  if (file.size > MAX_IMAGE_SIZE_BYTES) return `사진은 ${SPEAKER_PHOTO_MAX_LABEL} 이하로 올려주세요.`;
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
