-- Q&A 추천(Phase 2): WebinarQA.voteCount + WebinarQAVote
-- 추가형·멱등 — 기존 동작 무변경.
-- 적용: node scripts/apply-migration.mjs prisma/migrations/20260709030000_webinar_qa_vote/migration.sql
-- 순서: DB 선적용 → 코드 배포 (Prisma 7 은 알고 있는 전체 스칼라를 SELECT 하므로 역순이면 P2022)

ALTER TABLE "WebinarQA" ADD COLUMN IF NOT EXISTS "voteCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "WebinarQAVote" (
  "id"             TEXT NOT NULL,
  "qaId"           TEXT NOT NULL,
  "registrationId" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebinarQAVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WebinarQAVote_qaId_registrationId_key" ON "WebinarQAVote" ("qaId", "registrationId");
CREATE INDEX IF NOT EXISTS "WebinarQAVote_qaId_idx" ON "WebinarQAVote" ("qaId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebinarQAVote_qaId_fkey') THEN
    ALTER TABLE "WebinarQAVote" ADD CONSTRAINT "WebinarQAVote_qaId_fkey"
      FOREIGN KEY ("qaId") REFERENCES "WebinarQA"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
