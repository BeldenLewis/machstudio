import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 공개 GET — 현재 활성(발행된) 투표 1개 + 옵션·집계. 없으면 null.
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const webinar = await prisma.webinar.findUnique({ where: { slug }, select: { id: true } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });

  const poll = await prisma.webinarPoll.findFirst({
    where: { webinarId: webinar.id, isActive: true },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      question: true,
      updatedAt: true, // 닫음/재노출 기억 키 (수정·재발행 시 갱신)
      options: { orderBy: { order: "asc" }, select: { id: true, label: true, voteCount: true } },
    },
  });

  return NextResponse.json(
    { poll: poll ?? null },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20" } },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET" },
  });
}
