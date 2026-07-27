/**
 * 세션에 붙는 이미지 두 종류(연사 사진 · 로고)의 업로드 규칙 — 라우트·에디터가 공유하는 단일 정의.
 *
 * 두 종류를 한 파일에 둔 이유: 허용 형식과 크기 한도가 **완전히 같고**, 그 한도의 근거(아래 Vercel
 * 상한)가 한 번만 적혀 있어야 한다. 복제하면 한쪽만 고쳐져 갈라진다 — 랜딩 미디어 쪽이 실제로
 * 그렇게 5MB 로 갈라진 채 남아 있다.
 */
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** 버킷 설정이 이 목록을 다시 하드코딩하지 않도록 배열로도 내보낸다(webinar-asset-bucket.ts). */
export const SESSION_IMAGE_MIME_TYPES = [...ALLOWED_IMAGE_TYPES];

/**
 * 4MB. 예전엔 5MB 라고 안내했는데 Vercel 서버리스 요청 본문 상한이 4.5MB 라,
 * 4.5~5MB 파일은 우리 검증에 통과한 뒤 플랫폼 단계에서 잘려 "업로드 실패"만 뜨고
 * 이유를 알 수 없었다. 안내와 실제 한도를 상한 아래로 맞춘다.
 */
const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024;
export const SPEAKER_PHOTO_MAX_LABEL = "4MB";
/** 로고도 같은 한도 — 별칭으로 둬서 화면 문구가 숫자를 직접 적지 않게 한다. */
export const SESSION_LOGO_MAX_LABEL = SPEAKER_PHOTO_MAX_LABEL;

export const SPEAKER_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
/**
 * 로고는 SVG 가 표준이지만 **일부러 뺐다.** 이 버킷은 public 이고 업로드된 파일은 우리가 CSP 를
 * 통제하지 않는 스토리지 도메인에서 원본 MIME 그대로 서빙된다 — SVG 안의 <script> 가 그 도메인에서
 * 실행되고, 같은 URL 이 랜딩 임베드 payload 로 파트너 사이트에도 들어간다.
 * 투명 배경 PNG 로 로고 용도는 충분히 커버된다.
 */
export const SESSION_LOGO_ACCEPT = SPEAKER_PHOTO_ACCEPT;

/** noun 은 오류 문구에 들어가는 말("사진"·"로고") — 어느 칸을 고쳐야 할지 알게 한다. */
function validateSessionImage(file: { type: string; size: number }, noun: string): string | null {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) return "JPG, PNG, WebP 또는 GIF 이미지만 올릴 수 있어요.";
  if (file.size > MAX_IMAGE_SIZE_BYTES) return `${noun}은 ${SPEAKER_PHOTO_MAX_LABEL} 이하로 올려주세요.`;
  return null;
}

export function validateSpeakerPhoto(file: { type: string; size: number }): string | null {
  return validateSessionImage(file, "사진");
}

export function validateSessionLogo(file: { type: string; size: number }): string | null {
  return validateSessionImage(file, "로고");
}

export function speakerPhotoExtension(contentType: string) {
  return ({
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  } as Record<string, string>)[contentType];
}
