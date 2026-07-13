/**
 * 시청 곡선 — 시간축 동시 시청자 수.
 * WebinarAttendanceSegment(시청 구간)를 generate_series 버킷별로
 * COUNT(DISTINCT registrationId) 집계한다. DISTINCT 라서 같은 사람의 탭 2개(세그먼트 중복)도
 * 1명으로 계산된다(Phase 1 에서 인지한 세그먼트 중복 이슈 흡수).
 *
 * 범위: 세그먼트의 실제 min(startedAt)~max(endedAt). 백필된 과거 웨비나도 표시된다.
 * 캐시: private, max-age=60 (개인 데이터 — CDN 공유 금지).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

const MAX_POINTS = 48;
const MIN_BUCKET_SECONDS = 300; // 5분

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const webinar = await prisma.webinar.findUnique({ where: { id }, select: { workspaceId: true } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: webinar.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const bounds = await prisma.webinarAttendanceSegment.aggregate({
    where: { webinarId: id },
    _min: { startedAt: true },
    _max: { endedAt: true },
  });
  const fullFrom = bounds._min.startedAt;
  const to = bounds._max.endedAt;

  if (!fullFrom || !to || to.getTime() <= fullFrom.getTime()) {
    return NextResponse.json(
      { points: [], peak: 0, avg: 0, hasData: false },
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  }

  // 창 선택: all(전체·기본) | 60m | 30m — 최근 N분만. 데이터는 5분 버킷이라 해상도는 그대로.
  const range = new URL(request.url).searchParams.get("range");
  const windowMin = range === "30m" ? 30 : range === "60m" ? 60 : null;
  const from = windowMin ? new Date(Math.max(fullFrom.getTime(), to.getTime() - windowMin * 60_000)) : fullFrom;

  const spanSeconds = Math.ceil((to.getTime() - from.getTime()) / 1000);
  // 포인트 수를 MAX_POINTS 이하로 유지하도록 버킷 크기 산정 (5분 배수)
  const bucketSeconds = Math.max(
    MIN_BUCKET_SECONDS,
    Math.ceil(spanSeconds / MAX_POINTS / MIN_BUCKET_SECONDS) * MIN_BUCKET_SECONDS,
  );

  // DateTime 은 UTC 벽시각으로 저장됨 → ISO 를 ::timestamp 로 캐스팅(tz 무시)해 일관성 유지.
  // KST 라벨은 +9h to_char 로 서버에서 만든다.
  // viewers=동시(구간이 gs를 포함), entered=입장 누적(gs까지 시작한 고유 인원), chat=버킷 내 채팅 건수
  const rows = await prisma.$queryRawUnsafe<{ label: string; viewers: number; entered: number; chat: number }[]>(
    `SELECT to_char(gs + interval '9 hours', 'HH24:MI') AS label,
            (SELECT COUNT(DISTINCT s."registrationId")::int
             FROM "WebinarAttendanceSegment" s
             WHERE s."webinarId" = $1::text
               AND s."startedAt" <= gs AND s."endedAt" >= gs) AS viewers,
            (SELECT COUNT(DISTINCT s2."registrationId")::int
             FROM "WebinarAttendanceSegment" s2
             WHERE s2."webinarId" = $1::text
               AND s2."startedAt" <= gs) AS entered,
            (SELECT COUNT(*)::int
             FROM "WebinarChatMessage" c
             WHERE c."webinarId" = $1::text
               AND c."createdAt" >= gs AND c."createdAt" < gs + make_interval(secs => $4::int)) AS chat
     FROM generate_series($2::timestamp, $3::timestamp, make_interval(secs => $4::int)) gs
     ORDER BY gs ASC`,
    id,
    from.toISOString(),
    to.toISOString(),
    bucketSeconds,
  );

  const points = rows.map((row) => ({ label: row.label, viewers: Number(row.viewers), entered: Number(row.entered), chat: Number(row.chat) }));
  const peak = points.reduce((max, p) => Math.max(max, p.viewers), 0);
  const avg = points.length ? Math.round(points.reduce((sum, p) => sum + p.viewers, 0) / points.length) : 0;

  return NextResponse.json(
    { points, peak, avg, bucketMinutes: Math.round(bucketSeconds / 60), fromMs: from.getTime(), bucketMs: bucketSeconds * 1000, hasData: points.length > 0, range: range ?? "all" },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
