-- Q&A '화면에 띄우기' — 웨비나당 1개 질문만 시청 화면에 송출. 팝업/투표 단일활성 패턴 계승.
-- CREATE UNIQUE INDEX(비 CONCURRENTLY) — 테이블이 작아 짧은 잠금 무방.

ALTER TABLE "WebinarQA" ADD COLUMN IF NOT EXISTS "onScreen" BOOLEAN NOT NULL DEFAULT false;

-- 혹시 모를 기존 중복(웨비나당 onScreen 2개+) 정리 — 가장 최근 것만 유지 후 부분 유니크 인덱스
UPDATE "WebinarQA" q SET "onScreen"=false
 WHERE q."onScreen"=true AND q."id" <> (
   SELECT q2."id" FROM "WebinarQA" q2
    WHERE q2."webinarId"=q."webinarId" AND q2."onScreen"=true
    ORDER BY q2."updatedAt" DESC LIMIT 1
 );

CREATE UNIQUE INDEX IF NOT EXISTS "WebinarQA_webinarId_onScreen_key"
  ON "WebinarQA" ("webinarId") WHERE "onScreen";
