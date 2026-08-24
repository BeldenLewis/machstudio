-- 대회·투표 시스템 — docs/superpowers/specs/2026-08-13-competition-voting-system-design.md
-- 전부 신규 테이블이라 기존 데이터에 영향이 없다.

CREATE TABLE IF NOT EXISTS "Competition" (
  "id"                     TEXT PRIMARY KEY,
  "workspaceId"            TEXT NOT NULL,
  "projectId"              TEXT NOT NULL,
  "name"                   TEXT NOT NULL,
  "slug"                   TEXT NOT NULL,
  "description"            TEXT,
  "phaseOverride"          TEXT,
  "recruitOpenAt"          TIMESTAMP(3),
  "recruitCloseAt"         TIMESTAMP(3),
  "theme"                  JSONB NOT NULL,
  "config"                 JSONB NOT NULL,
  "scoringConfig"          JSONB,
  "showConfig"             JSONB,
  "maxEntriesPerApplicant" INTEGER NOT NULL DEFAULT 1,
  "previewToken"           TEXT,
  "showToken"              TEXT,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Competition_workspaceId_fkey" FOREIGN KEY ("workspaceId")
    REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Competition_projectId_fkey" FOREIGN KEY ("projectId")
    REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Competition_slug_key"         ON "Competition"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "Competition_previewToken_key" ON "Competition"("previewToken");
CREATE UNIQUE INDEX IF NOT EXISTS "Competition_showToken_key"    ON "Competition"("showToken");
CREATE INDEX IF NOT EXISTS "Competition_projectId_createdAt_idx" ON "Competition"("projectId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Competition_workspaceId_idx"         ON "Competition"("workspaceId");

CREATE TABLE IF NOT EXISTS "CompetitionRound" (
  "id"               TEXT PRIMARY KEY,
  "competitionId"    TEXT NOT NULL,
  "kind"             TEXT NOT NULL,
  "name"             TEXT NOT NULL,
  "sortOrder"        INTEGER NOT NULL DEFAULT 0,
  "voteEnabled"      BOOLEAN NOT NULL DEFAULT false,
  "voteOpenAt"       TIMESTAMP(3),
  "voteCloseAt"      TIMESTAMP(3),
  "maxVotesPerVoter" INTEGER NOT NULL DEFAULT 1,
  "allowVoteUndo"    BOOLEAN NOT NULL DEFAULT false,
  "voterIdentity"    TEXT NOT NULL DEFAULT 'device',
  "ipVoteLimit"      INTEGER,
  "showLiveTally"    BOOLEAN NOT NULL DEFAULT false,
  "entryOrder"       TEXT NOT NULL DEFAULT 'random',
  "carryOverEnabled" BOOLEAN NOT NULL DEFAULT false,
  "carryOverPercent" INTEGER NOT NULL DEFAULT 0,
  "judgeCriteria"    JSONB,
  "publicWeight"     INTEGER NOT NULL DEFAULT 50,
  "judgeWeight"      INTEGER NOT NULL DEFAULT 50,
  "advanceCount"     INTEGER,
  CONSTRAINT "CompetitionRound_competitionId_fkey" FOREIGN KEY ("competitionId")
    REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CompetitionRound_competitionId_kind_key" ON "CompetitionRound"("competitionId", "kind");
CREATE INDEX IF NOT EXISTS "CompetitionRound_competitionId_idx"             ON "CompetitionRound"("competitionId");

CREATE TABLE IF NOT EXISTS "CompetitionEntry" (
  "id"            TEXT PRIMARY KEY,
  "competitionId" TEXT NOT NULL,
  "entryNo"       TEXT NOT NULL,
  "title"         TEXT NOT NULL,
  "teamName"      TEXT,
  "summary"       TEXT,
  "data"          JSONB NOT NULL,
  "media"         JSONB NOT NULL,
  "contactName"   TEXT,
  "contactEmail"  TEXT,
  "contactPhone"  TEXT,
  "status"        TEXT NOT NULL DEFAULT 'submitted',
  "isPublished"   BOOLEAN NOT NULL DEFAULT false,
  "sortOrder"     INTEGER NOT NULL DEFAULT 0,
  "advanced"      BOOLEAN NOT NULL DEFAULT false,
  "submittedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompetitionEntry_competitionId_fkey" FOREIGN KEY ("competitionId")
    REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CompetitionEntry_competitionId_entryNo_key" ON "CompetitionEntry"("competitionId", "entryNo");
CREATE INDEX IF NOT EXISTS "CompetitionEntry_competitionId_isPublished_sortOrder_idx"  ON "CompetitionEntry"("competitionId", "isPublished", "sortOrder");
CREATE INDEX IF NOT EXISTS "CompetitionEntry_competitionId_submittedAt_idx"            ON "CompetitionEntry"("competitionId", "submittedAt");

-- 투표 상한의 최종 방어선은 아래 UNIQUE 다. 레이트리미터는 서버리스에서 인스턴스마다
-- 메모리가 따로라(ratelimit.ts 메모리 폴백) 동시 요청에서 상한이 새어 나간다.
CREATE TABLE IF NOT EXISTS "CompetitionVote" (
  "id"        TEXT PRIMARY KEY,
  "roundId"   TEXT NOT NULL,
  "entryId"   TEXT NOT NULL,
  "voterKey"  TEXT NOT NULL,
  "ipHash"    TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompetitionVote_roundId_fkey" FOREIGN KEY ("roundId")
    REFERENCES "CompetitionRound"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CompetitionVote_entryId_fkey" FOREIGN KEY ("entryId")
    REFERENCES "CompetitionEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CompetitionVote_roundId_entryId_voterKey_key" ON "CompetitionVote"("roundId", "entryId", "voterKey");
CREATE INDEX IF NOT EXISTS "CompetitionVote_roundId_voterKey_idx" ON "CompetitionVote"("roundId", "voterKey");
CREATE INDEX IF NOT EXISTS "CompetitionVote_roundId_entryId_idx" ON "CompetitionVote"("roundId", "entryId");
CREATE INDEX IF NOT EXISTS "CompetitionVote_roundId_ipHash_idx"  ON "CompetitionVote"("roundId", "ipHash");

CREATE TABLE IF NOT EXISTS "CompetitionJudge" (
  "id"            TEXT PRIMARY KEY,
  "competitionId" TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "email"         TEXT,
  "affiliation"   TEXT,
  "accessToken"   TEXT NOT NULL,
  "passwordHash"  TEXT,
  "weight"        INTEGER NOT NULL DEFAULT 1,
  "invitedAt"     TIMESTAMP(3),
  "lastSeenAt"    TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompetitionJudge_competitionId_fkey" FOREIGN KEY ("competitionId")
    REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CompetitionJudge_accessToken_key"  ON "CompetitionJudge"("accessToken");
CREATE INDEX IF NOT EXISTS "CompetitionJudge_competitionId_idx"       ON "CompetitionJudge"("competitionId");

CREATE TABLE IF NOT EXISTS "CompetitionJudgeScore" (
  "id"        TEXT PRIMARY KEY,
  "roundId"   TEXT NOT NULL,
  "entryId"   TEXT NOT NULL,
  "judgeId"   TEXT NOT NULL,
  "scores"    JSONB NOT NULL,
  "total"     DOUBLE PRECISION NOT NULL,
  "comment"   TEXT,
  "submitted" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompetitionJudgeScore_roundId_fkey" FOREIGN KEY ("roundId")
    REFERENCES "CompetitionRound"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CompetitionJudgeScore_entryId_fkey" FOREIGN KEY ("entryId")
    REFERENCES "CompetitionEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CompetitionJudgeScore_judgeId_fkey" FOREIGN KEY ("judgeId")
    REFERENCES "CompetitionJudge"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CompetitionJudgeScore_roundId_entryId_judgeId_key" ON "CompetitionJudgeScore"("roundId", "entryId", "judgeId");
CREATE INDEX IF NOT EXISTS "CompetitionJudgeScore_roundId_entryId_idx"                ON "CompetitionJudgeScore"("roundId", "entryId");
CREATE INDEX IF NOT EXISTS "CompetitionJudgeScore_judgeId_idx"                        ON "CompetitionJudgeScore"("judgeId");

CREATE TABLE IF NOT EXISTS "CompetitionAward" (
  "id"            TEXT PRIMARY KEY,
  "competitionId" TEXT NOT NULL,
  "entryId"       TEXT,
  "name"          TEXT NOT NULL,
  "rank"          INTEGER NOT NULL,
  "description"   TEXT,
  "revealedAt"    TIMESTAMP(3),
  CONSTRAINT "CompetitionAward_competitionId_fkey" FOREIGN KEY ("competitionId")
    REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CompetitionAward_entryId_fkey" FOREIGN KEY ("entryId")
    REFERENCES "CompetitionEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CompetitionAward_competitionId_rank_idx" ON "CompetitionAward"("competitionId", "rank");
