/**
 * 홈페이지 이미지의 **엄격한 검증** — Storage 에 닿기 전에 끝낸다.
 *
 * ── 왜 기존 검증기를 안 쓰나 ──────────────────────────────────────────
 * `validateLandingMedia` 는 웨비나 랜딩이 쓰는 것이고 **영상까지** 받는다(5MB/50MB).
 * 홈페이지 W1 은 이미지만이고, 그 파일이 파트너 사이트에 임베드되어 나가므로 더 좁게 잡는다.
 * 그리고 그쪽을 고치면 웨비나 랜딩·연사 사진·라이브 화면이 같이 흔들린다 —
 * 9/1 오픈을 앞두고 건드릴 자리가 아니다.
 *
 * ── 선언과 실제가 다를 수 있다 ────────────────────────────────────────
 * `Content-Type` 은 업로드하는 쪽이 **정하는 값**이다. `image/png` 라고 적고 SVG 를 올리면
 * 그 파일이 우리 Storage 에서 서빙되고, SVG 는 스크립트를 담을 수 있다.
 * 그래서 **바이트를 직접 읽어** 실제 형식을 확인한다(매직 넘버).
 *
 * ── 축소는 실패할 수 있다 ─────────────────────────────────────────────
 * 공용 `downscaleUpload` 는 실패하면 **원본을 그대로 돌려준다**(fail-open). 그 동작을
 * 바꾸지 않는다 — 다른 소비처가 그걸 전제로 돈다. 대신 여기서 **결과를 다시 재고**,
 * 상한을 넘으면 원본을 저장하는 대신 거절한다.
 * (Supabase 이미지 변환은 유료라 403 이 난다 — 줄이는 일은 업로드 시점이 정본이다.)
 */

/** 받는 형식. GIF·SVG·영상은 받지 않는다. */
export const EXPO_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const EXPO_IMAGE_LIMITS = {
  /** 원본 상한 — Vercel 함수 요청 한도 아래로 잡는다. */
  sourceBytes: 4 * 1024 * 1024,
  /** 축소 뒤 저장 상한. */
  storedBytes: 1.5 * 1024 * 1024,
  /** 축소 뒤 긴 변. */
  maxEdge: 1600,
  /** 디코딩 전에 막는 픽셀 수 — 압축 폭탄 방어. */
  maxPixels: 50_000_000,
} as const;

export type ImageRejection =
  | "type-not-allowed"
  | "too-large"
  | "content-mismatch"
  | "unreadable"
  | "too-many-pixels"
  | "downscale-failed";

export const EXPO_IMAGE_MESSAGES: Record<ImageRejection, string> = {
  "type-not-allowed": "JPG·PNG·WebP 만 올릴 수 있어요",
  "too-large": `이미지는 ${Math.round(EXPO_IMAGE_LIMITS.sourceBytes / (1024 * 1024))}MB까지예요`,
  "content-mismatch": "파일 형식이 확장자와 달라요",
  "unreadable": "이미지를 읽을 수 없어요. 다른 파일로 시도해 주세요",
  "too-many-pixels": "이미지가 너무 커요. 크기를 줄여서 올려 주세요",
  "downscale-failed": "이미지를 줄이지 못했어요. 더 작은 파일로 올려 주세요",
};

/**
 * 바이트 앞머리로 **실제 형식**을 판정한다. 선언한 MIME 을 믿지 않는다.
 * 모르면 null — 호출부가 불일치로 다룬다.
 */
export function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  const b = bytes;
  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
    && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  // WebP: "RIFF" .... "WEBP"
  const ascii = (i: number, s: string) => s.split("").every((c, k) => b[i + k] === c.charCodeAt(0));
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
  // 여기부터는 **거절 대상**이지만 무엇인지 알면 문구가 정확해진다.
  if (ascii(0, "GIF8")) return "image/gif";
  const head = new TextDecoder().decode(b.subarray(0, 200)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || head.startsWith("<?xml")) return "image/svg+xml";
  if (ascii(4, "ftyp")) return "video/mp4";
  return null;
}

/**
 * Storage 로 보내기 전 검사. **디코딩 전에** 형식·크기를 끝낸다.
 */
export function checkUploadCandidate(input: { declaredType: string; bytes: Uint8Array }): ImageRejection | null {
  const declared = input.declaredType.split(";")[0].trim().toLowerCase();
  if (!(EXPO_IMAGE_TYPES as readonly string[]).includes(declared)) return "type-not-allowed";
  if (input.bytes.length > EXPO_IMAGE_LIMITS.sourceBytes) return "too-large";

  const actual = sniffImageType(input.bytes);
  if (!actual) return "unreadable";
  // 선언과 실제가 다르면 거절한다 — image/png 로 적고 SVG 를 올리는 경로를 막는다.
  if (actual !== declared) return "content-mismatch";
  return null;
}

/** 메타데이터를 읽은 뒤 — 픽셀 수가 과한 이미지는 축소 자체가 위험하다. */
export function checkDecodedMetadata(meta: { width?: number; height?: number; format?: string }): ImageRejection | null {
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w <= 0 || h <= 0) return "unreadable";
  if (w * h > EXPO_IMAGE_LIMITS.maxPixels) return "too-many-pixels";
  return null;
}

/**
 * 축소 **결과**를 다시 잰다.
 *
 * 공용 헬퍼가 실패하면 원본을 그대로 돌려주므로(fail-open), 여기서 상한을 넘으면
 * **원본을 저장하는 대신 거절**한다. 그러지 않으면 5MB 짜리가 파트너 사이트마다 로드된다.
 */
export function checkDownscaled(result: { bytes: number; width?: number; height?: number }): ImageRejection | null {
  if (result.bytes > EXPO_IMAGE_LIMITS.storedBytes) return "downscale-failed";
  const longest = Math.max(result.width ?? 0, result.height ?? 0);
  if (longest > EXPO_IMAGE_LIMITS.maxEdge) return "downscale-failed";
  return null;
}

/** 이 사이트가 소유한 Storage 경로인가 — 지우거나 복사할 때 경계를 벗어나지 않게. */
export function expoObjectPrefix(workspaceId: string, siteId: string): string {
  return `${workspaceId}/expo/${siteId}/`;
}

export function isOwnedExpoObject(path: string, workspaceId: string, siteId: string): boolean {
  const prefix = expoObjectPrefix(workspaceId, siteId);
  // 정확히 그 접두사여야 한다 — `..` 이나 다른 사이트 경로가 섞이면 안 된다.
  return path.startsWith(prefix) && !path.slice(prefix.length).includes("/") && !path.includes("..");
}
