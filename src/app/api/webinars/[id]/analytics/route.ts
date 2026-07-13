/**
 * 웨비나 분석 — 퍼널 / UTM 소스·매체별 분해 / 등록 추이 / 인터랙션 아카이브 / 리드 스코어링.
 * 수동 새로고침만 (폴링 없음 — egress 배려). 라이브 KPI 는 dashboard 엔드포인트가 담당.
 *
 * 체류·참석·세그먼트는 assembleWebinarEngagement(캡 적용 유효 체류)에서 파생 — dashboard 와 동일 규칙.
 * 데이터 출처: 방문=WebinarVisitStat / 등록·입장·체류=WebinarRegistration / 인터랙션=투표·Q&A·채팅.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { assembleWebinarEngagement } from "@/lib/webinar-scoring";

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
  const webinar = await prisma.webinar.findUnique({
    where: { id },
    select: { workspaceId: true, projectId: true, liveStartAt: true, liveEndAt: true },
  });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: webinar.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const [
    totalRegistered,
    visitAgg,
    regByGroup,
    enteredByGroup,
    visitByGroup,
    campaignRegGroup,
    campaignEnteredGroup,
    trendRows,
  ] = await Promise.all([
    prisma.webinarRegistration.count({ where: { webinarId: id } }),
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
    prisma.webinarRegistration.groupBy({
      by: ["utmCampaign"],
      where: { webinarId: id },
      _count: { _all: true },
    }),
    prisma.webinarRegistration.groupBy({
      by: ["utmCampaign"],
      where: { webinarId: id, enteredAt: { not: null } },
      _count: { _all: true },
    }),
    // 등록 추이 — KST 일자별.
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
      regRate: pct(row.registered, row.visits),
      entryRate: pct(row.entered, row.registered),
    }))
    .sort((a, b) => (b.registered - a.registered) || (b.visits - a.visits));

  const registrationTrend = trendRows.map((row) => ({ date: row.d, count: Number(row.c) }));

  // ── 캠페인별 성과 + 광고비 조인 ──
  // 등록/입장을 utmCampaign 으로 나누고, 같은 projectId·campaignName 의 광고 성과가 있으면 비용을 붙인다.
  // 매칭은 캠페인명 정확 일치(대소문자 구분). 미매칭 캠페인은 cost=null.
  const campMap = new Map<string, { campaign: string; registered: number; entered: number }>();
  const ensureCamp = (c: string | null) => {
    const key = (c ?? "").trim();
    let row = campMap.get(key);
    if (!row) {
      row = { campaign: key, registered: 0, entered: 0 };
      campMap.set(key, row);
    }
    return row;
  };
  for (const r of campaignRegGroup) ensureCamp(r.utmCampaign).registered += r._count._all;
  for (const r of campaignEnteredGroup) ensureCamp(r.utmCampaign).entered += r._count._all;

  const campaignNames = Array.from(campMap.values()).map((c) => c.campaign).filter(Boolean);
  const adCostRows = campaignNames.length
    ? await prisma.adPerformanceRecord.groupBy({
        by: ["campaignName"],
        where: { projectId: webinar.projectId, campaignName: { in: campaignNames } },
        _sum: { cost: true },
      })
    : [];
  const costMap = new Map(adCostRows.map((r) => [r.campaignName, Math.round(r._sum.cost ?? 0)]));

  const campaignBreakdown = Array.from(campMap.values())
    .map((c) => {
      const cost = costMap.has(c.campaign) ? costMap.get(c.campaign)! : null;
      return {
        campaign: c.campaign || "(캠페인 없음)",
        registered: c.registered,
        entered: c.entered,
        attendRate: pct(c.entered, c.registered),
        cost,
        cpr: cost != null && c.registered ? Math.round(cost / c.registered) : null,
        cpa: cost != null && c.entered ? Math.round(cost / c.entered) : null,
      };
    })
    .sort((a, b) => (b.registered - a.registered) || (b.entered - a.entered));

  // ── 참여 스코어링 + 인터랙션 아카이브 — 기존 모델 집계만(신규 수집 없음) ──
  const [engagement, pollRows, qaByStatus, qaTop, chatAgg, reminderCount, ctaAgg] = await Promise.all([
    assembleWebinarEngagement(id, { liveStartAt: webinar.liveStartAt, liveEndAt: webinar.liveEndAt }),
    prisma.webinarPoll.findMany({
      where: { webinarId: id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        question: true,
        isActive: true,
        options: { orderBy: { order: "asc" }, select: { label: true, voteCount: true } },
      },
    }),
    prisma.webinarQA.groupBy({ by: ["status"], where: { webinarId: id }, _count: { _all: true } }),
    prisma.webinarQA.findMany({
      where: { webinarId: id },
      orderBy: [{ voteCount: "desc" }, { createdAt: "asc" }],
      take: 5,
      select: { id: true, question: true, voteCount: true, status: true, name: true },
    }),
    prisma.$queryRawUnsafe<{ messages: number; participants: number }[]>(
      `SELECT COUNT(*)::int AS messages,
              COUNT(DISTINCT COALESCE("registrationId", "name"))::int AS participants
       FROM "WebinarChatMessage"
       WHERE "webinarId" = $1::text AND "isHost" = false`,
      id,
    ),
    prisma.webinarReminder.count({ where: { webinarId: id } }),
    prisma.$queryRawUnsafe<{ clicks: number; clickers: number }[]>(
      `SELECT COUNT(*)::int AS clicks, COUNT(DISTINCT "registrationId")::int AS clickers
       FROM "WebinarPopupClick" WHERE "webinarId" = $1::text`,
      id,
    ),
  ]);

  // 체류·참석 — 캡 적용된 engagement 행에서 파생(운영 dashboard와 동일 상한)
  const enteredRows = engagement.rows.filter((r) => r.entered);
  const attended = enteredRows.length;
  const stay30 = enteredRows.filter((r) => r.watchMinutes >= 30).length;
  const stay60 = enteredRows.filter((r) => r.watchMinutes >= 60).length;
  const avgStayMinutes = attended ? Math.round(enteredRows.reduce((s, r) => s + r.watchMinutes, 0) / attended) : 0;
  const maxStayMinutes = enteredRows.reduce((m, r) => Math.max(m, r.watchMinutes), 0);

  // 리드 세그먼트 분포 + 상위 참여자
  const distribution = { hot: 0, warm: 0, cold: 0, noShow: 0 };
  for (const r of engagement.rows) {
    if (!r.entered) distribution.noShow += 1;
    else distribution[r.segment] += 1;
  }
  const topEngaged = [...engagement.rows]
    .filter((r) => r.entered)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((r) => ({
      name: r.name,
      company: r.company,
      score: r.score,
      segment: r.segment,
      watchMinutes: r.watchMinutes,
      chat: r.chat,
      pollVotes: r.pollVotes,
      qaAsks: r.qaAsks,
      qaUpvotes: r.qaUpvotes,
      ctaClicks: r.ctaClicks,
      agreeMarketing: r.agreeMarketing,
    }));

  const qaCount = { pending: 0, answered: 0, dismissed: 0 };
  for (const g of qaByStatus) {
    if (g.status === "pending") qaCount.pending = g._count._all;
    else if (g.status === "answered") qaCount.answered = g._count._all;
    else if (g.status === "dismissed") qaCount.dismissed = g._count._all;
  }
  const qaTotal = qaCount.pending + qaCount.answered + qaCount.dismissed;
  const chatRow = chatAgg[0] ?? { messages: 0, participants: 0 };
  const ctaRow = ctaAgg[0] ?? { clicks: 0, clickers: 0 };

  const interactions = {
    polls: pollRows.map((p) => ({
      id: p.id,
      question: p.question,
      isActive: p.isActive,
      totalVotes: p.options.reduce((sum, o) => sum + o.voteCount, 0),
      options: p.options.map((o) => ({ label: o.label, voteCount: o.voteCount })),
    })),
    qa: {
      total: qaTotal,
      answered: qaCount.answered,
      pending: qaCount.pending,
      dismissed: qaCount.dismissed,
      answerRate: pct(qaCount.answered, qaTotal),
      top: qaTop.map((q) => ({ question: q.question, voteCount: q.voteCount, status: q.status, name: q.name })),
    },
    chat: {
      messages: Number(chatRow.messages) || 0,
      participants: Number(chatRow.participants) || 0,
    },
    cta: {
      clicks: Number(ctaRow.clicks) || 0,
      clickers: Number(ctaRow.clickers) || 0,
    },
    reminders: reminderCount,
  };

  return NextResponse.json({
    funnel: {
      visits,
      registered: totalRegistered,
      attended,
      stay30,
      stay60,
      avgStayMinutes,
      maxStayMinutes,
      attendRate: pct(attended, totalRegistered),
      stay30Rate: pct(stay30, attended),
      stay60Rate: pct(stay60, attended),
      regRate: pct(totalRegistered, visits),
    },
    utmBreakdown,
    campaignBreakdown,
    registrationTrend,
    interactions,
    scoring: {
      total: engagement.rows.length,
      liveMinutes: engagement.liveMinutes,
      distribution,
      top: topEngaged,
    },
    hasVisitData: visits > 0,
    generatedAt: new Date().toISOString(),
  });
}
