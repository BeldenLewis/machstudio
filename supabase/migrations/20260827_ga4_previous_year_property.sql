-- 프로젝트에 작년 GA4 속성 ID 추가 — 2026-08-27
--
-- 전부 **추가만** 한다. prisma db push 는 쓰지 않는다(부분 유니크 인덱스가 날아간다). 재실행 안전.

-- ── Project: 작년 웹사이트의 GA4 속성 ────────────────────────────────
-- 행사마다 새 GA4 속성을 만드는 운영 방식이라(예: Korea Expo Paris(FR) ≠ Korea Expo Paris 2024(FR)),
-- ga4PropertyId 하나만으로는 "작년"을 알 수 없다. 지정하면 홈페이지·사전등록 페이지 방문에도
-- "전년 동일 D구간" 비교가 붙는다.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "ga4PreviousYearPropertyId" TEXT;
