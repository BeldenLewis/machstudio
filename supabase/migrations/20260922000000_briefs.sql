-- 브리프(큐레이션 시리즈) — 순수 추가 마이그레이션. 기존 테이블·데이터는 건드리지 않는다.
-- 프로젝트별로 링크를 모아 "채택" 한 것만 카톡 텍스트·공개 페이지로 내보낸다(예: Korea Expo 의 The Action).
-- 단축링크 클릭 기록 테이블도 함께 만든다 — 기존 ShortLink 는 그대로이고 클릭만 따로 쌓는다.
-- 재실행 안전(IF NOT EXISTS). prisma db push 는 쓰지 않는다 — 부분 유니크 인덱스가 날아간다.

BEGIN;

CREATE TABLE IF NOT EXISTS "Brief" (
    "id"               TEXT         NOT NULL,
    "workspaceId"      TEXT         NOT NULL,
    "projectId"        TEXT         NOT NULL,
    "name"             TEXT         NOT NULL,
    "slug"             TEXT         NOT NULL,
    "intro"            TEXT         NOT NULL DEFAULT '',
    "appendPublicLink" BOOLEAN      NOT NULL DEFAULT true,
    "isPublic"         BOOLEAN      NOT NULL DEFAULT true,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt"        TIMESTAMP(3),
    CONSTRAINT "Brief_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Brief_slug_key" ON "Brief" ("slug");
CREATE INDEX IF NOT EXISTS "Brief_projectId_idx" ON "Brief" ("projectId");
CREATE INDEX IF NOT EXISTS "Brief_workspaceId_idx" ON "Brief" ("workspaceId");

DO $$ BEGIN
  ALTER TABLE "Brief" ADD CONSTRAINT "Brief_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "BriefIssue" (
    "id"          TEXT         NOT NULL,
    "briefId"     TEXT         NOT NULL,
    "title"       TEXT         NOT NULL,
    "text"        TEXT         NOT NULL,
    "createdById" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BriefIssue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BriefIssue_briefId_publishedAt_idx"
    ON "BriefIssue" ("briefId", "publishedAt" DESC);

DO $$ BEGIN
  ALTER TABLE "BriefIssue" ADD CONSTRAINT "BriefIssue_briefId_fkey"
    FOREIGN KEY ("briefId") REFERENCES "Brief"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "BriefItem" (
    "id"          TEXT         NOT NULL,
    "briefId"     TEXT         NOT NULL,
    "category"    TEXT         NOT NULL,
    "org"         TEXT         NOT NULL DEFAULT '',
    "title"       TEXT         NOT NULL,
    "url"         TEXT         NOT NULL,
    "urlKey"      TEXT         NOT NULL,
    "dueDate"     TIMESTAMP(3),
    "dateLabel"   TEXT         NOT NULL DEFAULT '',
    "source"      TEXT         NOT NULL DEFAULT 'manual',
    "note"        TEXT         NOT NULL DEFAULT '',
    "adopted"     BOOLEAN      NOT NULL DEFAULT false,
    "issueId"     TEXT,
    "shortLinkId" TEXT,
    "createdById" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BriefItem_pkey" PRIMARY KEY ("id")
);

-- 같은 공고가 여러 소스에서 들어와도 한 브리프 안에서는 한 줄 — 중복의 최종 방어선은 DB 다.
CREATE UNIQUE INDEX IF NOT EXISTS "BriefItem_briefId_urlKey_key" ON "BriefItem" ("briefId", "urlKey");
CREATE UNIQUE INDEX IF NOT EXISTS "BriefItem_shortLinkId_key" ON "BriefItem" ("shortLinkId");
CREATE INDEX IF NOT EXISTS "BriefItem_briefId_category_idx" ON "BriefItem" ("briefId", "category");
CREATE INDEX IF NOT EXISTS "BriefItem_issueId_idx" ON "BriefItem" ("issueId");

DO $$ BEGIN
  ALTER TABLE "BriefItem" ADD CONSTRAINT "BriefItem_briefId_fkey"
    FOREIGN KEY ("briefId") REFERENCES "Brief"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "BriefItem" ADD CONSTRAINT "BriefItem_issueId_fkey"
    FOREIGN KEY ("issueId") REFERENCES "BriefIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "BriefItem" ADD CONSTRAINT "BriefItem_shortLinkId_fkey"
    FOREIGN KEY ("shortLinkId") REFERENCES "ShortLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 단축링크 클릭 — 원본 IP 는 저장하지 않는다. visitorKey 는 (IP·UA·날짜) 해시라 하루 단위 순방문만 셀 수 있다.
CREATE TABLE IF NOT EXISTS "ShortLinkClick" (
    "id"          TEXT         NOT NULL,
    "shortLinkId" TEXT         NOT NULL,
    "channel"     TEXT         NOT NULL DEFAULT 'direct',
    "visitorKey"  TEXT         NOT NULL DEFAULT '',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShortLinkClick_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ShortLinkClick_shortLinkId_createdAt_idx"
    ON "ShortLinkClick" ("shortLinkId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "ShortLinkClick" ADD CONSTRAINT "ShortLinkClick_shortLinkId_fkey"
    FOREIGN KEY ("shortLinkId") REFERENCES "ShortLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
