/**
 * 마하스튜디오 업로드(자료실) — 무엇을 올릴 수 있는가, 그 규칙 한 곳.
 *
 * 형식은 막지 않는다 — 사진·동영상·그 외("파일") 세 가지만 구분한다. 이 구분은 카드에
 * 무엇을 보여줄지(미리보기 이미지인지, 재생 아이콘인지, 확장자 라벨인지)를 가를 뿐이고,
 * 한글(.hwp)·엑셀(.xlsx)·CSV·PDF·zip 같은 문서·압축 파일도 전부 "파일"로 그대로 받는다.
 * 사진·동영상은 MIME 타입으로 판정하지만(브라우저가 이 둘은 일관되게 보고한다), 확장자는
 * **원본 파일 이름**에서 뽑는다 — 문서 파일의 MIME 타입은 브라우저·OS 마다 다르게(또는
 * 비워서) 보고해서 못 믿는다(예: 어떤 브라우저는 .hwp 를 `application/octet-stream`, 어떤
 * 브라우저는 빈 문자열로 보낸다).
 *
 * ── 왜 서버가 파일을 안 보고도 검증하는가 ───────────────────────────────
 * 업로드는 **브라우저가 Storage 로 직접** 보낸다(우리 서버를 거치지 않는다). Vercel 서버리스
 * 함수의 요청 본문 상한이 4.5MB 라, 동영상은커녕 큰 사진도 우리 라우트를 통과할 수 없다
 * (webinar-landing-media 가 50MB 동영상을 그 경로로 받는다고 주석에 적어 뒀지만, 실제로는
 * 4.5MB 를 넘는 순간 Vercel 이 우리 코드가 보기도 전에 413 으로 끊는다 — 이 기능은 그 함정을
 * 그대로 밟지 않는다). 그래서 서버는 **자리를 내주는 역할**만 한다: 클라이언트가 보낸
 * mimeType·size 를 여기서 먼저 재고, 통과하면 서명된 업로드 URL을 만들어 돌려준다.
 * 실제 바이트는 서버를 거치지 않으므로 여기서는 "될 것 같은가" 만 판정하고, 버킷 자체의
 * fileSizeLimit(media-asset-bucket.ts)이 마지막 방어선이다 — allowedMimeTypes 는 모든
 * 형식을 받아야 해서 버킷에도 두지 않는다(제한 없음).
 */

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

/** 사진 상한 — 고해상도 스크린샷·webp 무손실도 넉넉히 들어가게. */
export const MEDIA_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
/**
 * 동영상 상한 — **Vercel 이 아니라 Supabase 프로젝트의 전역 업로드 상한**에 맞춘다.
 *
 * 서버를 거치지 않으니 4.5MB 요청 본문 제약은 없지만, Supabase Storage 는 프로젝트
 * 단위로 업로드 크기 상한을 따로 두고(대시보드 설정, 기본 50MB) 그건 버킷의
 * `fileSizeLimit` 을 아무리 크게 잡아도 못 넘는다 — `createBucket` 이 그 순간
 * "The object exceeded the maximum allowed size"(413) 로 버킷 생성 자체를 거절한다.
 * 실측(2026-09-02, 이 프로젝트, raw 바이트 숫자 기준): 52,428,800(=50MiB) 은 되고
 * 52,900,000 부터 막힌다. 기존 `webinar-assets` 버킷이 쓰는 값(webinar-asset-bucket.ts)과
 * 맞춰 50MiB 로 둔다 — 이미 검증된 값이다. **fileSizeLimit 은 반드시 숫자(바이트)로 줄 것**
 * — 문자열 "50MB"는 Storage 가 10진 MB(50,000,000B)로 해석해 이 값보다 낮아진다
 * (media-asset-bucket.ts 의 실제 사고 사례 참고). 더 큰 동영상이 필요해지면 코드가 아니라
 * Supabase 프로젝트 설정을 먼저 올려야 한다.
 */
export const MEDIA_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
/**
 * 사진·동영상이 아닌 나머지(문서·압축 파일 등) 상한. 버킷 자체 한도는 여전히
 * MEDIA_VIDEO_MAX_BYTES 다 — Storage 는 파일 종류별로 다른 한도를 두지 못해서 버킷은
 * 가장 큰 값(동영상)에 맞춰져 있고, 이 값은 그 안에서 앱이 문서용으로 더 좁혀 안내하는
 * 값일 뿐이다. 한글·엑셀·CSV·PDF 는 대개 몇 MB 안팎이라 30MB 면 넉넉하다.
 */
export const MEDIA_FILE_MAX_BYTES = 30 * 1024 * 1024;

export type MediaKind = "image" | "video" | "file";

/** 총 함수 — 알려진 사진·동영상 MIME 이 아니면 전부 "file"(그 외 전부 받는다). */
export function kindForMimeType(mimeType: string): MediaKind {
  if (IMAGE_MIME_TYPES.has(mimeType)) return "image";
  if (VIDEO_MIME_TYPES.has(mimeType)) return "video";
  return "file";
}

/**
 * 원본 파일 이름에서 확장자를 뽑는다(소문자, 점 제외). 못 뽑으면 빈 문자열 —
 * 호출부가 대신 저장 경로에 확장자 없이 쓰거나 기본값을 붙인다.
 */
export function extensionFromFilename(name: string): string {
  const trimmed = typeof name === "string" ? name.trim() : "";
  const dot = trimmed.lastIndexOf(".");
  if (dot <= 0 || dot === trimmed.length - 1) return "";
  const ext = trimmed.slice(dot + 1).toLowerCase();
  // 확장자치고 너무 길거나 이상한 문자가 섞였으면(파일 이름 자체가 이상한 경우) 못 믿는다.
  if (!/^[a-z0-9]{1,12}$/.test(ext)) return "";
  return ext;
}

function maxBytesForKind(kind: MediaKind): number {
  if (kind === "image") return MEDIA_IMAGE_MAX_BYTES;
  if (kind === "video") return MEDIA_VIDEO_MAX_BYTES;
  return MEDIA_FILE_MAX_BYTES;
}

function labelForKind(kind: MediaKind): string {
  if (kind === "image") return "사진";
  if (kind === "video") return "동영상";
  return "파일";
}

/**
 * 올려도 되는가. **크기만** 본다(형식은 막지 않는다) — 실제 바이트는 서버가 보지
 * 않으므로 내용 검증은 할 수 없다(악성 파일 스캔이 필요하면 별도 파이프라인이 맡아야 한다).
 */
export function validateMediaUpload(file: { mimeType: unknown; size: unknown }): string | null {
  const mimeType = typeof file.mimeType === "string" ? file.mimeType : "";
  const size = typeof file.size === "number" && Number.isFinite(file.size) ? file.size : NaN;

  if (!Number.isFinite(size) || size <= 0) return "파일 크기를 확인할 수 없어요.";

  const kind = kindForMimeType(mimeType);
  const max = maxBytesForKind(kind);
  if (size > max) {
    return `${labelForKind(kind)}은(는) ${Math.round(max / (1024 * 1024))}MB 이하로 올려주세요.`;
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
