-- 브리프 자동 수집 — 소스(어디서 긁어올지)와 후보 숨김.
-- 추가만 한다. 기존 행·열은 건드리지 않는다.
BEGIN;

CREATE TABLE IF NOT EXISTS "BriefSource" (
  "id"          TEXT PRIMARY KEY,
  "briefId"     TEXT NOT NULL,
  -- bizinfo(기업마당 분야 목록) · googlenews(검색어) · rss(임의 피드)
  "kind"        TEXT NOT NULL,
  "name"        TEXT NOT NULL DEFAULT '',
  -- 종류별 설정: {"hashCode":"07","pages":3} / {"query":"K-뷰티 수출"} / {"url":"https://..."}
  "config"      JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- 들어온 링크의 분류. auto = 제목으로 지원사업/행사를 가른다
  "category"    TEXT NOT NULL DEFAULT 'auto',
  "enabled"     BOOLEAN NOT NULL DEFAULT true,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "lastRunAt"   TIMESTAMP(3),
  "lastAdded"   INTEGER NOT NULL DEFAULT 0,
  "lastError"   TEXT NOT NULL DEFAULT '',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "BriefSource_briefId_idx" ON "BriefSource"("briefId");

DO $$ BEGIN
  ALTER TABLE "BriefSource" ADD CONSTRAINT "BriefSource_briefId_fkey"
    FOREIGN KEY ("briefId") REFERENCES "Brief"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 자동 수집 후보를 "숨기기" 한 흔적. 지우면 다음 수집 때 같은 공고가 또 들어오므로 행은 남긴다.
ALTER TABLE "BriefItem" ADD COLUMN IF NOT EXISTS "dismissedAt" TIMESTAMP(3);
-- 원문 게시 시각(뉴스) — 후보 정렬과 오래된 뉴스 숨김에 쓴다
ALTER TABLE "BriefItem" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);
ALTER TABLE "BriefItem" ADD COLUMN IF NOT EXISTS "sourceId" TEXT;

DO $$ BEGIN
  ALTER TABLE "BriefItem" ADD CONSTRAINT "BriefItem_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "BriefSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
