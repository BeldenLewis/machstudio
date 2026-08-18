-- 사전등록 빌더형 수집 소스 (설계 §15) — 2026-08-15
--
-- 전부 **추가만** 한다. 기존 수집 소스 3개(레코드 52,155건)는 손대지 않는다:
--  · mode 기본값이 'capture' 라 기존 소스는 지금 동작 그대로다(값을 채우는 백필도 필요 없다).
--  · 새 컬럼은 전부 NULL 허용 — 기존 행은 NULL 로 남고 읽는 쪽이 정규화로 메운다.
--  · CollectRecord 의 이메일 유니크는 **부분 인덱스**(emailNormalized IS NOT NULL)라
--    기존 52,155건(전부 NULL)에는 걸리지 않는다. 과거 데이터 이관 시 중복 정리를 먼저 한다(§13-4).
--
-- 재실행 안전(IF NOT EXISTS). prisma db push 는 쓰지 않는다 — 부분 유니크 인덱스가 날아간다.

-- ── CollectSource: 수집 방식 + 빌더 설정 ──────────────────────────────
-- mode 는 formConfig 가 비었는지로 유추하지 않고 **명시적 컬럼**으로 둔다(§3.1).
-- 빌더형인데 아직 문항을 안 채운 상태와 연동형이 구분되지 않기 때문이다.
ALTER TABLE "CollectSource" ADD COLUMN IF NOT EXISTS "mode"         TEXT NOT NULL DEFAULT 'capture';
-- 미리보기 링크 /p/{token} — 소스 id 를 노출하지 않는다. 재발급으로 링크를 끊을 수 있어야 해서다(§16.1).
ALTER TABLE "CollectSource" ADD COLUMN IF NOT EXISTS "previewToken" TEXT;
ALTER TABLE "CollectSource" ADD COLUMN IF NOT EXISTS "formConfig"   JSONB;
ALTER TABLE "CollectSource" ADD COLUMN IF NOT EXISTS "emailConfig"  JSONB;
ALTER TABLE "CollectSource" ADD COLUMN IF NOT EXISTS "venueConfig"  JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS "CollectSource_previewToken_key"
  ON "CollectSource"("previewToken");

-- ── CollectRecord: 등록번호·정규화 키·이메일 상태 ─────────────────────
ALTER TABLE "CollectRecord" ADD COLUMN IF NOT EXISTS "registrationNo"  TEXT;
-- 소문자·trim 한 이메일. 중복 판정(§6.2)과 등록 확인(§10) 조회의 키다.
ALTER TABLE "CollectRecord" ADD COLUMN IF NOT EXISTS "emailNormalized" TEXT;
-- E.164 한 형태(+12025550147). 표기가 제각각이면 등록 확인이 안 맞는다(§6.3).
ALTER TABLE "CollectRecord" ADD COLUMN IF NOT EXISTS "phoneE164"       TEXT;
ALTER TABLE "CollectRecord" ADD COLUMN IF NOT EXISTS "locale"          TEXT;
-- "online" | "onsite" — 현장 등록 비중 분석(§20).
-- 설계 문서는 컬럼명을 source 로 적었지만 CollectRecord.source 는 이미 **CollectSource 관계**의
-- 이름이다. 그대로 두면 Prisma 필드명이 충돌하고, 읽는 쪽도 "수집 소스"와 헷갈린다 → entryChannel.
ALTER TABLE "CollectRecord" ADD COLUMN IF NOT EXISTS "entryChannel"    TEXT;
ALTER TABLE "CollectRecord" ADD COLUMN IF NOT EXISTS "emailStatus"     TEXT;
ALTER TABLE "CollectRecord" ADD COLUMN IF NOT EXISTS "emailSentAt"     TIMESTAMP(3);
ALTER TABLE "CollectRecord" ADD COLUMN IF NOT EXISTS "emailError"      TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "CollectRecord_registrationNo_key"
  ON "CollectRecord"("registrationNo");

-- 중복 등록의 **최종 방어선**. 조회 후 INSERT 만으로는 동시 제출을 못 막는다(둘 다 "없음"을 읽는다).
-- 판정 범위는 CollectSource 단위 = 전시 하나(§6.2).
CREATE UNIQUE INDEX IF NOT EXISTS "CollectRecord_sourceId_emailNormalized_key"
  ON "CollectRecord"("sourceId", "emailNormalized") WHERE "emailNormalized" IS NOT NULL;

-- 등록 확인이 전화번호로도 조회한다(§10.1) — 인덱스 없으면 5만 건 풀스캔.
CREATE INDEX IF NOT EXISTS "CollectRecord_sourceId_phoneE164_idx"
  ON "CollectRecord"("sourceId", "phoneE164");
