import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { resolveWebinarStatus } from "@/lib/webinar-status";

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function minutesBetween(start: Date | null, end: Date) {
  if (!start) return 0;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000));
}

async function authorize(webinarId: string, userId: string) {
  const webinar = await prisma.webinar.findUnique({
    where: { id: webinarId },
    select: { id: true, workspaceId: true, liveStartAt: true, liveEndAt: true, signupDeadline: true, statusOverride: true, components: true, name: true },
  });
  if (!webinar) return { webinar: null, membership: null };

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: webinar.workspaceId } },
  });

  return { webinar, membership };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const { webinar, membership } = await authorize(id, user.id);
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const now = new Date();
  const activeSince = new Date(now.getTime() - 90 * 1000);
  const presenceSince = new Date(now.getTime() - 5 * 60 * 1000);
  // 체류 상한 — 방송 경과(예정 종료로 상한). 며칠째 방치된 세션의 체류 폭주 방지(analytics 와 동일 규칙).
  const capMinutes = Math.max(0, Math.floor((Math.min(now.getTime(), webinar.liveEndAt.getTime()) - webinar.liveStartAt.getTime()) / 60000));

  const [
    totalRegistered,
    attended,
    activeViewers,
    presenceViewers,
    marketingAgreed,
    pendingQuestions,
    answeredQuestions,
    dismissedQuestions,
    totalQuestions,
    stayStats,
    currentViewers,
    latestQuestions,
  ] = await Promise.all([
    prisma.webinarRegistration.count({ where: { webinarId: id } }),
    prisma.webinarRegistration.count({ where: { webinarId: id, enteredAt: { not: null } } }),
    prisma.webinarRegistration.count({ where: { webinarId: id, lastPingAt: { gte: activeSince } } }),
    prisma.webinarRegistration.count({
      where: {
        webinarId: id,
        OR: [
          { presencePingAt: { gte: presenceSince } },
          { lastPingAt: { gte: presenceSince } },
        ],
      },
    }),
    prisma.webinarRegistration.count({ where: { webinarId: id, agreeMarketing: true } }),
    prisma.webinarQA.count({ where: { webinarId: id, status: "pending" } }),
    prisma.webinarQA.count({ where: { webinarId: id, status: "answered" } }),
    prisma.webinarQA.count({ where: { webinarId: id, status: "dismissed" } }),
    prisma.webinarQA.count({ where: { webinarId: id } }),
    // EGRESS: 체류 통계는 전 행을 JS로 옮기지 않고 Postgres에서 집계 (avg/max/stay30/stay60)
    prisma.$queryRaw<
      {
        avgStayMinutes: number | string | null;
        maxStayMinutes: number | string | null;
        stay30: bigint | number;
        stay60: bigint | number;
      }[]
    >`
      SELECT
        COALESCE(AVG("eff"), 0) AS "avgStayMinutes",
        COALESCE(MAX("eff"), 0) AS "maxStayMinutes",
        COUNT(*) FILTER (WHERE "eff" >= 30) AS "stay30",
        COUNT(*) FILTER (WHERE "eff" >= 60) AS "stay60"
      FROM (
        -- 실제 시청 구간(WebinarAttendanceSegment) 합이 있으면 그것을 쓴다.
        -- "입장~마지막활동" 스팬은 중간 이탈까지 시청으로 세어 평균·30/60분 체류를 부풀린다.
        -- 구간 기록이 없는 과거 데이터만 기존 스팬 방식으로 폴백.
        SELECT LEAST(
          COALESCE(
            seg."minutes",
            GREATEST(
              COALESCE(r."stayMinutes", 0),
              FLOOR(EXTRACT(EPOCH FROM (COALESCE(r."lastPingAt", now()) - r."enteredAt")) / 60)
            )
          ),
          ${capMinutes}::int
        ) AS "eff"
        FROM "WebinarRegistration" r
        LEFT JOIN (
          SELECT "registrationId",
                 FLOOR(SUM(EXTRACT(EPOCH FROM ("endedAt" - "startedAt"))) / 60)::int AS "minutes"
            FROM "WebinarAttendanceSegment"
           WHERE "webinarId" = ${id}
           GROUP BY "registrationId"
        ) seg ON seg."registrationId" = r."id"
        WHERE r."enteredAt" IS NOT NULL AND r."webinarId" = ${id}
      ) sub
    `,
    prisma.webinarRegistration.findMany({
      where: {
        webinarId: id,
        OR: [
          { lastPingAt: { gte: presenceSince } },
          { presencePingAt: { gte: presenceSince } },
        ],
      },
      orderBy: [{ lastPingAt: "desc" }, { enteredAt: "desc" }],
      take: 8,
      select: {
        id: true,
        name: true,
        company: true,
        department: true,
        jobTitle: true,
        email: true,
        phone: true,
        enteredAt: true,
        lastPingAt: true,
        presencePingAt: true,
        stayMinutes: true,
      },
    }),
    prisma.webinarQA.findMany({
      where: { webinarId: id },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        question: true,
        sessionNumber: true,
        status: true,
        name: true,
        company: true,
        createdAt: true,
      },
    }),
  ]);

  const stayRow = stayStats[0];
  const avgStayMinutes = Math.round(Number(stayRow?.avgStayMinutes ?? 0));
  const maxStayMinutes = Math.round(Number(stayRow?.maxStayMinutes ?? 0));
  const stay30 = Number(stayRow?.stay30 ?? 0);
  const stay60 = Number(stayRow?.stay60 ?? 0);

  const statusInfo = resolveWebinarStatus(webinar);

  return NextResponse.json({
    // 운영 콘솔 상태 바 — 오버라이드 여부 포함 (자동 복귀 버튼 표시 판단)
    status: statusInfo.status,
    isOverridden: statusInfo.isOverridden,
    summary: {
      totalRegistered,
      attended,
      activeViewers,
      presenceViewers,
      marketingAgreed,
      pendingQuestions,
      answeredQuestions,
      dismissedQuestions,
      totalQuestions,
      attendRate: pct(attended, totalRegistered),
      marketingRate: pct(marketingAgreed, totalRegistered),
      avgStayMinutes,
      maxStayMinutes,
      stay30,
      stay60,
      stay30Rate: pct(stay30, attended),
      stay60Rate: pct(stay60, attended),
    },
    currentViewers: currentViewers.map((row) => ({
      ...row,
      currentStayMinutes: Math.max(row.stayMinutes, minutesBetween(row.enteredAt, row.lastPingAt ?? now)),
      isLive: !!row.lastPingAt && row.lastPingAt >= activeSince,
    })),
    latestQuestions,
    generatedAt: now.toISOString(),
  });
}
