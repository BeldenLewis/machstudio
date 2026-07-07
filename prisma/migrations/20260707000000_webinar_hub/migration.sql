-- 웨비나 허브 개편 Phase 1: 스키마 기반 공사 (전부 추가형·멱등 — 기존 동작 무변경)
-- 적용: node scripts/apply-migration.mjs prisma/migrations/20260707000000_webinar_hub/migration.sql
-- 순서: DB 선적용 → 코드 배포 (Prisma 7 은 알고 있는 전체 스칼라를 SELECT 하므로 역순이면 P2022)

-- ① Webinar: 수동 상태 오버라이드 + 임베드 컴포넌트 설정
ALTER TABLE "Webinar" ADD COLUMN IF NOT EXISTS "statusOverride" TEXT;
ALTER TABLE "Webinar" ADD COLUMN IF NOT EXISTS "components" JSONB;

-- ② WebinarRegistration: UTM 어트리뷰션 (CollectRecord 와 동일 구성)
ALTER TABLE "WebinarRegistration" ADD COLUMN IF NOT EXISTS "utmSource" TEXT;
ALTER TABLE "WebinarRegistration" ADD COLUMN IF NOT EXISTS "utmMedium" TEXT;
ALTER TABLE "WebinarRegistration" ADD COLUMN IF NOT EXISTS "utmCampaign" TEXT;
ALTER TABLE "WebinarRegistration" ADD COLUMN IF NOT EXISTS "utmTerm" TEXT;
ALTER TABLE "WebinarRegistration" ADD COLUMN IF NOT EXISTS "utmContent" TEXT;
ALTER TABLE "WebinarRegistration" ADD COLUMN IF NOT EXISTS "utmId" TEXT;
ALTER TABLE "WebinarRegistration" ADD COLUMN IF NOT EXISTS "firstUtmSource" TEXT;
ALTER TABLE "WebinarRegistration" ADD COLUMN IF NOT EXISTS "firstUtmMedium" TEXT;
ALTER TABLE "WebinarRegistration" ADD COLUMN IF NOT EXISTS "firstUtmCampaign" TEXT;
ALTER TABLE "WebinarRegistration" ADD COLUMN IF NOT EXISTS "firstUtmTerm" TEXT;
ALTER TABLE "WebinarRegistration" ADD COLUMN IF NOT EXISTS "firstUtmContent" TEXT;
ALTER TABLE "WebinarRegistration" ADD COLUMN IF NOT EXISTS "firstUtmId" TEXT;
ALTER TABLE "WebinarRegistration" ADD COLUMN IF NOT EXISTS "firstReferrer" TEXT;
ALTER TABLE "WebinarRegistration" ADD COLUMN IF NOT EXISTS "firstSeenAt" TIMESTAMP(3);
ALTER TABLE "WebinarRegistration" ADD COLUMN IF NOT EXISTS "journey" JSONB;
ALTER TABLE "WebinarRegistration" ADD COLUMN IF NOT EXISTS "referrer" TEXT;
ALTER TABLE "WebinarRegistration" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;
ALTER TABLE "WebinarRegistration" ADD COLUMN IF NOT EXISTS "registeredStatus" TEXT;

CREATE INDEX IF NOT EXISTS "WebinarRegistration_webinarId_utmSource_idx"
  ON "WebinarRegistration" ("webinarId", "utmSource");
CREATE INDEX IF NOT EXISTS "WebinarRegistration_webinarId_utmMedium_idx"
  ON "WebinarRegistration" ("webinarId", "utmMedium");

-- ③ WebinarAnnouncement: 공지 CTA 버튼
ALTER TABLE "WebinarAnnouncement" ADD COLUMN IF NOT EXISTS "buttonLabel" TEXT;
ALTER TABLE "WebinarAnnouncement" ADD COLUMN IF NOT EXISTS "buttonUrl" TEXT;

