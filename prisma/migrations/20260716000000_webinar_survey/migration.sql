-- 자체 설문 시스템 — WebinarSurvey / WebinarSurveyResponse
CREATE TABLE "WebinarSurvey" (
  "id" TEXT NOT NULL,
  "webinarId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "questions" JSONB NOT NULL DEFAULT '[]',
  "isOpen" BOOLEAN NOT NULL DEFAULT true,
  "showOnEnded" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "sentBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebinarSurvey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebinarSurveyResponse" (
  "id" TEXT NOT NULL,
  "surveyId" TEXT NOT NULL,
  "webinarId" TEXT NOT NULL,
  "registrationId" TEXT,
  "answers" JSONB NOT NULL,
  "source" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebinarSurveyResponse_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebinarSurvey_webinarId_isActive_idx" ON "WebinarSurvey"("webinarId", "isActive");
CREATE INDEX "WebinarSurvey_webinarId_showOnEnded_idx" ON "WebinarSurvey"("webinarId", "showOnEnded");
CREATE UNIQUE INDEX "WebinarSurveyResponse_surveyId_registrationId_key" ON "WebinarSurveyResponse"("surveyId", "registrationId");
CREATE INDEX "WebinarSurveyResponse_webinarId_idx" ON "WebinarSurveyResponse"("webinarId");
CREATE INDEX "WebinarSurveyResponse_surveyId_submittedAt_idx" ON "WebinarSurveyResponse"("surveyId", "submittedAt");

-- 라이브 푸시 원-액티브 보증 — Prisma DSL 미표현, Popup/Poll/Tally 와 동일 패턴 (활성화 코드는 P2002→409 처리)
CREATE UNIQUE INDEX "WebinarSurvey_webinarId_active_key" ON "WebinarSurvey"("webinarId") WHERE "isActive";

ALTER TABLE "WebinarSurvey" ADD CONSTRAINT "WebinarSurvey_webinarId_fkey" FOREIGN KEY ("webinarId") REFERENCES "Webinar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebinarSurveyResponse" ADD CONSTRAINT "WebinarSurveyResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "WebinarSurvey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
