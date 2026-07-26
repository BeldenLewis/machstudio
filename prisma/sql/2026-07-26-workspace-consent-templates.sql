-- IA 8단계: 워크스페이스 약관 전문 템플릿
--
-- 순수 추가(additive)다 — nullable 컬럼 2개만 붙인다. 기존 행은 NULL 이 되고,
-- 웨비나별 약관 전문(config.registrationForm.privacyBody/marketingBody)은 **그대로 살아 있다**.
-- 옛 코드는 이 컬럼을 모르므로 롤백도 안전하다(컬럼을 남겨 둬도 아무 영향이 없다).
--
-- ⚠ `prisma db push` 로 적용하지 말 것 — 스키마에 표현할 수 없는 부분 유니크 인덱스 9개를
--   잔재로 보고 지운다(지워져도 에러가 안 나고 라이브 중 동시 조작에서만 사고가 난다).
--   그래서 이 파일을 `prisma db execute` 로 직접 적용한다.
--
-- ⚠ 풀링 URL(:6543, pgbouncer)에서는 db execute 가 멈춘다 — 세션 URL(:5432)로 실행할 것.

ALTER TABLE "Workspace"
  ADD COLUMN IF NOT EXISTS "privacyBodyTemplate" TEXT,
  ADD COLUMN IF NOT EXISTS "marketingBodyTemplate" TEXT;
