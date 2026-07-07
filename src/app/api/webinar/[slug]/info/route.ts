import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const webinar = await prisma.webinar.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      liveStartAt: true,
      liveEndAt: true,
      signupDeadline: true,
      theme: true,
      config: true,
      sessions: { orderBy: { number: "asc" } },
      // _count(등록자 수)는 공개 엔드포인트라 제거 — 라이브 페이지가 사용하지 않음
    },
  });

  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });

  return NextResponse.json({ webinar }, {
    headers: { "Access-Control-Allow-Origin": "*" },
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
