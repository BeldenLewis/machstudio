-- CreateTable
CREATE TABLE "AdPerformanceFolder" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "reportStart" TIMESTAMP(3) NOT NULL,
    "reportEnd" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KRW',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Seoul',
    "mediaAccounts" JSONB NOT NULL DEFAULT '[]',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdPerformanceFolder_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AdPerformanceImportBatch" ADD COLUMN "folderId" TEXT;
ALTER TABLE "AdPerformanceRecord"
  ADD COLUMN "folderId" TEXT,
  ADD COLUMN "accountId" TEXT,
  ADD COLUMN "accountName" TEXT,
  ADD COLUMN "campaignId" TEXT,
  ADD COLUMN "adGroupId" TEXT,
  ADD COLUMN "adId" TEXT,
  ADD COLUMN "adName" TEXT,
  ADD COLUMN "creativeId" TEXT,
  ADD COLUMN "creativeName" TEXT,
  ADD COLUMN "thumbnailUrl" TEXT;

CREATE INDEX "AdPerformanceFolder_workspaceId_projectId_updatedAt_idx" ON "AdPerformanceFolder"("workspaceId", "projectId", "updatedAt" DESC);
CREATE INDEX "AdPerformanceImportBatch_folderId_createdAt_idx" ON "AdPerformanceImportBatch"("folderId", "createdAt" DESC);
CREATE INDEX "AdPerformanceRecord_folderId_reportDate_idx" ON "AdPerformanceRecord"("folderId", "reportDate");
CREATE INDEX "AdPerformanceRecord_folderId_sourceType_campaignId_idx" ON "AdPerformanceRecord"("folderId", "sourceType", "campaignId");

ALTER TABLE "AdPerformanceFolder" ADD CONSTRAINT "AdPerformanceFolder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdPerformanceFolder" ADD CONSTRAINT "AdPerformanceFolder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdPerformanceImportBatch" ADD CONSTRAINT "AdPerformanceImportBatch_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "AdPerformanceFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdPerformanceRecord" ADD CONSTRAINT "AdPerformanceRecord_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "AdPerformanceFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
