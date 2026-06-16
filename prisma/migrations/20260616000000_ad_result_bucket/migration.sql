-- 광고 결과유형 버킷: 도달(Reach) 캠페인의 "결과"(도달 인원)를 전환 집계에서 분리한다.
-- 도달 인원은 reach 컬럼과 raw JSON 에 보존되므로 손실 없음.

ALTER TABLE "AdPerformanceRecord" ADD COLUMN IF NOT EXISTS "resultBucket" TEXT;

-- 도달성 행 백필: resultType 이 도달/reach 거나, (결과유형 미설정 + 결과값==도달값) 지문.
UPDATE "AdPerformanceRecord"
SET "resultBucket" = 'reach',
    "conversions" = 0,
    "costPerConversion" = NULL,
    "conversionRate" = NULL
WHERE "resultBucket" IS NULL
  AND (
    "resultType" ~* '도달|reach'
    OR (
      ("resultType" IS NULL OR btrim("resultType") = '')
      AND "reach" IS NOT NULL AND "reach" >= 1000
      AND "conversions" IS NOT NULL AND "conversions" = "reach"
    )
  );

-- 나머지는 전환성으로 표시.
UPDATE "AdPerformanceRecord" SET "resultBucket" = 'conversion' WHERE "resultBucket" IS NULL;

CREATE INDEX IF NOT EXISTS "AdPerformanceRecord_projectId_resultBucket_idx"
  ON "AdPerformanceRecord" ("projectId", "resultBucket");
