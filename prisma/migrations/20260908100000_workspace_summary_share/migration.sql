ALTER TABLE "Workspace"
  ADD COLUMN "summaryShareToken" TEXT,
  ADD COLUMN "summaryShareEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "Workspace_summaryShareToken_key" ON "Workspace"("summaryShareToken");
