import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { generateDashboardReport } from "@/app/api/dashboard-report/route";
import type { RealtimeReportData } from "@/app/(app)/dashboard/RealtimeReport";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId 필요" }, { status: 400 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  // "진행중" = 프로젝트의 사전등록 폼(CollectSource) 중 하나라도 켜져 있음. 별도 상태 필드 없이 기존 폼 on/off 토글을 그대로 기준으로 쓴다.
  const projects = await prisma.project.findMany({
    where: { workspaceId, deletedAt: null },
    include: { collectSources: { where: { deletedAt: null }, select: { isActive: true } } },
    orderBy: { createdAt: "desc" },
  });
  const activeProjects = projects.filter((project) => project.collectSources.some((source) => source.isActive));

  const results = await Promise.all(
    activeProjects.map((project) => generateDashboardReport({ workspaceId, projectId: project.id })),
  );

  const reports = results
    .filter((result): result is { data: RealtimeReportData } => "data" in result && !!result.data)
    .map((result) => result.data);

  return NextResponse.json({ projects: reports });
}
