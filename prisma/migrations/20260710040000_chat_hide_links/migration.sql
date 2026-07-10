-- 링크 자동 숨김 토글 — 기존엔 공개 채팅 POST가 항상 링크를 제거했음. 운영자가 끌 수 있게 설정값 추가(기본 true=기존 동작 유지).
ALTER TABLE "Webinar" ADD COLUMN IF NOT EXISTS "chatHideLinks" BOOLEAN NOT NULL DEFAULT true;
