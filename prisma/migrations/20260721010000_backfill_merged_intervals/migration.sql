-- 백필 정정 — 겹치는 시청 구간을 병합한 뒤 합산한다.
-- 직전 백필은 단순 SUM 이라 겹친 구간(동시 탭·중복 생성)이 이중 계산됐다.
-- 예: [00:18~01:33] + [00:18~01:28] → 145분(오류), 병합 시 75분(정답).

WITH ordered AS (
  SELECT "registrationId", "startedAt", "endedAt",
         MAX("endedAt") OVER (
           PARTITION BY "registrationId" ORDER BY "startedAt"
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
         ) AS prev_max
    FROM "WebinarAttendanceSegment"
),
marked AS (
  SELECT *, CASE WHEN prev_max IS NULL OR "startedAt" > prev_max THEN 1 ELSE 0 END AS is_new
    FROM ordered
),
grouped AS (
  SELECT *, SUM(is_new) OVER (
           PARTITION BY "registrationId" ORDER BY "startedAt" ROWS UNBOUNDED PRECEDING
         ) AS grp
    FROM marked
),
merged AS (
  SELECT "registrationId", grp, MIN("startedAt") AS s, MAX("endedAt") AS e
    FROM grouped GROUP BY "registrationId", grp
),
totals AS (
  SELECT "registrationId", FLOOR(SUM(EXTRACT(EPOCH FROM (e - s))))::int AS secs
    FROM merged GROUP BY "registrationId"
)
UPDATE "WebinarRegistration" r
   SET "connectedSeconds" = t.secs
  FROM totals t
 WHERE t."registrationId" = r."id";
