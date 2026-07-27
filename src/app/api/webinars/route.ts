import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { assertScheduleOrder, parseWebinarDate, WebinarScheduleError } from "@/lib/webinar-schedule";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");
  const projectId = searchParams.get("projectId");

  if (!workspaceId) return NextResponse.json({ error: "workspaceId 필요" }, { status: 400 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const webinars = await prisma.webinar.findMany({
    where: { workspaceId, ...(projectId ? { projectId } : {}) },
    include: {
      _count: { select: { registrations: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ webinars });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const body = await request.json();
  const { workspaceId, projectId, name, slug, description, liveStartAt, liveEndAt, signupDeadline, cloneFromId } = body;

  if (!workspaceId || !projectId || !name || !slug || !liveStartAt || !liveEndAt || !signupDeadline) {
    return NextResponse.json({ error: "필수 항목이 누락됐어요" }, { status: 400 });
  }

  // 존재 검증만으로는 부족하다 — 순서까지 본다(PATCH 와 같은 규칙, webinar-schedule).
  // 종료가 시작보다 앞선 웨비나가 저장되면 상태머신이 시작 전에도 '종료'로 판정해 등록·입장이 다 막힌다.
  let startAt: Date, endAt: Date, deadlineAt: Date;
  try {
    startAt = parseWebinarDate(liveStartAt, "시작 시각");
    endAt = parseWebinarDate(liveEndAt, "종료 시각");
    deadlineAt = parseWebinarDate(signupDeadline, "등록 마감");
    assertScheduleOrder(startAt, endAt, deadlineAt);
  } catch (e) {
    if (e instanceof WebinarScheduleError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  // projectId 가 이 워크스페이스 소속인지 검증 — 교차 테넌트 FK·프로젝트 유출 방지
  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 400 });

  const existing = await prisma.webinar.findUnique({ where: { slug } });
  if (existing) return NextResponse.json({ error: "이미 사용 중인 슬러그예요" }, { status: 409 });

  // 기본 테마 — 복제 원본이 없을 때 사용
  let theme: unknown = {
    accentColor: "#6d28d9",
    bgColor: "#0f0f0f",
    surfaceColor: "#1a1a1a",
    textColor: "#ffffff",
    font: "Pretendard",
  };
  let config: unknown = {};
  let components: unknown = undefined;
  // speakerCompany·speakerBio 가 빠져 있어서, 복제하면 연사 소속·약력이 조용히 사라졌다
  // (랜딩 세션 상세 팝업이 이 두 값을 쓴다). 세션 스키마의 텍스트 필드를 전부 싣는다.
  let clonedSessions: {
    number: number; type: string; title: string;
    speaker: string | null; speakerCompany: string | null; speakerPhotoUrl: string | null;
    logoUrl: string | null;
    description: string | null; speakerBio: string | null;
    startTime: string; endTime: string;
  }[] = [];

  // 프로젝트 간 복제 — 같은 워크스페이스의 어느 프로젝트 웨비나든 설정만 복사(일정·slug·등록자 제외).
  if (cloneFromId) {
    const source = await prisma.webinar.findFirst({
      where: { id: cloneFromId, workspaceId },
      select: {
        theme: true,
        config: true,
        components: true,
        sessions: {
          select: {
            number: true, type: true, title: true,
            speaker: true, speakerCompany: true, speakerPhotoUrl: true,
            logoUrl: true,
            description: true, speakerBio: true,
            startTime: true, endTime: true,
          },
          orderBy: { number: "asc" },
        },
      },
    });
    if (!source) return NextResponse.json({ error: "복제할 원본 웨비나를 찾을 수 없어요" }, { status: 400 });
    theme = source.theme;
    // config 는 재사용 가능한 registrationForm 만 복제 (youtubeId·surveyUrl 등 행사별 값 제외)
    const srcConfig = (source.config ?? {}) as Record<string, unknown>;
    config = srcConfig.registrationForm ? { registrationForm: srcConfig.registrationForm } : {};
    components = source.components ?? undefined;
    clonedSessions = source.sessions;
  }

  const webinar = await prisma.webinar.create({
    data: {
      workspaceId,
      projectId,
      name,
      slug,
      description: description ?? null,
      liveStartAt: startAt,
      liveEndAt: endAt,
      signupDeadline: deadlineAt,
      theme: theme as never,
      config: config as never,
      ...(components !== undefined ? { components: components as never } : {}),
      ...(clonedSessions.length ? { sessions: { create: clonedSessions } } : {}),
    },
  });

  await logActivity({
    workspaceId,
    userId: user.id,
    action: "webinar.created",
    meta: { webinarId: webinar.id, slug: webinar.slug, name: webinar.name, projectId, clonedFrom: cloneFromId ?? null },
  });

  return NextResponse.json({ webinar }, { status: 201 });
}
