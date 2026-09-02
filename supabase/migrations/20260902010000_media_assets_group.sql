-- 미디어 자료실에 자유 문자열 그룹을 더한다 — 순수 추가. 기존 행은 groupLabel NULL(미분류)로 남는다.
-- 재실행 안전(IF NOT EXISTS). prisma db push 는 쓰지 않는다 — 부분 유니크 인덱스가 날아간다.

BEGIN;

ALTER TABLE "MediaAsset" ADD COLUMN IF NOT EXISTS "groupLabel" TEXT;

CREATE INDEX IF NOT EXISTS "MediaAsset_workspaceId_groupLabel_idx"
    ON "MediaAsset" ("workspaceId", "groupLabel");

COMMIT;
