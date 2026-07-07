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
    registrations,
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
    prisma.webinarRegistration.findMany({
      where: { webinarId: id },
      select: {
        id: true,
        enteredAt: true,
        lastPingAt: true,
        stayMinutes: true,
      },
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

  const stayValues = registrations
    .filter((row) => row.enteredAt)
    .map((row) => Math.max(row.stayMinutes, minutesBetween(row.enteredAt, row.lastPingAt ?? now)));
  const avgStayMinutes = stayValues.length
    ? Math.round(stayValues.reduce((sum, value) => sum + value, 0) / stayValues.length)
    : 0;
  const maxStayMinutes = stayValues.length ? Math.max(...stayValues) : 0;
  const stay30 = stayValues.filter((value) => value >= 30).length;
  const stay60 = stayValues.filter((value) => value >= 60).length;

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
