import { NextResponse } from "next/server";
import { surveyOpenState } from "@/lib/webinar-survey";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { resolveWebinarStatus } from "@/lib/webinar-status";

// 소유자 전용 미리보기 페이로드 — 라이브 페이지의 4개 상태(대기·입장확인·라이브·종료)를
// 실제 데이터로 강제 렌더하기 위한 것. 공개 /info 와 동일한 webinar shape + verify 시에만
// 나가는 youtubeId 를 소유자(워크스페이스 멤버)에게만 함께 반환한다. 비소유자는 403 → 미리보기 비활성.
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

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
      workspaceId: true,
      sessions: { orderBy: { number: "asc" } },
    },
  });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: webinar.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const statusInfo = resolveWebinarStatus(webinar);

  /**
   * 종료 화면에 연결된 자체 설문 — 있으면 외부 surveyUrl 보다 우선한다(공개 값은 id/제목/설명뿐).
   * **여러 개** 걸 수 있다: 만족도 설문 + 다음 행사 사전조사처럼.
   *
   * 시간 조건으로 걸러 **내보내지 않는다** — 두 가지가 깨졌다.
   * (1) 지금 안 보내면 화면은 그 설문이 "없다" 고 판단해 옛 외부 URL 로 폴백하거나
   *     자료 게이트를 "닫혔다" 고 단정한다(둘 다 거짓).
   * (2) 판정을 fetch 시점에 굳히면 예약 시각이 지나도 새로고침 전까지 안 열린다.
   * 대신 **응답 기간 원본**을 실어 보내고 화면이 자기 시계로 판정한다. 운영자가 껐거나(off)
   * 이미 마감된(closed) 설문만 서버에서 뺀다 — 그건 화면에 할 말이 없다.
   */
  const linkedEndedSurveys = await prisma.webinarSurvey.findMany({
    where: { webinarId: webinar.id, showOnEnded: true },
    // 만든 순서대로 — 종료 화면 카드 순서가 관리자 목록 순서와 같아야 어느 카드를 고칠지 알 수 있다
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, description: true, ctaLabel: true, isOpen: true, opensAt: true, closesAt: true },
  });
  const endedSurveys = linkedEndedSurveys
    .filter((s) => {
      const st = surveyOpenState(s);
      return st === "open" || st === "before";
    })
    .map((s) => ({
      id: s.id, title: s.title, description: s.description, ctaLabel: s.ctaLabel,
      isOpen: s.isOpen,
      opensAt: s.opensAt ? s.opensAt.toISOString() : null,
      closesAt: s.closesAt ? s.closesAt.toISOString() : null,
    }));
  // 배타적 폴백은 **존재 여부**로 판정한다(응답 기간과 무관) — endedSurveyLinks 주석 참고.
  const hasInternalEndedSurvey = linkedEndedSurveys.length > 0;

  const rawConfig = (webinar.config ?? {}) as Record<string, unknown>;
  // /info 와 동일한 allowlist — 민감 키가 새어나가지 않게.
  const config: Record<string, unknown> = {
    calendarUrl: rawConfig.calendarUrl,
    surveyUrl: rawConfig.surveyUrl,
    livePage: rawConfig.livePage,
    registrationForm: rawConfig.registrationForm,
  };
  const youtubeId = typeof rawConfig.youtubeId === "string" ? rawConfig.youtubeId : null;

  return NextResponse.json({
    authorized: true,
    webinar: {
      id: webinar.id,
      name: webinar.name,
      slug: webinar.slug,
      description: webinar.description,
      liveStartAt: webinar.liveStartAt,
      liveEndAt: webinar.liveEndAt,
      signupDeadline: webinar.signupDeadline,
      statusOverride: webinar.statusOverride,
      components: webinar.components,
      theme: webinar.theme,
      sessions: webinar.sessions,
      config,
    },
    youtubeId,
    endedSurveys,
    hasInternalEndedSurvey, // /info 와 동일 — 외부 URL 배타 폴백 판정용
    endedSurvey: endedSurveys[0] ?? null, // /info 와 같은 이유로 한 배포 동안 유지
    status: statusInfo.status,
    entryOpen: statusInfo.entryOpen,
    serverNow: new Date().toISOString(),
  });
}
