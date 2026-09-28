/**
 * 카톡 텍스트 — **채택했고 아직 안 나간** 링크만.
 * 이미 카톡으로 나간 건(issueId 있음) 다시 안 넣는다 — 같은 공고를 두 번 받으면 채널 신뢰가 깎인다.
 */
import { NextResponse } from "next/server";
import { guardBrief, publicBriefUrl, shortBase, ensureShortLink } from "@/lib/brief/server";
import { loadBriefItems, sortBriefItems, toClientItem } from "@/lib/brief/queries";
import { buildKakaoText } from "@/lib/brief/model";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guardBrief(id, { write: false });
  if (!g.ok) return g.response;

  let items = await loadBriefItems(id, { adopted: true, unsentOnly: true });
  // 예전에 채택된 채로 단축링크가 없는 줄이 있으면 여기서 채운다(쓰기 권한이 있을 때만).
  if (g.canWrite && items.some((i) => !i.shortLink)) {
    for (const i of items) if (!i.shortLink) await ensureShortLink(i, { workspaceId: g.workspaceId, userId: g.userId });
    items = await loadBriefItems(id, { adopted: true, unsentOnly: true });
  }

  const base = shortBase(request);
  const sorted = sortBriefItems(items).map((i) => toClientItem(i, base));
  const text = buildKakaoText(sorted, {
    name: g.brief.name,
    intro: g.brief.intro,
    publicUrl: g.brief.appendPublicLink && g.brief.isPublic ? publicBriefUrl(request, g.brief.slug) : null,
  });
  return NextResponse.json({ text, count: sorted.length });
}
