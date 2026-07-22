-- 설문 제출 완료 화면 커스텀 문구
ALTER TABLE "WebinarSurvey" ADD COLUMN IF NOT EXISTS "doneTitle" TEXT;
ALTER TABLE "WebinarSurvey" ADD COLUMN IF NOT EXISTS "doneDescription" TEXT;
