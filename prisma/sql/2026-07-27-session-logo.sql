-- 세션 로고 — 주최·협력사 마크, 오프닝·클로징의 브랜드
--
-- 순수 추가(additive)다 — nullable 컬럼 1개만 붙인다. 기존 행은 NULL 이 되고,
-- 옛 코드는 이 컬럼을 모르므로 롤백도 안전하다(컬럼을 남겨 둬도 아무 영향이 없다).
--
-- 같은 작업에서 세션 유형 2종(opening/closing)도 늘렸지만 **그건 DDL 이 0건이다** —
-- "WebinarSession"."type" 은 enum 도 CHECK 도 없는 TEXT DEFAULT 'session' 이라,
-- 유형 추가는 코드 화이트리스트(src/lib/webinar-sessions.ts) 문제이고 DB 는 건드리지 않는다.
-- 다음 사람이 유형을 늘리려고 이 폴더를 뒤지지 않게 여기 적어 둔다.
--
-- ⚠ `prisma db push` 로 적용하지 말 것 — 스키마에 표현할 수 없는 부분 유니크 인덱스 9개를
--   잔재로 보고 지운다(지워져도 에러가 안 나고 라이브 중 동시 조작에서만 사고가 난다).
--   그래서 이 파일을 `prisma db execute` 로 직접 적용한다.
--
-- ⚠ 풀링 URL(:6543, pgbouncer)에서는 db execute 가 멈춘다 — 세션 URL(:5432)로 실행할 것.

ALTER TABLE "WebinarSession"
  ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;
