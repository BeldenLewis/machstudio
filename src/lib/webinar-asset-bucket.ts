import { createAdminClient } from "@/lib/supabase/admin";
import { LANDING_MEDIA_MIME_TYPES } from "@/lib/webinar-landing-media";
import { SESSION_IMAGE_MIME_TYPES } from "@/lib/webinar-speaker-photo";

/**
 * 업로드 버킷 설정 한 곳 — 세 라우트(연사 사진 · 세션 로고 · 랜딩 히어로)가 **버킷 하나를 공유한다.**
 *
 * 왜 합쳤나: 각 라우트가 자기 ensureAssetBucket 을 들고 있었고 둘의 동작이 달랐다.
 *  - speaker-photo: getBucket 성공 시 즉시 return → 거기 적힌 fileSizeLimit "5MB" 는 **죽은 설정**이다.
 *  - landing-media: **매 업로드마다** updateBucket 으로 allowedMimeTypes 를 자기가 아는 목록으로 덮는다.
 * 그래서 한 라우트에서 새 MIME 을 허용해도 다른 라우트 업로드 한 번에 지워지고, 그 뒤 새 종류만
 * Supabase 단계에서 실패한다 — 우리 코드 어디에도 원인이 보이지 않는 실패다. 목록을 여기서
 * 한 번만 합집합으로 만들면 그 경합이 구조적으로 사라진다.
 */
export const ASSET_BUCKET = "webinar-assets";

/** 버킷에 올라갈 수 있는 전체 MIME. 종류별 제한은 각 validate 함수가 따로 본다(여기가 상한선). */
export const ASSET_BUCKET_MIME_TYPES = [
  ...new Set([...SESSION_IMAGE_MIME_TYPES, ...LANDING_MEDIA_MIME_TYPES]),
];

/**
 * 버킷 전체 상한은 가장 큰 종류(랜딩 동영상 50MB)에 맞춘다. 이미지 종류의 실제 한도는
 * validateSpeakerPhoto/validateSessionLogo 의 4MB 이고, 그 4MB 는 Vercel 요청 본문
 * 상한 4.5MB 아래로 맞춘 값이다(webinar-speaker-photo.ts 주석 참고).
 */
const ASSET_BUCKET_SIZE_LIMIT = "50MB";

/**
 * 버킷을 만들거나 설정을 맞춘다. 멱등 — 이미 맞춰져 있어도 무해하다.
 * updateBucket 을 계속 호출하는 이유: 버킷이 예전 설정(이미지 전용·5MB)으로 만들어진
 * 배포가 있어서, 생성 시점 설정만 믿으면 동영상·새 MIME 이 영구히 막힌다.
 */
export async function ensureAssetBucket() {
  const admin = createAdminClient();
  const options = {
    public: true,
    fileSizeLimit: ASSET_BUCKET_SIZE_LIMIT,
    allowedMimeTypes: ASSET_BUCKET_MIME_TYPES,
  };

  const { error: bucketError } = await admin.storage.getBucket(ASSET_BUCKET);
  if (bucketError) {
    const { error } = await admin.storage.createBucket(ASSET_BUCKET, options);
    // 동시에 처음 올린 두 요청 중 하나는 "이미 있다" 응답을 받을 수 있다.
    if (error && !/already exists/i.test(error.message)) throw error;
    return admin;
  }

  const { error } = await admin.storage.updateBucket(ASSET_BUCKET, options);
  if (error) throw error;
  return admin;
}
