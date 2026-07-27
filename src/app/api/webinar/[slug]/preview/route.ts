import { NextResponse } from "next/server";
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

  // /info 와 동일 — 종료 화면에 연결된 자체 설문(여러 개). 미리보기가 실제 시청자와 같은 화면을 보도록.
  const endedSurveys = await prisma.webinarSurvey.findMany({
    where: { webinarId: webinar.id, showOnEnded: true, isOpen: true, OR: [{ closesAt: null }, { closesAt: { gt: new Date() } }] },
    // 만든 순서대로 — 종료 화면 카드 순서가 관리자 목록 순서와 같아야 어느 카드를 고칠지 알 수 있다
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, description: true },
  });

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
    endedSurvey: endedSurveys[0] ?? null, // /info 와 같은 이유로 한 배포 동안 유지
    status: statusInfo.status,
    entryOpen: statusInfo.entryOpen,
    serverNow: new Date().toISOString(),
  });
}
