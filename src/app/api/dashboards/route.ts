import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");
  const projectId = searchParams.get("projectId");
  if (!workspaceId || !projectId) {
    return NextResponse.json({ error: "workspaceId, projectId 필요" }, { status: 400 });
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  // projectId 가 이 워크스페이스 소속인지 확인한다. 멤버십은 workspaceId 로만 봤고 조회는
  // projectId 로만 해서, "내 workspaceId + 남의 projectId" 조합으로 남의 보드가 전부 나왔다
  // (아래 select 로 걸러도 자동 생성 분기가 남의 프로젝트에 쓰기까지 했다).
  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });

  // shareToken·sharePasswordHash 는 목록에 실리면 안 된다 — 토큰만으로 공개 보드가 열리고
  // 해시는 오프라인 대입 대상이 된다. 단일 보드 라우트([id])는 이미 명시적으로 뺀다.
  const dashboardSelect = {
    id: true, projectId: true, workspaceId: true, name: true, description: true,
    isDefault: true, sortOrder: true, shareEnabled: true, createdAt: true, updatedAt: true,
    _count: { select: { widgets: true } },
  } as const;

  const dashboards = await prisma.dashboard.findMany({
    where: { projectId, workspaceId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: dashboardSelect,
  });

  // 보드가 하나도 없으면 기본 보드 자동 생성
  if (dashboards.length === 0) {
    const created = await prisma.dashboard.create({
      data: {
        projectId, workspaceId,
        name: "기본 보드",
        isDefault: true,
        sortOrder: 0,
      },
      select: dashboardSelect,
    });
    return NextResponse.json({ dashboards: [created] });
  }

  return NextResponse.json({ dashboards });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const body = await request.json();
  const { workspaceId, projectId, name, description, cloneFromId } = body;
  if (!workspaceId || !projectId || !name) {
    return NextResponse.json({ error: "workspaceId, projectId, name 필요" }, { status: 400 });
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  // GET 과 같은 이유 — projectId 를 검증하지 않으면 남의 프로젝트에 보드를 만들 수 있다.
  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });

  // 다음 sortOrder
  const last = await prisma.dashboard.findFirst({
    where: { projectId, workspaceId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  const dashboard = await prisma.dashboard.create({
    data: { workspaceId, projectId, name, description: description || null, sortOrder },
  });

  // 복제 옵션
  if (typeof cloneFromId === "string" && cloneFromId) {
    const src = await prisma.dashboard.findFirst({
      where: { id: cloneFromId, workspaceId },
      include: { widgets: { orderBy: { position: "asc" } } },
    });
    if (src) {
      for (let i = 0; i < src.widgets.length; i++) {
        const w = src.widgets[i];
        await prisma.dashboardWidget.create({
          data: {
            dashboardId: dashboard.id,
            projectId,
            workspaceId,
            type: w.type,
            title: w.title,
            config: w.config as never,
            width: w.width,
            position: i,
          },
        });
      }
    }
  }

  await logActivity({
    workspaceId,
    userId: user.id,
    action: "dashboard.created",
    meta: { dashboardId: dashboard.id, name: dashboard.name, projectId, cloneFromId: cloneFromId || null },
  });

  return NextResponse.json({ dashboard }, { status: 201 });
}
