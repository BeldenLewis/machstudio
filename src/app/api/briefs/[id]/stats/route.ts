/**
 * 브리프 대시보드 — 어떤 링크가, 어떤 종류가 실제로 눌렸나.
 *
 * 목적은 "다음엔 이런 걸 더 찾자" 를 정하는 근거다. 그래서 링크별 숫자만이 아니라
 * **분류별·기관별 합계**를 같이 낸다(한 링크가 튀는 것과 한 종류가 꾸준히 눌리는 건 다른 신호다).
 *
 * 순방문(uniques)은 visitorKey(하루 단위 익명 해시) 기준이라 "같은 사람이 같은 날 여러 번" 은 한 번이다.
 * 집계는 SQL 로 한다 — 클릭이 쌓이면 행을 다 가져와 세는 방식은 금방 무거워진다.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardBrief } from "@/lib/brief/server";

interface Row { itemId: string; channel: string; clicks: number; uniques: number }
interface DayRow { day: string; clicks: number }

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guardBrief(id, { write: false });
  if (!g.ok) return g.response;

  const [rows, days, items, issues] = await Promise.all([
    prisma.$queryRaw<Row[]>`
      SELECT bi.id AS "itemId", c.channel AS channel,
             COUNT(*)::int AS clicks, COUNT(DISTINCT c."visitorKey")::int AS uniques
        FROM "BriefItem" bi
        JOIN "ShortLinkClick" c ON c."shortLinkId" = bi."shortLinkId"
       WHERE bi."briefId" = ${id}
       GROUP BY bi.id, c.channel`,
    prisma.$queryRaw<DayRow[]>`
      SELECT to_char((c."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date, 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS clicks
        FROM "BriefItem" bi
        JOIN "ShortLinkClick" c ON c."shortLinkId" = bi."shortLinkId"
       WHERE bi."briefId" = ${id} AND c."createdAt" >= NOW() - INTERVAL '30 days'
       GROUP BY 1 ORDER BY 1`,
    prisma.briefItem.findMany({
      where: { briefId: id, shortLinkId: { not: null } },
      select: { id: true, category: true, org: true, title: true, issueId: true, adopted: true },
    }),
    prisma.briefIssue.findMany({ where: { briefId: id }, select: { id: true, title: true, publishedAt: true }, orderBy: { publishedAt: "desc" } }),
  ]);

  const perItem = new Map<string, { clicks: number; uniques: number; direct: number; web: number }>();
  for (const r of rows) {
    const cur = perItem.get(r.itemId) ?? { clicks: 0, uniques: 0, direct: 0, web: 0 };
    cur.clicks += r.clicks;
    cur.uniques += r.uniques;
    if (r.channel === "web") cur.web += r.clicks;
    else cur.direct += r.clicks;
    perItem.set(r.itemId, cur);
  }

  const itemStats = items
    .map((i) => ({ ...i, ...(perItem.get(i.id) ?? { clicks: 0, uniques: 0, direct: 0, web: 0 }) }))
    .sort((a, b) => b.clicks - a.clicks);

  const sumBy = (key: (i: (typeof itemStats)[number]) => string) => {
    const m = new Map<string, { key: string; clicks: number; items: number }>();
    for (const i of itemStats) {
      const k = key(i) || "(미상)";
      const cur = m.get(k) ?? { key: k, clicks: 0, items: 0 };
      cur.clicks += i.clicks;
      cur.items += 1;
      m.set(k, cur);
    }
    // 링크 수로 나눈 평균도 준다 — 많이 넣어서 많이 눌린 것과, 넣은 만큼 잘 눌린 것은 다르다.
    return [...m.values()]
      .map((v) => ({ ...v, perItem: v.items ? Math.round((v.clicks / v.items) * 10) / 10 : 0 }))
      .sort((a, b) => b.clicks - a.clicks);
  };

  const totals = itemStats.reduce(
    (acc, i) => ({ clicks: acc.clicks + i.clicks, direct: acc.direct + i.direct, web: acc.web + i.web }),
    { clicks: 0, direct: 0, web: 0 },
  );

  return NextResponse.json({
    totals,
    items: itemStats,
    byCategory: sumBy((i) => i.category),
    byOrg: sumBy((i) => i.org).slice(0, 10),
    byIssue: issues.map((iss) => ({
      ...iss,
      clicks: itemStats.filter((i) => i.issueId === iss.id).reduce((s, i) => s + i.clicks, 0),
    })),
    days,
  });
}
