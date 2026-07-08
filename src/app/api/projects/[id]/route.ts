import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

async function authorizeProject(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.deletedAt) return { project: null, canManage: false };

  const [workspaceMember, projectMember] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: project.workspaceId } },
    }),
    prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } },
    }),
  ]);

  const canManage =
    !!workspaceMember &&
    (workspaceMember.role === "OWNER" ||
      workspaceMember.role === "ADMIN" ||
      projectMember?.role === "ADMIN");

  return { project, canManage };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = body.description;

  if (!name) return NextResponse.json({ error: "프로젝트 이름을 입력해주세요" }, { status: 400 });
  if (name.length > 80) return NextResponse.json({ error: "프로젝트 이름은 80자 이하로 입력해주세요" }, { status: 400 });

  const { project, canManage } = await authorizeProject(id, user.id);
  if (!project) return NextResponse.json({ error: "프로젝트 없음" }, { status: 404 });
  if (!canManage) return NextResponse.json({ error: "프로젝트 관리 권한 없음" }, { status: 403 });

  const updated = await prisma.project.update({
    where: { id },
    data: {
      name,
      ...(description !== undefined && {
        description: typeof description === "string" && description.trim() ? description.trim() : null,
      }),
    },
  });

  await logActivity({
    workspaceId: project.workspaceId,
    userId: user.id,
    action: "project.updated",
    meta: { projectId: id, before: { name: project.name }, after: { name: updated.name } },
  });

  return NextResponse.json({ project: updated });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const { project, canManage } = await authorizeProject(id, user.id);
  if (!project) return NextResponse.json({ error: "프로젝트 없음" }, { status: 404 });
  if (!canManage) return NextResponse.json({ error: "프로젝트 관리 권한 없음" }, { status: 403 });

  // 워크스페이스에 프로젝트가 하나뿐이면 삭제 불가 — 빈 워크스페이스(막다른 상태) 방지
  const remaining = await prisma.project.count({
    where: { workspaceId: project.workspaceId, deletedAt: null },
  });
  if (remaining <= 1) {
    return NextResponse.json({ error: "마지막 프로젝트는 삭제할 수 없어요" }, { status: 400 });
  }

  // 소프트 삭제 — 하위 데이터는 보존하되 목록에서 감춘다(deletedAt 필터). 복구 가능.
  await prisma.project.update({ where: { id }, data: { deletedAt: new Date() } });

  await logActivity({
    workspaceId: project.workspaceId,
    userId: user.id,
    action: "project.deleted",
    meta: { projectId: id, name: project.name },
  });

  return NextResponse.json({ ok: true });
}
