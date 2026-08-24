import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function requireMember(workspaceId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "인증 필요" }, { status: 401 }) };
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId } },
  });
  if (!membership) return { error: NextResponse.json({ error: "접근 권한 없음" }, { status: 403 }) };
  return { user };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");
  const projectId = searchParams.get("projectId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId 필요" }, { status: 400 });

  const auth = await requireMember(workspaceId);
  if ("error" in auth) return auth.error;

  const sites = await prisma.webinarEmbedSite.findMany({
    where: { workspaceId, ...(projectId ? { projectId } : {}), deletedAt: null },
    include: { activeWebinar: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ sites });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { workspaceId, projectId, name, siteUrl, livePageUrl, activeWebinarId } = body;

  if (!workspaceId || !projectId || !name?.trim()) {
    return NextResponse.json({ error: "필수 항목이 누락됐어요" }, { status: 400 });
  }

  const auth = await requireMember(workspaceId);
  if ("error" in auth) return auth.error;

  // projectId 가 이 워크스페이스 소속인지 검증 — 교차 테넌트 FK 기록·무효 ID 500 방지
  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 400 });

  if (activeWebinarId) {
    const webinar = await prisma.webinar.findFirst({ where: { id: activeWebinarId, workspaceId, projectId }, select: { id: true } });
    if (!webinar) return NextResponse.json({ error: "노출할 웨비나를 찾을 수 없어요" }, { status: 400 });
  }

  const site = await prisma.webinarEmbedSite.create({
    data: {
      workspaceId,
      projectId,
      name: String(name).trim(),
      siteUrl: siteUrl?.trim() || null,
      livePageUrl: livePageUrl?.trim() || null,
      activeWebinarId: activeWebinarId || null,
    },
    include: { activeWebinar: { select: { id: true, name: true, slug: true } } },
  });

  return NextResponse.json({ site }, { status: 201 });
}
