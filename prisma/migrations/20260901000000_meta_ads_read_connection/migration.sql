ALTER TABLE "AdPerformanceRecord"
  ADD COLUMN "externalCampaignId" TEXT,
  ADD COLUMN "externalAdGroupId" TEXT,
  ADD COLUMN "externalAdId" TEXT,
  ADD COLUMN "providerRecordKey" TEXT;
ALTER TABLE "AdPerformanceRecord"
  ADD COLUMN "purchaseValue" DOUBLE PRECISION,
  ADD COLUMN "roas" DOUBLE PRECISION;

CREATE UNIQUE INDEX "AdPerformanceRecord_providerRecordKey_key"
  ON "AdPerformanceRecord"("providerRecordKey");

CREATE TABLE "MetaAdConnection" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "encryptedAccessToken" TEXT NOT NULL,
  "metaUserId" TEXT,
  "adAccountId" TEXT,
  "adAccountName" TEXT,
  "currency" TEXT,
  "timezoneName" TEXT,
  "enabledMetrics" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CONNECTED',
  "lastSyncedAt" TIMESTAMP(3),
  "lastSyncError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MetaAdConnection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MetaAdConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MetaAdConnection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MetaAdConnection_projectId_key" ON "MetaAdConnection"("projectId");
CREATE INDEX "MetaAdConnection_workspaceId_idx" ON "MetaAdConnection"("workspaceId");
CREATE INDEX "MetaAdConnection_adAccountId_idx" ON "MetaAdConnection"("adAccountId");
