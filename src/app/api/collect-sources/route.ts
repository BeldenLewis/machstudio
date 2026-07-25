import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const workspaceId = searchParams.get("workspaceId");

  if (!workspaceId) return NextResponse.json({ error: "workspaceId 필요" }, { status: 400 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const sources = await prisma.collectSource.findMany({
    where: { workspaceId, ...(projectId ? { projectId } : {}), deletedAt: null },
    include: {
      _count: { select: { records: true } },
      fieldMappings: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ sources });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const body = await request.json();
  const { workspaceId, projectId, name, description, siteUrl, successTrigger, redirectUrl } = body;

  if (!workspaceId || !projectId || !name) {
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId } },
  });
  if (!membership || membership.role === "MEMBER") {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  // projectId 가 이 워크스페이스 소속인지 검증 — 교차 테넌트 FK 방지.
  // (webinars/route.ts, webinar-embed-sites/route.ts 등은 이미 이 검사를 한다)
  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 400 });

  const source = await prisma.collectSource.create({
    data: {
      workspaceId,
      projectId,
      name,
      description: description || null,
      siteUrl: siteUrl || null,
      successTrigger: successTrigger || "정상적으로 접수되었습니다",
      redirectUrl: redirectUrl || null,
    },
    include: { fieldMappings: true },
  });

  await logActivity({
    workspaceId,
    sourceId: source.id,
    userId: user.id,
    action: "source.created",
    meta: { name: source.name },
  });

  return NextResponse.json({ source }, { status: 201 });
}
