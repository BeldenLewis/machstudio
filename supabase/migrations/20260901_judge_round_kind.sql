-- 심사위원을 예선/본선 중 어느 라운드에 배정할지.
--
-- 왜: 지금까지는 심사위원 화면이 라운드를 스스로 골라(본선 우선) 보여줬다 — 예선·본선을
-- 둘 다 심사위원 채점으로 돌리는 대회에서는 예선 심사위원이 영영 예선을 볼 방법이 없었다.
-- 기본값을 "final"로 둬서, 이미 등록된 심사위원(전부 본선을 심사하던 시절 값)의 동작은
-- 그대로 유지한다.
ALTER TABLE "CompetitionJudge" ADD COLUMN IF NOT EXISTS "roundKind" TEXT NOT NULL DEFAULT 'final';
