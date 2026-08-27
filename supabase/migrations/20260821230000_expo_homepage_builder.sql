-- 홈페이지(전시 웹사이트 빌더) — 순수 추가 스키마.
--
-- ── 이 파일의 규칙 ────────────────────────────────────────────────────
-- · 기존 테이블을 **한 컬럼도** 건드리지 않는다. drop/truncate/update/delete 가 없다.
-- · 부분 유니크 인덱스를 만들지 않는다 — 기존 10개는 그대로 남는다
--   (스키마로 표현할 수 없어 db push 가 지우는 그 인덱스들이다).
-- · `IF NOT EXISTS` 를 쓰지 않는다. 어중간하게 적용된 스키마 위에 덧씌우는 것보다,
--   **중단되고 사람이 보는 것**이 낫다. 전체가 한 트랜잭션이라 실패하면 아무것도 안 남는다.
-- · Expo 테이블은 서버 라우트(Prisma)만 접근한다. 그래서 RLS 를 켜되 **정책을 만들지 않고**,
--   Data API 롤(anon/authenticated/service_role)과 PUBLIC 의 테이블 권한을 회수한다.
--   정책 없이 RLS 만 켜면 소유자·직접 접속 롤 외에는 아무것도 못 읽는다 — 의도한 상태다.
--
-- 적용 뒤 확인: node scripts/check-expo-schema.mjs --expect=ready --url=<세션 URL>

BEGIN;

CREATE TABLE "ExpoSite" (
  "id"              TEXT         NOT NULL,
  "workspaceId"     TEXT         NOT NULL,
  "projectId"       TEXT         NOT NULL,
  "name"            TEXT         NOT NULL,
  "theme"           JSONB        NOT NULL,
  "collectSourceId" TEXT,
  "defaultLocale"   TEXT         NOT NULL DEFAULT 'ko',
  "previewToken"    TEXT,
  "siteUrl"         TEXT,
  "deletedAt"       TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExpoSite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExpoPage" (
  "id"             TEXT         NOT NULL,
  "siteId"         TEXT         NOT NULL,
  "parentId"       TEXT,
  "slug"           TEXT         NOT NULL,
  "title"          TEXT         NOT NULL,
  "isHome"         BOOLEAN      NOT NULL DEFAULT false,
  "sortOrder"      INTEGER      NOT NULL DEFAULT 0,
  "draft"          JSONB        NOT NULL,
  "draftRevision"  INTEGER      NOT NULL DEFAULT 0,
  "published"      JSONB,
  "publishedAt"    TIMESTAMP(3),
  "liveAt"         TIMESTAMP(3),
  "imwebUrl"       TEXT,
  "lastSeenAt"     TIMESTAMP(3),
  "lastSeenOrigin" TEXT,
  "deletedAt"      TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExpoPage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExpoTemplate" (
  "id"          TEXT         NOT NULL,
  "workspaceId" TEXT         NOT NULL,
  "name"        TEXT         NOT NULL,
  "description" TEXT,
  "snapshot"    JSONB        NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExpoTemplate_pkey" PRIMARY KEY ("id")
);

-- 인덱스 — 전부 일반/유니크. 부분(WHERE 절) 인덱스는 하나도 없다.
CREATE UNIQUE INDEX "ExpoSite_previewToken_key" ON "ExpoSite" ("previewToken");
CREATE INDEX "ExpoSite_projectId_idx"           ON "ExpoSite" ("projectId");
CREATE INDEX "ExpoSite_workspaceId_idx"         ON "ExpoSite" ("workspaceId");

CREATE UNIQUE INDEX "ExpoPage_siteId_slug_key"  ON "ExpoPage" ("siteId", "slug");
CREATE INDEX "ExpoPage_siteId_sortOrder_idx"    ON "ExpoPage" ("siteId", "sortOrder");

CREATE INDEX "ExpoTemplate_workspaceId_createdAt_idx"
  ON "ExpoTemplate" ("workspaceId", "createdAt" DESC);

-- 외래키. 삭제 동작이 곧 데이터 수명이다:
--  · 워크스페이스·프로젝트가 지워지면 사이트도 간다.
--  · 수집 소스가 지워져도 **사이트는 산다**(SetNull) — 홈페이지가 폼 하나 때문에 사라지면 안 된다.
ALTER TABLE "ExpoSite"
  ADD CONSTRAINT "ExpoSite_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ExpoSite_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ExpoSite_collectSourceId_fkey"
    FOREIGN KEY ("collectSourceId") REFERENCES "CollectSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExpoPage"
  ADD CONSTRAINT "ExpoPage_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "ExpoSite"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ExpoPage_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "ExpoPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExpoTemplate"
  ADD CONSTRAINT "ExpoTemplate_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS 를 켜고 **정책은 만들지 않는다.** 이 테이블들은 서버 라우트(Prisma)만 접근한다.
ALTER TABLE "ExpoSite"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExpoPage"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExpoTemplate" ENABLE ROW LEVEL SECURITY;

-- Data API 로 새어 나갈 경로를 아예 없앤다. 테이블 소유자·서버 접속 롤은 건드리지 않는다.
REVOKE ALL ON TABLE "ExpoSite", "ExpoPage", "ExpoTemplate"
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
