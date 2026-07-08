import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const webinar = await prisma.webinar.findUnique({ where: { slug }, select: { id: true } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });

  const tallyPushes = await prisma.webinarTallyPush.findMany({
    where: { webinarId: webinar.id, isActive: true },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, title: true, formId: true,
      emojiText: true, emojiAnimation: true,
      layout: true, width: true, autoClose: true,
      showOnce: true, doNotShowAfterSubmit: true,
      updatedAt: true, // 열림 기억 키 — 재ON 시 다시 푸시된다
    },
  });

  return NextResponse.json({ tallyPushes }, {
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
