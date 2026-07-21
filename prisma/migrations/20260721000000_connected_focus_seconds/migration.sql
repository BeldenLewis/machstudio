-- 접속 시간(connectedSeconds) / 포커스 시간(focusSeconds) 누적 컬럼.
--
-- 배경: 체류시간이 화면마다 달랐다. 리드점수·CSV 는 시청 구간 합, 등록자 탭·대시보드는
-- stayMinutes(입장~퇴장 스팬, 자리비움 포함)를 써서 같은 사람이 10분/120분으로 갈렸다.
-- ping 이 간격을 누적하는 단일 카운터로 통일하고, 동시에 탭 가시성(focus)을 따로 쌓는다.
-- (웨비나는 근무시간대라 "창 띄워놓고 소리만 듣기"가 정상 참석 — 접속을 깎지 않고 두 축으로 본다)

ALTER TABLE "WebinarRegistration"
  ADD COLUMN IF NOT EXISTS "connectedSeconds" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "focusSeconds" INTEGER NOT NULL DEFAULT 0;

-- 과거 데이터 백필 — 이미 쌓인 시청 구간 합을 접속 시간의 출발점으로 삼는다.
-- (포커스는 과거 기록이 없어 0 으로 두고, UI 에서 "측정 전"으로 구분한다)
UPDATE "WebinarRegistration" r
   SET "connectedSeconds" = COALESCE(s.secs, 0)
  FROM (
    SELECT "registrationId", FLOOR(SUM(EXTRACT(EPOCH FROM ("endedAt" - "startedAt"))))::int AS secs
      FROM "WebinarAttendanceSegment"
     GROUP BY "registrationId"
  ) s
 WHERE s."registrationId" = r."id" AND r."connectedSeconds" = 0;
