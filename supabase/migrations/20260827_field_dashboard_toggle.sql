-- 프로젝트 대시보드에서 필드별 통계(값 분포)를 보여줄지 켜고 끄는 토글.
--
-- 왜: 프로젝트마다 수집 필드가 다 다르다 — 대시보드가 어떤 필드를 통계로 보여줄지 하드코딩할
-- 수 없다. 기본값을 true 로 둔다 — "새 필드는 일단 보이고, 운영자가 필요없는 것만 끈다"가
-- isRequired(기본 false, 필요한 것만 켠다)와 반대 방향인 이유는 목적이 다르기 때문이다:
-- 필수는 잘못 켜면 멀쩡한 제출이 막히고(과감히 기본 꺼짐), 통계는 잘못 켜져 있어도
-- 대시보드에 카드 하나 더 보이는 것뿐이라(과감히 기본 켜짐, 끄는 게 더 쉬움).
ALTER TABLE "FieldMapping" ADD COLUMN IF NOT EXISTS "showInDashboard" BOOLEAN NOT NULL DEFAULT true;
