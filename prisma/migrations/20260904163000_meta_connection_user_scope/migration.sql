ALTER TABLE "MetaAdConnection" ADD COLUMN "connectedById" TEXT;

CREATE INDEX "MetaAdConnection_connectedById_idx" ON "MetaAdConnection"("connectedById");
