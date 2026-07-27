-- 종료 화면 설문 카드의 버튼 문구 — 설문마다 다른 CTA 텍스트를 쓸 수 있게
--
-- 순수 추가(additive)다 — nullable 컬럼 1개만 붙인다. 기존 행은 NULL 이 되고,
-- 뷰어는 NULL 을 기본 문구("설문 참여하기")로 폴백한다(EndedScreen.tsx). 옛 코드는
-- 이 컬럼을 모르므로 롤백도 안전하다(컬럼을 남겨 둬도 아무 영향이 없다).
--
-- 세션 로고 마이그레이션(2026-07-27-session-logo.sql)과 같은 이유로 `prisma db push` 대신
-- 이 파일을 `prisma db execute` 로 직접 적용한다 — 스키마에 표현할 수 없는 부분 유니크
-- 인덱스 9개를 push 가 잔재로 보고 지운다.
--
-- ⚠ 풀링 URL(:6543, pgbouncer)에서는 db execute 가 멈춘다 — 세션 URL(:5432)로 실행할 것.

ALTER TABLE "WebinarSurvey"
  ADD COLUMN IF NOT EXISTS "ctaLabel" TEXT;
