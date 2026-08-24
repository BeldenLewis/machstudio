-- 연동형 수집: 필드를 DOM 에서 찾는 방법을 매핑에 명시할 수 있게 한다.
--
-- 왜: 수집 스크립트는 필드를 `.form-group` 의 순서로 찾는다. 그건 아임웹이 만드는 마크업이라
-- 자사 전시(THE MOST·STK)는 문제가 없었지만, 대행전시는 플랫폼이 제각각이라 그 클래스가 없다
-- (에듀테크 = div.field). 런타임에 셀렉터 후보를 늘리면 잘못 골랐을 때 조용히 틀린 칸에
-- 저장되므로 — 0건보다 나쁘다 — 대신 필요한 소스만 명시적으로 지목한다.
--
-- 순수 추가이고 전부 NULL 로 시작한다. NULL 인 매핑은 오늘과 같은 위치 인덱스 경로를 탄다.
ALTER TABLE "FieldMapping" ADD COLUMN IF NOT EXISTS "matchBy"    TEXT;
ALTER TABLE "FieldMapping" ADD COLUMN IF NOT EXISTS "matchValue" TEXT;
