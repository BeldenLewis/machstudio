import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWebinarStatus } from "@/lib/webinar-status";

// 경량 상태 전용 엔드포인트 — 라이브 전(사전등록·입장 대기) 폴링이 /info 전체(세션·테마·config)를
// 30초마다 다시 받지 않도록, 상태 전환 판정에 필요한 값만 반환한다.
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const webinar = await prisma.webinar.findUnique({
    where: { slug },
    select: { statusOverride: true, liveStartAt: true, liveEndAt: true, signupDeadline: true, components: true },
  });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404, headers: { "Access-Control-Allow-Origin": "*" } });

  const statusInfo = resolveWebinarStatus(webinar);
  return NextResponse.json(
    { status: statusInfo.status, entryOpen: statusInfo.entryOpen, canRegister: statusInfo.canRegister, serverNow: new Date().toISOString() },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET" } });
}
