-- 본선 진행 순서 — 예선 신청 순서(sortOrder)와 별개로 운영자가 다시 정한다.
-- sortOrder 를 재사용하지 않는 이유: 그 값은 공고·참가작 목록·예선 표시 순서가 함께 쓰고 있어서,
-- 본선 순서를 거기 덮어쓰면 이미 끝난 예선의 기록까지 뒤바뀐다.
ALTER TABLE "CompetitionEntry" ADD COLUMN IF NOT EXISTS "finalOrder" INTEGER;

-- 본선 화면은 진출자만 finalOrder 순으로 훑는다.
CREATE INDEX IF NOT EXISTS "CompetitionEntry_competitionId_advanced_finalOrder_idx"
  ON "CompetitionEntry"("competitionId", "advanced", "finalOrder");

-- 결과 발표 페이지 — 수상 공개 여부·문구를 대회 단위로 둔다.
-- (개별 수상의 revealedAt 은 이미 CompetitionAward 에 있다. 여기 것은 "결과 페이지를 열었는가".)
ALTER TABLE "Competition" ADD COLUMN IF NOT EXISTS "resultPublishedAt" TIMESTAMP(3);
