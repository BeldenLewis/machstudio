-- 법률 문구 생성기(개인정보처리방침·마케팅 동의·제3자 제공 동의) — 2026-08-20
--
-- 전부 **추가만** 한다. prisma db push 는 쓰지 않는다(부분 유니크 인덱스가 날아간다). 재실행 안전.

-- ── Workspace: 조직 정보(회사명·주소·개인정보 담당 연락처) ────────────
-- privacyBodyTemplate/marketingBodyTemplate 과 같은 이유로 워크스페이스 자산이다.
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "legalProfile" JSONB;

-- ── CompetitionEntry: 동의 기록 ────────────────────────────────────────
-- 예전에는 마케팅 동의 체크박스 상태를 검증만 하고 어디에도 저장하지 않았다(WebinarRegistration
-- 에는 있는 컬럼이 CompetitionEntry 에는 없었다). 제3자 제공 동의를 추가하며 함께 메운다.
ALTER TABLE "CompetitionEntry" ADD COLUMN IF NOT EXISTS "agreePrivacy"    BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CompetitionEntry" ADD COLUMN IF NOT EXISTS "agreeMarketing"  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompetitionEntry" ADD COLUMN IF NOT EXISTS "agreeThirdParty" BOOLEAN NOT NULL DEFAULT false;
