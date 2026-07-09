-- 세션 유형 (세션/Q&A/브레이크) — WebinarSession.type
-- 추가형·멱등 — 기존 세션은 기본값 'session' 으로 무변경.
-- 적용: node scripts/apply-migration.mjs prisma/migrations/20260709040000_webinar_session_type/migration.sql
-- 순서: DB 선적용 → 코드 배포 (Prisma 7 은 알고 있는 전체 스칼라를 SELECT 하므로 역순이면 P2022)

ALTER TABLE "WebinarSession" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'session';
