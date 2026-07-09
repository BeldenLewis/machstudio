-- 실시간 채팅(Phase 2): WebinarChatMessage
-- 추가형·멱등 — 기존 동작 무변경.
-- 적용: node scripts/apply-migration.mjs prisma/migrations/20260709010000_webinar_chat/migration.sql
-- 순서: DB 선적용 → 코드 배포 (Prisma 7 은 알고 있는 전체 스칼라를 SELECT 하므로 역순이면 P2022)

CREATE TABLE IF NOT EXISTS "WebinarChatMessage" (
  "id"             TEXT NOT NULL,
  "webinarId"      TEXT NOT NULL,
  "registrationId" TEXT,
  "name"           TEXT NOT NULL,
  "message"        TEXT NOT NULL,
  "isHost"         BOOLEAN NOT NULL DEFAULT false,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebinarChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WebinarChatMessage_webinarId_createdAt_idx" ON "WebinarChatMessage" ("webinarId", "createdAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebinarChatMessage_webinarId_fkey') THEN
    ALTER TABLE "WebinarChatMessage" ADD CONSTRAINT "WebinarChatMessage_webinarId_fkey"
      FOREIGN KEY ("webinarId") REFERENCES "Webinar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
