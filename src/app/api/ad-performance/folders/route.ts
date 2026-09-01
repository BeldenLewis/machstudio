import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

function dateOnly(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00+09:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function membership(workspaceId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId } },
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");
  const projectId = searchParams.get("projectId");
  if (!workspaceId || !projectId) return NextResponse.json({ error: "workspaceId/projectId 필요" }, { status: 400 });
  if (!await membership(workspaceId)) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId, deletedAt: null }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  const folders = await prisma.adPerformanceFolder.findMany({
    where: { workspaceId, projectId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { records: true, imports: true } } },
  });
  return NextResponse.json({ folders });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const workspaceId = typeof body?.workspaceId === "string" ? body.workspaceId : "";
  const projectId = typeof body?.projectId === "string" ? body.projectId : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const reportStart = dateOnly(body?.reportStart);
  const reportEnd = dateOnly(body?.reportEnd);
  if (!workspaceId || !projectId || !name || !reportStart || !reportEnd) {
    return NextResponse.json({ error: "폴더명과 조회 기간을 모두 입력해주세요." }, { status: 400 });
  }
  if (reportStart > reportEnd) return NextResponse.json({ error: "종료일은 시작일보다 빠를 수 없습니다." }, { status: 400 });
  const member = await membership(workspaceId);
  if (!member || member.role === "MEMBER") return NextResponse.json({ error: "폴더 생성 권한 없음" }, { status: 403 });
  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId, deletedAt: null }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });

  const folder = await prisma.adPerformanceFolder.create({
    data: {
      workspaceId, projectId, name: name.slice(0, 100),
      description: typeof body.description === "string" ? body.description.trim().slice(0, 500) || null : null,
      reportStart, reportEnd,
      currency: typeof body.currency === "string" ? body.currency.slice(0, 8) : "KRW",
      timezone: "Asia/Seoul",
      mediaAccounts: [],
    },
  });
  return NextResponse.json({ folder }, { status: 201 });
}
