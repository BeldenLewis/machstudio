-- 공지 웨비나당 활성 1개 보장(부분 유니크 인덱스).
-- 팝업·투표·Tally·Q&A·채팅고정·설문은 이미 같은 규약이 있는데 공지만 앱 레벨 라디오뿐이었다 →
-- 동시 활성화 시 시청자 화면에 공지가 2개 뜰 수 있었다.
-- 멱등(IF NOT EXISTS). apply-migration.mjs 가 파일 전체를 한 트랜잭션으로 실행한다.

-- 1) 기존 중복 활성 정리 — 웨비나별 최신(createdAt) 1개만 남기고 나머지 OFF.
--    (WebinarAnnouncement 에는 updatedAt 이 없어 createdAt 기준으로 판단한다)
UPDATE "WebinarAnnouncement" a SET "isActive"=false
 WHERE a."isActive"=true AND a."id" <> (
   SELECT a2."id" FROM "WebinarAnnouncement" a2
    WHERE a2."webinarId"=a."webinarId" AND a2."isActive"=true
    ORDER BY a2."createdAt" DESC, a2."id" DESC LIMIT 1);

CREATE UNIQUE INDEX IF NOT EXISTS "WebinarAnnouncement_webinarId_active_key"
  ON "WebinarAnnouncement" ("webinarId") WHERE "isActive";
