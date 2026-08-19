import sharp from "sharp";

/**
 * 업로드 이미지를 **저장 전에** 줄인다.
 *
 * ── 왜 필요한가 ───────────────────────────────────────────────────────
 * 예전에는 원본을 그대로 저장하고, 화면에서 Supabase 이미지 변환 URL
 * (`/storage/v1/render/image/...`)로 줄여서 썼다. 그런데 그 변환은 **유료 플랜 기능**이고
 * 지금 프로젝트에는 안 켜져 있다 — 변환 URL 이 이미지가 아니라 403 JSON 을 돌려준다:
 *
 *   {"statusCode":"403","error":"FeatureNotEnabled","message":"feature not enabled for this tenant"}
 *
 * 그래서 업로드는 성공하는데(원본 URL 은 200) **화면에는 아무것도 안 보였다.**
 * 공고 히어로 배경이 그랬고, 같은 이유로 웨비나 랜딩·연사 사진도 함께 안 나오고 있었다.
 *
 * 그렇다고 원본을 그대로 서빙할 수도 없다. 예전에 그렇게 했다가 랜딩 1회 로드가 5.24MB 가
 * 됐고, Supabase Cached Egress 쿼터를 태워 Storage 가 402 로 막혀 **라이브 사이트 이미지가
 * 전부 사라진 사고**가 있었다(webinar-image.test.ts 주석).
 *
 * 그래서 줄이는 일을 **업로드 시점으로 옮긴다.** 저장된 것 자체가 작으면
 *  - 변환 기능이 없어도 보이고,
 *  - 원본을 그대로 서빙해도 egress 가 안전하다.
 * 유료 변환에 의존하지 않는 쪽이 이 제품에 맞다.
 *
 * ── 무엇을 안 건드리나 ────────────────────────────────────────────────
 * GIF·SVG·동영상은 그대로 둔다. GIF 는 애니메이션이 죽고, SVG 는 래스터화하면 흐려지면서
 * 오히려 커질 수 있다(webinar-image.ts 의 isSvg 주석과 같은 이유).
 */

/** 긴 변 상한. 히어로가 화면 전체를 덮는 최대 크기라 이 값이 곧 상한이다. */
const MAX_EDGE = 1600;

/** JPEG/WebP 품질. 72 는 기존 변환 프리셋이 쓰던 값이라 결과물 느낌이 안 바뀐다. */
const QUALITY = 72;

/** 이 MIME 만 줄인다 — 나머지는 손대지 않고 원본 그대로 올린다. */
const RESIZABLE = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isResizableImage(contentType: string): boolean {
  return RESIZABLE.has(contentType);
}

export interface DownscaleResult {
  body: Buffer | File;
  contentType: string;
  /** 줄였는가 — 로그·응답에 쓴다(운영자가 "왜 화질이 바뀌었지" 를 물을 때 근거). */
  resized: boolean;
}

/**
 * 줄여서 돌려준다. **실패하면 원본을 그대로 돌려준다** — 업로드 자체가 막히는 것보다
 * 큰 파일이 올라가는 편이 낫다(그건 다음 업로드에서 다시 시도할 수 있는 문제다).
 */
export async function downscaleUpload(file: File): Promise<DownscaleResult> {
  if (!isResizableImage(file.type)) return { body: file, contentType: file.type, resized: false };

  try {
    const input = Buffer.from(await file.arrayBuffer());
    const image = sharp(input, { failOn: "none" });
    const meta = await image.metadata();

    // 이미 충분히 작으면 다시 인코딩하지 않는다 — 손실 압축을 두 번 걸 이유가 없다.
    const longest = Math.max(meta.width ?? 0, meta.height ?? 0);
    if (longest > 0 && longest <= MAX_EDGE && input.byteLength <= 900_000) {
      return { body: file, contentType: file.type, resized: false };
    }

    const pipeline = image.rotate().resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      // 원본보다 키우지 않는다 — 작은 이미지를 늘리면 용량만 늘고 화질은 그대로다.
      withoutEnlargement: true,
    });

    // PNG 는 투명도가 의미를 갖는 경우가 많아(로고) 그대로 PNG 로 둔다.
    const out =
      file.type === "image/png"
        ? await pipeline.png({ compressionLevel: 9, palette: true }).toBuffer()
        : await pipeline.webp({ quality: QUALITY }).toBuffer();

    const contentType = file.type === "image/png" ? "image/png" : "image/webp";
    // 줄였는데 더 커졌으면(작고 단순한 PNG 등) 원본을 쓴다.
    if (out.byteLength >= input.byteLength) return { body: file, contentType: file.type, resized: false };
    return { body: out, contentType, resized: true };
  } catch {
    return { body: file, contentType: file.type, resized: false };
  }
}

/** 저장 경로 확장자 — 변환하면 실제 형식이 바뀌므로 경로도 따라가야 한다. */
export function extensionForContentType(contentType: string, fallback: string): string {
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/png") return "png";
  if (contentType === "image/jpeg") return "jpg";
  return fallback;
}
