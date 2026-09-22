/**
 * 링크 추가.
 *
 * 제목·기관을 비워 보내면 서버가 그 페이지를 열어 채운다(link-preview — SSRF 차단 포함).
 * **단축링크로 들어온 주소는 끝까지 따라간 원문으로 저장한다**(buly.kr → 기업마당). 그래야
 * 같은 공고가 다른 단축 주소로 또 들어와도 중복으로 잡히고, 우리 단축링크가 원문을 바로 가리킨다.
 *
 * 손으로 넣은 링크는 기본 **채택**이다 — 사람이 골라서 넣은 것이라서. 자동 수집분은 기본 미채택.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardBrief, shortBase, ensureShortLink } from "@/lib/brief/server";
import { briefItemInclude, toClientItem } from "@/lib/brief/queries";
import { isBriefCategory, isHttpUrl, urlKey } from "@/lib/brief/model";
import { fetchLinkPreview } from "@/lib/brief/link-preview";
import { parseDueDate } from "@/lib/brief/input";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guardBrief(id, { write: true });
  if (!g.ok) return g.response;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const rawUrl = typeof body?.url === "string" ? body.url.trim() : "";
  const category = body?.category;
  if (!isHttpUrl(rawUrl)) return NextResponse.json({ error: "http(s) 주소를 넣어주세요" }, { status: 400 });
  if (!isBriefCategory(category)) return NextResponse.json({ error: "분류를 골라주세요" }, { status: 400 });

  let title = typeof body?.title === "string" ? body.title.trim() : "";
  let org = typeof body?.org === "string" ? body.org.trim() : "";
  let url = rawUrl;
  if (!title || !org) {
    const preview = await fetchLinkPreview(rawUrl);
    if (preview) {
      title ||= preview.title;
      org ||= preview.siteName;
      url = preview.finalUrl;
    }
  }
  if (!title) return NextResponse.json({ error: "제목을 가져오지 못했어요. 직접 적어주세요" }, { status: 422 });

  const key = urlKey(url);
  const dup = await prisma.briefItem.findUnique({
    where: { briefId_urlKey: { briefId: id, urlKey: key } },
    include: briefItemInclude,
  });
  if (dup) {
    return NextResponse.json({ error: "이미 들어 있는 링크예요", item: toClientItem(dup, shortBase(request)) }, { status: 409 });
  }

  const adopted = typeof body?.adopted === "boolean" ? body.adopted : true;
  const created = await prisma.briefItem.create({
    data: {
      briefId: id,
      category,
      org: org.slice(0, 80),
      title: title.slice(0, 300),
      url,
      urlKey: key,
      dueDate: parseDueDate(body?.dueDate),
      dateLabel: typeof body?.dateLabel === "string" ? body.dateLabel.trim().slice(0, 40) : "",
      source: "manual",
      adopted,
      createdById: g.userId,
    },
  });
  if (adopted) await ensureShortLink(created, { workspaceId: g.workspaceId, userId: g.userId });

  const item = await prisma.briefItem.findUniqueOrThrow({ where: { id: created.id }, include: briefItemInclude });
  return NextResponse.json({ item: toClientItem(item, shortBase(request)) }, { status: 201 });
}
