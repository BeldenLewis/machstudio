-- 설문 마감 예약 — closesAt 이 지나면 isOpen 과 무관하게 응답 마감
ALTER TABLE "WebinarSurvey" ADD COLUMN IF NOT EXISTS "closesAt" TIMESTAMP(3);
