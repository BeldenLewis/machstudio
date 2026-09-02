-- 마하스튜디오 업로드(자료실) — 순수 추가 마이그레이션. 기존 테이블·데이터는 건드리지 않는다.
-- 특정 웨비나·대회·홈페이지에 매이지 않는 워크스페이스 공용 자산 테이블 하나만 새로 만든다.
-- 재실행 안전(IF NOT EXISTS). prisma db push 는 쓰지 않는다 — 부분 유니크 인덱스가 날아간다.

BEGIN;

CREATE TABLE IF NOT EXISTS "MediaAsset" (
    "id"           TEXT         NOT NULL,
    "workspaceId"  TEXT         NOT NULL,
    "projectId"    TEXT,
    "createdById"  TEXT         NOT NULL,
    "kind"         TEXT         NOT NULL,
    "path"         TEXT         NOT NULL,
    "url"          TEXT         NOT NULL,
    "mimeType"     TEXT         NOT NULL,
    "size"         INTEGER      NOT NULL,
    "originalName" TEXT         NOT NULL,
    "width"        INTEGER,
    "height"       INTEGER,
    "durationSec"  INTEGER,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MediaAsset_path_key"
    ON "MediaAsset" ("path");

CREATE INDEX IF NOT EXISTS "MediaAsset_workspaceId_createdAt_idx"
    ON "MediaAsset" ("workspaceId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "MediaAsset_projectId_createdAt_idx"
    ON "MediaAsset" ("projectId", "createdAt" DESC);

DO $$ BEGIN
  ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
