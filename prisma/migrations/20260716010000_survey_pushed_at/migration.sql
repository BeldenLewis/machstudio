-- 설문 재노출 키 분리 — 발행 시각(pushedAt)은 어드민 편집(updatedAt)과 무관하게 발행 시에만 갱신
ALTER TABLE "WebinarSurvey" ADD COLUMN "pushedAt" TIMESTAMP(3);
