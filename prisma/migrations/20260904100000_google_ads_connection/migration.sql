CREATE TABLE "GoogleAdConnection" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "encryptedRefreshToken" TEXT NOT NULL,
  "googleUserId" TEXT,
  "email" TEXT,
  "status" TEXT NOT NULL DEFAULT 'CONNECTED',
  "lastSyncedAt" TIMESTAMP(3),
  "lastSyncError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GoogleAdConnection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GoogleAdConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GoogleAdConnection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GoogleAdConnection_projectId_key" ON "GoogleAdConnection"("projectId");
CREATE INDEX "GoogleAdConnection_workspaceId_idx" ON "GoogleAdConnection"("workspaceId");
