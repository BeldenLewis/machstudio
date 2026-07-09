-- 알림 구독(Phase 2): WebinarReminder
-- 추가형·멱등 — 기존 동작 무변경.
-- 적용: node scripts/apply-migration.mjs prisma/migrations/20260709020000_webinar_reminder/migration.sql
-- 순서: DB 선적용 → 코드 배포 (Prisma 7 은 알고 있는 전체 스칼라를 SELECT 하므로 역순이면 P2022)

CREATE TABLE IF NOT EXISTS "WebinarReminder" (
  "id"             TEXT NOT NULL,
  "webinarId"      TEXT NOT NULL,
  "registrationId" TEXT,
  "email"          TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebinarReminder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WebinarReminder_webinarId_email_key" ON "WebinarReminder" ("webinarId", "email");
CREATE INDEX IF NOT EXISTS "WebinarReminder_webinarId_idx" ON "WebinarReminder" ("webinarId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebinarReminder_webinarId_fkey') THEN
    ALTER TABLE "WebinarReminder" ADD CONSTRAINT "WebinarReminder_webinarId_fkey"
      FOREIGN KEY ("webinarId") REFERENCES "Webinar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
