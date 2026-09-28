/**
 * 발행 — "카톡에 올렸음" 을 기록한다.
 *
 * 그 순간의 텍스트를 그대로 남기고, 들어간 링크에 회차를 박는다. 그래야
 *   · 다음 카톡 텍스트에 같은 링크가 또 안 들어가고
 *   · 대시보드에서 "이 회차의 링크가 몇 번 눌렸나" 를 셀 수 있다.
 * 트랜잭션으로 묶는다 — 기록만 남고 링크에 회차가 안 박히면 다음 주에 같은 걸 또 보낸다.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardBrief, publicBriefUrl, shortBase, ensureShortLink } from "@/lib/brief/server";
import { loadBriefItems, sortBriefItems, toClientItem } from "@/lib/brief/queries";
import { buildKakaoText, formatMonthDay } from "@/lib/brief/model";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guardBrief(id, { write: true });
  if (!g.ok) return g.response;

  let items = await loadBriefItems(id, { adopted: true, unsentOnly: true });
  if (items.length === 0) return NextResponse.json({ error: "내보낼 채택 링크가 없어요" }, { status: 400 });
  for (const i of items) if (!i.shortLink) await ensureShortLink(i, { workspaceId: g.workspaceId, userId: g.userId });
  items = await loadBriefItems(id, { adopted: true, unsentOnly: true });

  const sorted = sortBriefItems(items);
  const text = buildKakaoText(sorted.map((i) => toClientItem(i, shortBase(request))), {
    name: g.brief.name,
    intro: g.brief.intro,
    publicUrl: g.brief.appendPublicLink && g.brief.isPublic ? publicBriefUrl(request, g.brief.slug) : null,
  });

  const issue = await prisma.$transaction(async (tx) => {
    const created = await tx.briefIssue.create({
      data: { briefId: id, title: `${formatMonthDay(new Date())} ${g.brief.name}`, text, createdById: g.userId },
    });
    await tx.briefItem.updateMany({ where: { id: { in: sorted.map((i) => i.id) } }, data: { issueId: created.id } });
    return created;
  });

  return NextResponse.json({ issue: { id: issue.id, title: issue.title, publishedAt: issue.publishedAt }, count: sorted.length }, { status: 201 });
}
