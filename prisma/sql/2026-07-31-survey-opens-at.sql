-- 설문 응답 시작 예약. 마감(closesAt)만 있어서 "언제부터 받을지" 를 정할 수 없었다.
-- NULL = 즉시 시작(기존 설문 전부 이 값 → 동작 변화 없음).
ALTER TABLE "WebinarSurvey" ADD COLUMN IF NOT EXISTS "opensAt" TIMESTAMP(3);
