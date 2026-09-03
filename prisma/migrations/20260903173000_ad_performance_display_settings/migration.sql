ALTER TABLE "AdPerformanceFolder"
ADD COLUMN "resultMetric" TEXT NOT NULL DEFAULT 'lead',
ADD COLUMN "detailColumns" JSONB NOT NULL DEFAULT '["cost","impressions","reach","clicks","ctr","cpm","cpc","conversions","costPerConversion"]';
