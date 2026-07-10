-- 채팅 모더레이션 전용 컬럼 — components JSON 블롭이 설정탭 전체 저장으로 덮어써지는 lost-update 방지.
ALTER TABLE "Webinar" ADD COLUMN IF NOT EXISTS "chatSlowSec" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Webinar" ADD COLUMN IF NOT EXISTS "chatBannedWords" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "Webinar" ADD COLUMN IF NOT EXISTS "chatBannedRegIds" TEXT[] NOT NULL DEFAULT '{}';
