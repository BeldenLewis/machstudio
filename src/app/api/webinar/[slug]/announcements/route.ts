import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const webinar = await prisma.webinar.findUnique({ where: { slug }, select: { id: true } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });

  const announcements = await prisma.webinarAnnouncement.findMany({
    where: { webinarId: webinar.id, isActive: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, type: true, message: true, createdAt: true },
  });

  return NextResponse.json({ announcements }, {
    // 동시 시청자 15초 폴링 — CDN 캐시로 오리진/DB 부하 흡수 (신규 공지 최대 ~15초 지연 허용)
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
    },
  });
}
