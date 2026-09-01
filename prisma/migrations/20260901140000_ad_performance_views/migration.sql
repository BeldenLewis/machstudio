CREATE TABLE "AdPerformanceView" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'ALL',
    "campaignName" TEXT,
    "adGroupName" TEXT,
    "rangeLabel" TEXT NOT NULL,
    "dateFrom" TIMESTAMP(3) NOT NULL,
    "dateTo" TIMESTAMP(3) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdPerformanceView_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdPerformanceView_projectId_sortOrder_createdAt_idx"
ON "AdPerformanceView"("projectId", "sortOrder", "createdAt");

CREATE INDEX "AdPerformanceView_workspaceId_idx"
ON "AdPerformanceView"("workspaceId");

ALTER TABLE "AdPerformanceView"
ADD CONSTRAINT "AdPerformanceView_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdPerformanceView"
ADD CONSTRAINT "AdPerformanceView_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
