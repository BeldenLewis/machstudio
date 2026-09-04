import { createAdminClient } from "@/lib/supabase/admin";
import { MEDIA_ALLOWED_MIME_TYPES, MEDIA_VIDEO_MAX_BYTES } from "@/lib/media-asset";

/**
 * 자료실 전용 버킷 — 웨비나·엑스포 자산과 섞지 않는다.
 *
 * 왜 따로 두나: `webinar-assets` 는 세션 로고·연사 사진처럼 **특정 웨비나에 매인** 파일이고
 * 경로도 `${workspaceId}/${webinarId}/...` 로 그 소유 엔티티를 전제한다. 자료실은 워크스페이스
 * 공용이라 소유 엔티티가 없다 — 버킷을 나누면 두 정책(크기·형식·보존)이 서로 다른 이유로
 * 바뀔 때 한쪽 변경이 다른 쪽 업로드를 조용히 막는 사고(webinar-asset-bucket.ts 머리말 참고)를
 * 원천적으로 피한다.
 */
export const MEDIA_BUCKET = "media-library";

/**
 * 버킷을 만들거나 설정을 맞춘다. 멱등 — 이미 맞춰져 있어도 무해하다.
 * updateBucket 을 계속 호출하는 이유는 webinar-asset-bucket.ts 와 같다: 예전 설정으로 만들어진
 * 배포가 있으면 새 MIME·크기가 영구히 막힌다.
 *
 * [주의] fileSizeLimit 은 **바이트 숫자**로 준다. `"50MB"` 같은 문자열도 받아 주지만, Storage
 * 서버는 그 문자열을 10진 MB(1MB = 1,000,000B)로 해석한다 — 반면 MEDIA_VIDEO_MAX_BYTES 는
 * 2진 MiB(1024*1024)다. 그래서 예전에 `${...}MB` 문자열을 썼을 때 실제 버킷 한도가
 * 50,000,000B 로 잡혀, 우리 앱이 통과시키는 최대 52,428,800B(50MiB) 사이 ~2.3MB 구간의
 * 파일은 검증은 통과하고 실제 업로드에서만 "The object exceeded the maximum allowed size"
 * 로 실패했다(2026-09-04 실제 리포트, 재현·격리 버킷으로 확인). webinar-asset-bucket.ts 는
 * 처음부터 숫자를 써서 이 함정이 없었다 — 여기도 같은 방식으로 맞춘다.
 */
export async function ensureMediaBucket() {
  const admin = createAdminClient();
  const options = {
    public: true,
    fileSizeLimit: MEDIA_VIDEO_MAX_BYTES,
    allowedMimeTypes: MEDIA_ALLOWED_MIME_TYPES,
  };

  const { error: bucketError } = await admin.storage.getBucket(MEDIA_BUCKET);
  if (bucketError) {
    const { error } = await admin.storage.createBucket(MEDIA_BUCKET, options);
    // 동시에 처음 올린 두 요청 중 하나는 "이미 있다" 응답을 받을 수 있다.
    if (error && !/already exists/i.test(error.message)) throw error;
    return admin;
  }

  const { error } = await admin.storage.updateBucket(MEDIA_BUCKET, options);
  if (error) throw error;
  return admin;
}
