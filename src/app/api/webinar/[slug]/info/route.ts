import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWebinarStatus } from "@/lib/webinar-status";

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
      statusOverride: true,
      components: true,
      theme: true,
      config: true,
      sessions: { orderBy: { number: "asc" } },
      // _count(등록자 수)는 공개 엔드포인트라 제거 — 라이브 페이지가 사용하지 않음
    },
  });

  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });

  // 상태머신 단일 판정 — 라이브 페이지가 운영 콘솔의 statusOverride·입장오픈 윈도를 반영하도록.
  const statusInfo = resolveWebinarStatus(webinar);

  // config 는 뷰어가 실제로 쓰는 키만 allowlist 로 노출 — youtubeId(입장 verify 시 전달) 및
  // 향후 추가될 수 있는 민감 키(토큰·내부 URL 등)가 실수로 공개되지 않도록 blocklist 대신 allowlist.
  const rawConfig = (webinar.config ?? {}) as Record<string, unknown>;
  const config: Record<string, unknown> = {
    calendarUrl: rawConfig.calendarUrl,
    surveyUrl: rawConfig.surveyUrl,
    livePage: rawConfig.livePage,
    registrationForm: rawConfig.registrationForm,
  };

  return NextResponse.json(
    {
      webinar: { ...webinar, config },
      status: statusInfo.status,
      entryOpen: statusInfo.entryOpen,
      serverNow: new Date().toISOString(),
    },
    { headers: { "Access-Control-Allow-Origin": "*" } },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
    },
  });
}
