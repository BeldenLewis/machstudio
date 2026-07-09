-- 실시간 투표(Phase 2): WebinarPoll / WebinarPollOption / WebinarPollVote
-- 전부 추가형·멱등 — 기존 동작 무변경.
-- 적용: node scripts/apply-migration.mjs prisma/migrations/20260709000000_webinar_poll/migration.sql
-- 순서: DB 선적용 → 코드 배포 (Prisma 7 은 알고 있는 전체 스칼라를 SELECT 하므로 역순이면 P2022)

-- ① WebinarPoll
CREATE TABLE IF NOT EXISTS "WebinarPoll" (
  "id"        TEXT NOT NULL,
  "webinarId" TEXT NOT NULL,
  "question"  TEXT NOT NULL,
  "isActive"  BOOLEAN NOT NULL DEFAULT false,
  "sentBy"    TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebinarPoll_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WebinarPoll_webinarId_isActive_idx" ON "WebinarPoll" ("webinarId", "isActive");

-- ② WebinarPollOption
CREATE TABLE IF NOT EXISTS "WebinarPollOption" (
  "id"        TEXT NOT NULL,
  "pollId"    TEXT NOT NULL,
  "label"     TEXT NOT NULL,
  "order"     INTEGER NOT NULL DEFAULT 0,
  "voteCount" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "WebinarPollOption_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WebinarPollOption_pollId_order_idx" ON "WebinarPollOption" ("pollId", "order");

-- ③ WebinarPollVote
CREATE TABLE IF NOT EXISTS "WebinarPollVote" (
  "id"             TEXT NOT NULL,
  "pollId"         TEXT NOT NULL,
  "optionId"       TEXT NOT NULL,
  "registrationId" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebinarPollVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WebinarPollVote_pollId_registrationId_key" ON "WebinarPollVote" ("pollId", "registrationId");
CREATE INDEX IF NOT EXISTS "WebinarPollVote_pollId_idx" ON "WebinarPollVote" ("pollId");

-- ④ 외래키 (멱등 가드)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebinarPoll_webinarId_fkey') THEN
    ALTER TABLE "WebinarPoll" ADD CONSTRAINT "WebinarPoll_webinarId_fkey"
      FOREIGN KEY ("webinarId") REFERENCES "Webinar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebinarPollOption_pollId_fkey') THEN
    ALTER TABLE "WebinarPollOption" ADD CONSTRAINT "WebinarPollOption_pollId_fkey"
      FOREIGN KEY ("pollId") REFERENCES "WebinarPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebinarPollVote_pollId_fkey') THEN
    ALTER TABLE "WebinarPollVote" ADD CONSTRAINT "WebinarPollVote_pollId_fkey"
      FOREIGN KEY ("pollId") REFERENCES "WebinarPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebinarPollVote_optionId_fkey') THEN
    ALTER TABLE "WebinarPollVote" ADD CONSTRAINT "WebinarPollVote_optionId_fkey"
      FOREIGN KEY ("optionId") REFERENCES "WebinarPollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
