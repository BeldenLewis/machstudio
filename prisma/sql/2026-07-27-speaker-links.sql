-- 연사 링크: 홈페이지 1개 + SNS 여러 개 (랜딩 연사 상세 팝업)
--
-- speakerLinks 는 URL 문자열 배열이다. 플랫폼(LinkedIn·Instagram…)을 함께 저장하지 않는
-- 이유는 호스트로 판정할 수 있고, 같이 저장하면 라벨과 주소가 어긋난 행이 생기기 때문이다.
-- 정본 판정은 src/lib/webinar-speaker-links.ts.
ALTER TABLE "WebinarSession" ADD COLUMN IF NOT EXISTS "speakerHomepage" TEXT;
ALTER TABLE "WebinarSession" ADD COLUMN IF NOT EXISTS "speakerLinks" JSONB;