-- ④ WebinarEmbedSite: 사이트 단위 부착 지점 (로더 /w/{id})
CREATE TABLE IF NOT EXISTS "WebinarEmbedSite" (
  "id"                 TEXT NOT NULL,
  "workspaceId"        TEXT NOT NULL,
  "projectId"          TEXT NOT NULL,
  "name"               TEXT NOT NULL,
  "siteUrl"            TEXT,
  "livePageUrl"        TEXT,
  "allowedOrigins"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "bannerPagePatterns" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "activeWebinarId"    TEXT,
  "lastSeenAt"         TIMESTAMP(3),
  "lastSeenOrigin"     TEXT,
  "isActive"           BOOLEAN NOT NULL DEFAULT true,
  "deletedAt"          TIMESTAMP(3),
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebinarEmbedSite_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WebinarEmbedSite_projectId_idx" ON "WebinarEmbedSite" ("projectId");
CREATE INDEX IF NOT EXISTS "WebinarEmbedSite_activeWebinarId_idx" ON "WebinarEmbedSite" ("activeWebinarId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebinarEmbedSite_workspaceId_fkey') THEN
    ALTER TABLE "WebinarEmbedSite" ADD CONSTRAINT "WebinarEmbedSite_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebinarEmbedSite_projectId_fkey') THEN
    ALTER TABLE "WebinarEmbedSite" ADD CONSTRAINT "WebinarEmbedSite_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebinarEmbedSite_activeWebinarId_fkey') THEN
    ALTER TABLE "WebinarEmbedSite" ADD CONSTRAINT "WebinarEmbedSite_activeWebinarId_fkey"
      FOREIGN KEY ("activeWebinarId") REFERENCES "Webinar"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ⑤ WebinarAttendanceSegment: 시청 구간 (시청 곡선 원천)
CREATE TABLE IF NOT EXISTS "WebinarAttendanceSegment" (
  "id"             TEXT NOT NULL,
  "webinarId"      TEXT NOT NULL,
  "registrationId" TEXT NOT NULL,
  "startedAt"      TIMESTAMP(3) NOT NULL,
  "endedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebinarAttendanceSegment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WebinarAttendanceSegment_webinarId_startedAt_idx"
  ON "WebinarAttendanceSegment" ("webinarId", "startedAt");
CREATE INDEX IF NOT EXISTS "WebinarAttendanceSegment_registrationId_endedAt_idx"
  ON "WebinarAttendanceSegment" ("registrationId", "endedAt" DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebinarAttendanceSegment_webinarId_fkey') THEN
    ALTER TABLE "WebinarAttendanceSegment" ADD CONSTRAINT "WebinarAttendanceSegment_webinarId_fkey"
      FOREIGN KEY ("webinarId") REFERENCES "Webinar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebinarAttendanceSegment_registrationId_fkey') THEN
    ALTER TABLE "WebinarAttendanceSegment" ADD CONSTRAINT "WebinarAttendanceSegment_registrationId_fkey"
      FOREIGN KEY ("registrationId") REFERENCES "WebinarRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ⑥ WebinarVisitStat: 부착 페이지 방문 일별 집계 (퍼널 "방문")
--    utmSource/Medium 은 NULL 대신 '' (Postgres unique 의 NULL distinct 회피)
CREATE TABLE IF NOT EXISTS "WebinarVisitStat" (
  "id"        TEXT NOT NULL,
  "webinarId" TEXT NOT NULL,
  "date"      TIMESTAMP(3) NOT NULL,
  "utmSource" TEXT NOT NULL DEFAULT '',
  "utmMedium" TEXT NOT NULL DEFAULT '',
  "visits"    INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "WebinarVisitStat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WebinarVisitStat_webinarId_date_utmSource_utmMedium_key"
  ON "WebinarVisitStat" ("webinarId", "date", "utmSource", "utmMedium");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebinarVisitStat_webinarId_fkey') THEN
    ALTER TABLE "WebinarVisitStat" ADD CONSTRAINT "WebinarVisitStat_webinarId_fkey"
      FOREIGN KEY ("webinarId") REFERENCES "Webinar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ⑦ 백필: 입장 이력이 있는 기존 등록을 1개 구간으로 근사 (leftAt → lastPingAt → enteredAt+stayMinutes → enteredAt 순)
--    NOT EXISTS 로 멱등 — 재실행해도 중복 생성 없음
INSERT INTO "WebinarAttendanceSegment" ("id", "webinarId", "registrationId", "startedAt", "endedAt")
SELECT
  gen_random_uuid()::text,
  r."webinarId",
  r."id",
  r."enteredAt",
  GREATEST(
    r."enteredAt",
    COALESCE(
      r."leftAt",
      r."lastPingAt",
      r."enteredAt" + make_interval(mins => GREATEST(COALESCE(r."stayMinutes", 0), 0))
    )
  )
FROM "WebinarRegistration" r
WHERE r."enteredAt" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "WebinarAttendanceSegment" s WHERE s."registrationId" = r."id"
  );
