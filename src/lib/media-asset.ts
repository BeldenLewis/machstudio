/**
 * 마하스튜디오 업로드(자료실) — 무엇을 올릴 수 있는가, 그 규칙 한 곳.
 *
 * 사진은 jpeg·png·webp·gif, 동영상은 mp4·webm·quicktime(mov)만 받는다. 형식·크기 판정을
 * 여기 한 곳에 두는 이유는 다른 업로드들이 겪은 문제(webinar-asset-bucket.ts 참고) 그대로다 —
 * 라우트마다 자기가 아는 목록을 따로 들면 갈라진다.
 *
 * ── 왜 서버가 파일을 안 보고도 검증하는가 ───────────────────────────────
 * 업로드는 **브라우저가 Storage 로 직접** 보낸다(우리 서버를 거치지 않는다). Vercel 서버리스
 * 함수의 요청 본문 상한이 4.5MB 라, 동영상은커녕 큰 사진도 우리 라우트를 통과할 수 없다
 * (webinar-landing-media 가 50MB 동영상을 그 경로로 받는다고 주석에 적어 뒀지만, 실제로는
 * 4.5MB 를 넘는 순간 Vercel 이 우리 코드가 보기도 전에 413 으로 끊는다 — 이 기능은 그 함정을
 * 그대로 밟지 않는다). 그래서 서버는 **자리를 내주는 역할**만 한다: 클라이언트가 보낸
 * mimeType·size 를 여기서 먼저 재고, 통과하면 서명된 업로드 URL을 만들어 돌려준다.
 * 실제 바이트는 서버를 거치지 않으므로 여기서는 "될 것 같은가" 만 판정하고, 버킷 자체의
 * fileSizeLimit·allowedMimeTypes(media-asset-bucket.ts)가 마지막 방어선이다.
 */

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

/** 사진 상한 — 고해상도 스크린샷·webp 무손실도 넉넉히 들어가게. */
export const MEDIA_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
/**
 * 동영상 상한 — **Vercel 이 아니라 Supabase 프로젝트의 전역 업로드 상한**에 맞춘다.
 *
 * 서버를 거치지 않으니 4.5MB 요청 본문 제약은 없지만, Supabase Storage 는 프로젝트
 * 단위로 업로드 크기 상한을 따로 두고(대시보드 설정, 기본 50MB) 그건 버킷의
 * `fileSizeLimit` 을 아무리 크게 잡아도 못 넘는다 — `createBucket` 이 그 순간
 * "The object exceeded the maximum allowed size"(413) 로 버킷 생성 자체를 거절한다.
 * 실측(2026-09-02, 이 프로젝트): 52MB 는 되고 53MB 부터 막힌다. 기존 `webinar-assets`
 * 버킷이 쓰는 값(webinar-asset-bucket.ts)과 맞춰 50MB 로 둔다 — 이미 검증된 값이다.
 * 더 큰 동영상이 필요해지면 코드가 아니라 Supabase 프로젝트 설정을 먼저 올려야 한다.
 */
export const MEDIA_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

export const MEDIA_ACCEPT = [...Object.keys(IMAGE_TYPES), ...Object.keys(VIDEO_TYPES)].join(",");
export const MEDIA_ALLOWED_MIME_TYPES = [...Object.keys(IMAGE_TYPES), ...Object.keys(VIDEO_TYPES)];

export type MediaKind = "image" | "video";

export function kindForMimeType(mimeType: string): MediaKind | null {
  if (IMAGE_TYPES[mimeType]) return "image";
  if (VIDEO_TYPES[mimeType]) return "video";
  return null;
}

export function extensionForMimeType(mimeType: string): string | null {
  return IMAGE_TYPES[mimeType] ?? VIDEO_TYPES[mimeType] ?? null;
}

/**
 * 올려도 되는가. **형식과 크기만** 본다 — 실제 바이트는 서버가 보지 않으므로 내용 검증은
 * 할 수 없다(악성 파일 스캔이 필요하면 별도 파이프라인이 맡아야 한다).
 */
export function validateMediaUpload(file: { mimeType: unknown; size: unknown }): string | null {
  const mimeType = typeof file.mimeType === "string" ? file.mimeType : "";
  const size = typeof file.size === "number" && Number.isFinite(file.size) ? file.size : NaN;

  const kind = kindForMimeType(mimeType);
  if (!kind) return "JPG·PNG·WebP·GIF 사진 또는 MP4·WebM·MOV 동영상만 올릴 수 있어요.";
  if (!Number.isFinite(size) || size <= 0) return "파일 크기를 확인할 수 없어요.";
  if (kind === "image" && size > MEDIA_IMAGE_MAX_BYTES) {
    return `사진은 ${Math.round(MEDIA_IMAGE_MAX_BYTES / (1024 * 1024))}MB 이하로 올려주세요.`;
  }
  if (kind === "video" && size > MEDIA_VIDEO_MAX_BYTES) {
    return `동영상은 ${Math.round(MEDIA_VIDEO_MAX_BYTES / (1024 * 1024))}MB 이하로 올려주세요.`;
  }
  return null;
}

/** 화면에 보여줄 크기 문자열. 1000 단위가 아니라 1024 — 파일시스템 관용을 따른다. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "-";
  if (bytes < 1024) return `${bytes}B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10}${units[i]}`;
}
