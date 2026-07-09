-- 푸시(팝업·투표·Tally) 웨비나당 활성 1개 보장(부분 유니크 인덱스) + Q&A 추천순 정렬 인덱스
-- 멱등(IF NOT EXISTS). apply-migration.mjs 가 파일 전체를 한 트랜잭션으로 실행하므로
-- CREATE UNIQUE INDEX(비 CONCURRENTLY) 사용 — 테이블이 작아 짧은 잠금은 무방.

-- 1) 혹시 존재할 수 있는 활성 중복 정리 — 웨비나별 최신(updatedAt) 1개만 남기고 나머지 OFF.
--    현재 데이터엔 중복이 없어 no-op 이지만, 유니크 인덱스 생성 전 안전장치로 둔다.
UPDATE "WebinarPopup" p SET "isActive"=false
 WHERE p."isActive"=true AND p."id" <> (
   SELECT p2."id" FROM "WebinarPopup" p2
    WHERE p2."webinarId"=p."webinarId" AND p2."isActive"=true
    ORDER BY p2."updatedAt" DESC, p2."id" DESC LIMIT 1);
CREATE UNIQUE INDEX IF NOT EXISTS "WebinarPopup_webinarId_active_key"
  ON "WebinarPopup" ("webinarId") WHERE "isActive";

UPDATE "WebinarPoll" p SET "isActive"=false
 WHERE p."isActive"=true AND p."id" <> (
   SELECT p2."id" FROM "WebinarPoll" p2
    WHERE p2."webinarId"=p."webinarId" AND p2."isActive"=true
    ORDER BY p2."updatedAt" DESC, p2."id" DESC LIMIT 1);
CREATE UNIQUE INDEX IF NOT EXISTS "WebinarPoll_webinarId_active_key"
  ON "WebinarPoll" ("webinarId") WHERE "isActive";

UPDATE "WebinarTallyPush" p SET "isActive"=false
 WHERE p."isActive"=true AND p."id" <> (
   SELECT p2."id" FROM "WebinarTallyPush" p2
    WHERE p2."webinarId"=p."webinarId" AND p2."isActive"=true
    ORDER BY p2."updatedAt" DESC, p2."id" DESC LIMIT 1);
CREATE UNIQUE INDEX IF NOT EXISTS "WebinarTallyPush_webinarId_active_key"
  ON "WebinarTallyPush" ("webinarId") WHERE "isActive";

-- 2) Q&A 추천순 정렬 인덱스 — 라이브 상태(/live-state)가 웨비나별로 voteCount DESC, createdAt ASC 정렬.
--    Prisma 스키마의 @@index 와 이름을 맞춰 드리프트 방지.
CREATE INDEX IF NOT EXISTS "WebinarQA_webinarId_voteCount_createdAt_idx"
  ON "WebinarQA" ("webinarId", "voteCount" DESC, "createdAt");
