-- CreateTable
CREATE TABLE "WebinarPopupClick" (
    "id" TEXT NOT NULL,
    "webinarId" TEXT NOT NULL,
    "popupId" TEXT,
    "registrationId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'cta',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebinarPopupClick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebinarPopupClick_webinarId_createdAt_idx" ON "WebinarPopupClick"("webinarId", "createdAt");

-- CreateIndex
CREATE INDEX "WebinarPopupClick_popupId_idx" ON "WebinarPopupClick"("popupId");

-- AddForeignKey
ALTER TABLE "WebinarPopupClick" ADD CONSTRAINT "WebinarPopupClick_webinarId_fkey" FOREIGN KEY ("webinarId") REFERENCES "Webinar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebinarPopupClick" ADD CONSTRAINT "WebinarPopupClick_popupId_fkey" FOREIGN KEY ("popupId") REFERENCES "WebinarPopup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
