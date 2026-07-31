import { NextResponse } from "next/server";
import { surveyAcceptingWhere } from "@/lib/webinar-survey";
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

  /**
   * 종료 화면에 연결된 자체 설문 — 있으면 외부 surveyUrl 보다 우선한다(공개 값은 id/제목/설명뿐).
   * **여러 개** 걸 수 있다: 만족도 설문 + 다음 행사 사전조사처럼.
   */
  const endedSurveys = await prisma.webinarSurvey.findMany({
    where: { webinarId: webinar.id, showOnEnded: true, ...surveyAcceptingWhere() },
    // 만든 순서대로 — 종료 화면 카드 순서가 관리자 목록 순서와 같아야 어느 카드를 고칠지 알 수 있다
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, description: true, ctaLabel: true },
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
  // ?preview 를 존중할지는 **서버가** 정한다. 예전엔 쿼리스트링만 보고 렌더러가 게이트를 열어,
  // 비로그인 방문자가 ?preview 를 붙이면 미공개 웨비나가 (기본값으로 채워진) 랜딩처럼 그려졌다.
  let landingPreviewAllowed = false;
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
    landingPreviewAllowed = isOwner;
  }

  // workspaceId 는 위 멤버십 검사에만 쓰는 내부 식별자다 — 공개 응답에서 뺀다.
  const { workspaceId: _workspaceId, ...publicWebinar } = webinar;

  /* 등록자별 설문 완료 목록 — registrationId 가 이 웨비나 등록 건일 때만 센다(타 웨비나·위조 id 차단). */
  const reqRegistrationId = new URL(request.url).searchParams.get("registrationId");
  let completedSurveyIds: string[] = [];
  if (reqRegistrationId) {
    const owned = await prisma.webinarRegistration.findFirst({
      where: { id: reqRegistrationId, webinarId: webinar.id },
      select: { id: true },
    });
    if (owned) {
      const done = await prisma.webinarSurveyResponse.findMany({
        where: { webinarId: webinar.id, registrationId: owned.id },
        select: { surveyId: true },
      });
      completedSurveyIds = done.map((d) => d.surveyId);
    }
  }

  return NextResponse.json(
    {
      webinar: { ...publicWebinar, config },
      landingPreviewAllowed,
      endedSurveys,
      /**
       * 이 등록자가 이미 낸 설문 id 들. ?registrationId= 를 준 요청에만 실린다.
       * 자료 게이팅(LiveResource.surveyId)이 이 목록을 보고 자물쇠를 푼다.
       *
       * 남의 registrationId 를 넣어 남이 낸 설문을 알아내는 건 막을 수 없지만, 알아낼 수 있는
       * 것은 **불리언 하나**(냈는지)뿐이고 응답 내용은 실리지 않는다. 자료 URL 은 어차피 공개
       * config 에 있으므로 이 값으로 새는 정보가 늘지 않는다.
       */
      completedSurveyIds,
      /* 한 배포 동안 남기는 단일 키 — 이 응답은 캐시될 수 있어서, 새 클라이언트가 옛 payload 를
         받는 창이 있다. 그 창에서 설문 카드가 사라지지 않게 첫 번째를 그대로 실어 보낸다.
         다음 배포에서 제거. */
      endedSurvey: endedSurveys[0] ?? null,
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
