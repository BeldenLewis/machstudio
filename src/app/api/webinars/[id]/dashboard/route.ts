import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { ACTIVE_VIEWER_WINDOW_MS, resolveWebinarStatus } from "@/lib/webinar-status";
import { resolveWatchCapMinutes } from "@/lib/webinar-scoring";

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
  const activeSince = new Date(now.getTime() - ACTIVE_VIEWER_WINDOW_MS);
  const presenceSince = new Date(now.getTime() - 5 * 60 * 1000);

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
    earliestEntry,
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
    // 체류 상한의 하한(아래 capMinutes) 산정용 — 실제 관측이 시작된 시각.
    prisma.webinarRegistration.aggregate({
      where: { webinarId: id, enteredAt: { not: null } },
      _min: { enteredAt: true },
    }),
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
        connectedSeconds: true,
        focusSeconds: true,
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

  // 체류 상한 — 하한은 "예정 liveStartAt" 이 아니라 실제 관측 시작 시각(earliestEntry)과
  // liveStartAt 중 이른 쪽(webinar-scoring.ts 의 assembleWebinarEngagement 와 동일 규칙).
  // statusOverride="live" 로 예정 시각 전에 강제 라이브 전환하면 하한을 liveStartAt 에 고정한
  // 기존 계산은 상한 구간이 음수(0 클램프)가 되어 체류가 전부 사라졌다.
  const earliestObservedAt = earliestEntry._min.enteredAt?.getTime() ?? null;
  const capMinutes = resolveWatchCapMinutes(now.getTime(), webinar.liveStartAt.getTime(), webinar.liveEndAt.getTime(), earliestObservedAt);

  // EGRESS: 체류 통계는 전 행을 JS로 옮기지 않고 Postgres에서 집계 (avg/max/stay30/stay60)
  const stayStats = await prisma.$queryRaw<
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
      -- 접속 시간(connectedSeconds)이 단일 소스 — ping 간격 누적이라 구간 겹침으로 이중계산되지 않는다.
      -- 0 인데 입장 기록이 있으면 이 컬럼 도입 전 데이터 → 옛 스팬으로만 폴백.
      SELECT LEAST(
        CASE WHEN COALESCE(r."connectedSeconds", 0) > 0
          THEN FLOOR(r."connectedSeconds" / 60.0)::int
          ELSE GREATEST(
            COALESCE(r."stayMinutes", 0),
            FLOOR(EXTRACT(EPOCH FROM (COALESCE(r."lastPingAt", now()) - r."enteredAt")) / 60)
          )
        END,
        ${capMinutes}::int
      ) AS "eff"
      FROM "WebinarRegistration" r
      WHERE r."enteredAt" IS NOT NULL AND r."webinarId" = ${id}
    ) sub
  `;

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
      // 접속 시간 기준(자리비움 제외). 0 이면 컬럼 도입 전 데이터라 옛 스팬으로 폴백.
      currentStayMinutes: row.connectedSeconds > 0
        ? Math.floor(row.connectedSeconds / 60)
        : Math.max(row.stayMinutes, minutesBetween(row.enteredAt, row.lastPingAt ?? now)),
      currentFocusMinutes: Math.floor((row.focusSeconds ?? 0) / 60),
      isLive: !!row.lastPingAt && row.lastPingAt >= activeSince,
    })),
    latestQuestions,
    generatedAt: now.toISOString(),
  });
}
