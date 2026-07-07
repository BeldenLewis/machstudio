/**
 * 웨비나 분석 — 퍼널 / UTM 소스·매체별 분해 / 등록 추이.
 * 수동 새로고침만 (폴링 없음 — egress 배려). 라이브 KPI 는 dashboard 엔드포인트가 담당.
 *
 * 데이터 출처:
 *  - 방문: WebinarVisitStat (아임웹 로더 seen 비콘)
 *  - 등록/입장/체류: WebinarRegistration (UTM 컬럼은 Phase 1 부터 저장)
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function groupKey(source: string | null, medium: string | null) {
  return `${(source ?? "").trim()}|${(medium ?? "").trim()}`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const [
    totalRegistered,
    attended,
    stay30,
    stay60,
    visitAgg,
    regByGroup,
    enteredByGroup,
    visitByGroup,
    trendRows,
  ] = await Promise.all([
    prisma.webinarRegistration.count({ where: { webinarId: id } }),
    prisma.webinarRegistration.count({ where: { webinarId: id, enteredAt: { not: null } } }),
    prisma.webinarRegistration.count({ where: { webinarId: id, stayMinutes: { gte: 30 } } }),
    prisma.webinarRegistration.count({ where: { webinarId: id, stayMinutes: { gte: 60 } } }),
    prisma.webinarVisitStat.aggregate({ where: { webinarId: id }, _sum: { visits: true } }),
    prisma.webinarRegistration.groupBy({
      by: ["utmSource", "utmMedium"],
      where: { webinarId: id },
      _count: { _all: true },
    }),
    prisma.webinarRegistration.groupBy({
      by: ["utmSource", "utmMedium"],
      where: { webinarId: id, enteredAt: { not: null } },
      _count: { _all: true },
    }),
    prisma.webinarVisitStat.groupBy({
      by: ["utmSource", "utmMedium"],
      where: { webinarId: id },
      _sum: { visits: true },
    }),
    // 등록 추이 — KST 일자별. 파라미터 캐스팅은 Prisma 7 raw 관례($N::text) 준수.
    prisma.$queryRawUnsafe<{ d: string; c: bigint }[]>(
      `SELECT to_char("submittedAt" + interval '9 hours', 'YYYY-MM-DD') AS d, COUNT(*)::int AS c
       FROM "WebinarRegistration"
       WHERE "webinarId" = $1::text
       GROUP BY d ORDER BY d ASC`,
      id,
    ),
  ]);

  const visits = visitAgg._sum.visits ?? 0;

  // UTM 분해 — 방문/등록/입장을 (source,medium) 키로 병합
  const merged = new Map<string, { source: string; medium: string; visits: number; registered: number; entered: number }>();
  const ensure = (source: string | null, medium: string | null) => {
    const key = groupKey(source, medium);
    let row = merged.get(key);
    if (!row) {
      row = { source: (source ?? "").trim(), medium: (medium ?? "").trim(), visits: 0, registered: 0, entered: 0 };
      merged.set(key, row);
    }
    return row;
  };
  for (const row of visitByGroup) ensure(row.utmSource, row.utmMedium).visits += row._sum.visits ?? 0;
  for (const row of regByGroup) ensure(row.utmSource, row.utmMedium).registered += row._count._all;
  for (const row of enteredByGroup) ensure(row.utmSource, row.utmMedium).entered += row._count._all;

  const utmBreakdown = Array.from(merged.values())
    .map((row) => ({
      source: row.source || "(direct)",
      medium: row.medium || "(none)",
      visits: row.visits,
      registered: row.registered,
      entered: row.entered,
      regRate: pct(row.registered, row.visits), // 방문 대비 등록 (방문 데이터 있을 때만 의미)
      entryRate: pct(row.entered, row.registered),
    }))
    .sort((a, b) => (b.registered - a.registered) || (b.visits - a.visits));

  const registrationTrend = trendRows.map((row) => ({ date: row.d, count: Number(row.c) }));

  return NextResponse.json({
    funnel: {
      visits,
      registered: totalRegistered,
      attended,
      stay30,
      stay60,
      attendRate: pct(attended, totalRegistered),
      stay30Rate: pct(stay30, attended),
      stay60Rate: pct(stay60, attended),
      regRate: pct(totalRegistered, visits),
    },
    utmBreakdown,
    registrationTrend,
    hasVisitData: visits > 0,
    generatedAt: new Date().toISOString(),
  });
}
