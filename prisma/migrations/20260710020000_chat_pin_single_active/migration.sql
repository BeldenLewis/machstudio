-- 채팅 '고정' — 웨비나당 1개 메시지만 상단 고정. 팝업/투표/Q&A 단일활성 패턴 계승.
ALTER TABLE "WebinarChatMessage" ADD COLUMN IF NOT EXISTS "isPinned" BOOLEAN NOT NULL DEFAULT false;

-- 기존 중복 정리(웨비나당 최근 것만 유지) 후 부분 유니크 인덱스
UPDATE "WebinarChatMessage" m SET "isPinned"=false
 WHERE m."isPinned"=true AND m."id" <> (
   SELECT m2."id" FROM "WebinarChatMessage" m2
    WHERE m2."webinarId"=m."webinarId" AND m2."isPinned"=true
    ORDER BY m2."createdAt" DESC LIMIT 1
 );

CREATE UNIQUE INDEX IF NOT EXISTS "WebinarChatMessage_webinarId_pinned_key"
  ON "WebinarChatMessage" ("webinarId") WHERE "isPinned";
