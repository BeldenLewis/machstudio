-- Expo 페이지 발행 이력 — 기존 테이블·데이터는 건드리지 않는 순수 추가 마이그레이션.
-- 정책 없이 RLS만 켜고 Data API 역할과 PUBLIC 권한을 모두 회수한다.

BEGIN;

CREATE TABLE "ExpoPageRevision" (
  "id"          TEXT         NOT NULL,
  "pageId"      TEXT         NOT NULL,
  "sequence"    INTEGER      NOT NULL,
  "snapshot"    JSONB        NOT NULL,
  "codeDigest"  TEXT         NOT NULL,
  "publishedBy" TEXT         NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExpoPageRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExpoPageRevision_pageId_sequence_key"
  ON "ExpoPageRevision" ("pageId", "sequence");

CREATE INDEX "ExpoPageRevision_pageId_createdAt_idx"
  ON "ExpoPageRevision" ("pageId", "createdAt" DESC);

ALTER TABLE "ExpoPageRevision"
  ADD CONSTRAINT "ExpoPageRevision_pageId_fkey"
    FOREIGN KEY ("pageId") REFERENCES "ExpoPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExpoPageRevision" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "ExpoPageRevision"
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
