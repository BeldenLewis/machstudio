import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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
      workspaceId: true, // 미공개 랜딩을 소유자에게만 열어주는 멤버십 검사용
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

  // 종료 화면에 연결된 자체 설문 — 있으면 외부 surveyUrl 보다 우선한다 (id/title 만 공개)
  const endedSurvey = await prisma.webinarSurvey.findFirst({
    where: { webinarId: webinar.id, showOnEnded: true, isOpen: true, OR: [{ closesAt: null }, { closesAt: { gt: new Date() } }] },
    select: { id: true, title: true },
  });

  // config 는 뷰어가 실제로 쓰는 키만 allowlist 로 노출 — youtubeId(입장 verify 시 전달) 및
  // 향후 추가될 수 있는 민감 키(토큰·내부 URL 등)가 실수로 공개되지 않도록 blocklist 대신 allowlist.
  const rawConfig = (webinar.config ?? {}) as Record<string, unknown>;
  const config: Record<string, unknown> = {
    calendarUrl: rawConfig.calendarUrl,
    surveyUrl: rawConfig.surveyUrl,
    livePage: rawConfig.livePage,
    registrationForm: rawConfig.registrationForm,
  };

  // 미공개 랜딩은 **서버에서** 콘텐츠를 제거한다. 예전엔 landingPage 를 무조건 실어 보내고
  // 브라우저의 게이트에만 의존했다 → curl·view-source 로 미공개 히어로·연사 약력·FAQ 가 다 읽혔고,
  // ?preview 쿼리만 붙이면 비로그인 방문자에게도 그대로 렌더됐다.
  // 소유자(워크스페이스 멤버)에게만 전체를 주고, 그 외에는 enabled:false 만 남긴다.
  const landingRaw = rawConfig.landingPage;
  const landingEnabled =
    landingRaw && typeof landingRaw === "object" && !Array.isArray(landingRaw)
      ? (landingRaw as Record<string, unknown>).enabled === true
      : false;
  if (landingEnabled) {
    config.landingPage = landingRaw;
  } else {
    let isOwner = false;
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const membership = await prisma.workspaceMember.findUnique({
          where: { userId_workspaceId: { userId: user.id, workspaceId: webinar.workspaceId } },
        });
        isOwner = Boolean(membership);
      }
    } catch {
      isOwner = false; // 인증 조회 실패는 비소유자로 취급(공개 경로를 막지 않는다)
    }
    // 비소유자에게는 "비공개" 사실만 알린다 — 렌더러가 안내 문구를 그린다.
    config.landingPage = isOwner ? landingRaw : { enabled: false };
  }

  return NextResponse.json(
    {
      webinar: { ...webinar, config },
      endedSurvey,
      status: statusInfo.status,
      entryOpen: statusInfo.entryOpen,
      canRegister: statusInfo.canRegister,
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
