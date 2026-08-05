/**
 * Supabase Storage 이미지 변환 URL — **표시용 크기로 줄여 받는다.**
 *
 * 왜 생겼나: 업로드 원본을 `/object/public/` 로 그대로 서빙하고 있었다. 실측한 이 웨비나의
 * 랜딩 1회 로드가 **5.24 MB**(히어로 PNG 3.1MB + 연사 사진 4장 1.8MB + 로고 4장 0.4MB)였고,
 * 그게 Supabase Cached Egress 쿼터를 태워 Storage 가 402 로 차단됐다(라이브 사이트의 모든
 * 이미지가 안 보이는 사고). 같은 파일을 변환 URL 로 받으면 **0.19 MB(96%↓)** 다 —
 * 52px 원형 아바타에 806px 원본을 보내던 걸 멈추는 것뿐이라 화질 손실은 없다.
 *
 * ## 반드시 resize=contain 을 명시한다 (이걸 빼면 이미지가 잘린다)
 * Supabase 변환의 기본 모드는 `cover`(꽉 채우며 크롭)다. `width=240` 만 주면 **높이를 원본
 * 값으로 유지한 채 폭만 잘라낸다** — 실측: 1926×352 와이드 로고가 240×352 로 크롭돼
 * 글자가 "UT" 만 남았다. 그래서 이 모듈은 항상
 *   · `resize=contain` (비율 유지, 지정한 상자 **안에** 맞춤)
 *   · 폭·높이를 **상자로** 지정
 * 로 요청하고, 최종 크롭은 CSS(`object-fit: cover`)에 맡긴다. 그러면 어떤 비율의 원본이
 * 올라와도 변환 단계에서 왜곡·크롭이 생기지 않는다.
 *
 * ## 원본은 건드리지 않는다
 * 업로드는 원본을 그대로 저장한다(파기하면 나중에 크게 쓸 때 복구할 수 없다). 이 함수는
 * **읽는 쪽**만 바꾸므로, 화질이 아쉬우면 폭·품질 숫자만 올리면 즉시 되돌아온다.
 *
 * React 를 import 하지 않는다 — 랜딩 임베드 런타임(호스트 DOM 번들)에서도 쓴다.
 */

/** 변환 상자 + 품질. width/height 는 "이 안에 들어가게" 라는 뜻이다(잘라내는 크기가 아니다). */
export interface ImageTransform {
  width: number;
  height: number;
  /** 1~100. 사진은 75~80, 로고·글자는 90 이상(낮으면 경계에 링잉이 보인다). */
  quality: number;
}

/**
 * 용도별 상자 — **표시 크기 × 2**(레티나)로 잡는다. 근거는 실측한 CSS 값:
 *   · 세션 카드 사진: 카드 폭 max 372px, A4 비율(210/297) 배경 → 744 상자
 *   · 모달 사진: 모달 절반 칼럼(~400px) → 800 상자
 *   · 모달 아바타: 52×52 원형 → 104 상자
 *   · 로고: 120×26 (SESSION_LOGO_WIDTH/HEIGHT) → 높이 52 기준, 폭은 와이드 로고가
 *     안 눌리게 넉넉히(480). contain 이라 실제로는 비율대로 축소된다.
 *   · 히어로: 뷰포트 전체 배경 → 1600 상자(그 이상은 육안 이득 없이 바이트만 늘어난다)
 */
export const IMAGE_PRESETS = {
  heroBackground: { width: 1600, height: 1600, quality: 72 },
  sessionCardPhoto: { width: 744, height: 1200, quality: 78 },
  modalPhoto: { width: 800, height: 1200, quality: 80 },
  modalAvatar: { width: 104, height: 104, quality: 80 },
  sessionLogo: { width: 480, height: 52, quality: 92 },
  /**
   * 랜딩 최하단 스폰서 로고 — 슬롯 148×44 의 레티나 2배.
   * 세션 로고보다 큰 이유: 스폰서 벽은 로고가 주인공이라 슬롯 자체를 크게 잡았다
   * (세션 로고는 한 줄 안에 곁들여지는 마크다). 글자 로고가 많아 품질은 92 로 같다.
   */
  sponsorLogo: { width: 296, height: 88, quality: 92 },
  /** 어드민 편집 화면의 작은 썸네일 — 운영자만 보므로 더 작게. */
  adminThumb: { width: 240, height: 240, quality: 78 },
  /** 어드민 히어로 미리보기(h-28 ≈ 112px 높이, 카드 폭) */
  adminHeroPreview: { width: 800, height: 400, quality: 75 },
} as const satisfies Record<string, ImageTransform>;

/** Supabase Storage 공개 객체 경로. 이 문자열이 있어야 변환 엔드포인트로 바꿀 수 있다. */
const OBJECT_PATH = "/storage/v1/object/public/";
const RENDER_PATH = "/storage/v1/render/image/public/";

/**
 * SVG 는 변환하지 않는다 — 벡터를 래스터화하면 **흐려지고 용량도 커질 수 있다**(줄이려는
 * 목적과 반대). 확장자와 쿼리스트링을 함께 보고 판단한다.
 */
function isSvg(url: string): boolean {
  const path = url.split("?")[0].toLowerCase();
  return path.endsWith(".svg") || path.endsWith(".svgz");
}

/**
 * 표시용 변환 URL. 바꿀 수 없는 입력이면 **원본을 그대로 돌려준다**(빈 화면보다 낫다):
 *   · 우리 Storage 공개 URL 이 아님(어드민이 붙여넣은 외부 이미지 등)
 *   · 이미 변환 URL(중복 변환 방지)
 *   · SVG
 *   · 빈 값
 */
export function transformedImageUrl(
  url: string | null | undefined,
  preset: ImageTransform,
): string {
  if (!url) return "";
  const raw = url.trim();
  if (!raw) return "";
  if (raw.includes(RENDER_PATH)) return raw; // 이미 변환됨
  if (!raw.includes(OBJECT_PATH)) return raw; // 우리 Storage 가 아님 — 손대지 않는다
  if (isSvg(raw)) return raw;

  const [base, existingQuery] = raw.split("?");
  const rendered = base.replace(OBJECT_PATH, RENDER_PATH);
  const params = new URLSearchParams(existingQuery || "");
  params.set("width", String(preset.width));
  params.set("height", String(preset.height));
  params.set("quality", String(preset.quality));
  // 이 한 줄이 크롭 사고를 막는다 — 위 주석 참고. 기본값(cover)에 절대 맡기지 않는다.
  params.set("resize", "contain");
  return `${rendered}?${params.toString()}`;
}
