import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: id } },
    include: { workspace: { include: { projects: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } } } } },
  });

  if (!membership) return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  if (membership.workspace.deletedAt) return NextResponse.json({ error: "삭제된 워크스페이스" }, { status: 404 });

  return NextResponse.json({
    workspace: { id: membership.workspace.id, name: membership.workspace.name, slug: membership.workspace.slug },
    projects: membership.workspace.projects,
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const { name } = await request.json();
  if (!name?.trim()) return NextResponse.json({ error: "이름을 입력해주세요" }, { status: 400 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: id } },
    include: { workspace: true },
  });
  if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const before = membership.workspace.name;
  const workspace = await prisma.workspace.update({
    where: { id },
    data: { name: name.trim() },
  });

  await logActivity({
    workspaceId: id,
    userId: user.id,
    action: "workspace.renamed",
    meta: { before, after: workspace.name },
  });

  return NextResponse.json({ workspace });
}

// 워크스페이스 삭제 (soft-delete) — OWNER만 가능. 확인 이름 일치 필수.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const confirmName = typeof body.confirmName === "string" ? body.confirmName.trim() : "";
  if (!confirmName) return NextResponse.json({ error: "워크스페이스 이름 확인이 필요합니다." }, { status: 400 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: id } },
    include: { workspace: true },
  });
  if (!membership) return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  if (membership.role !== "OWNER") {
    return NextResponse.json({ error: "워크스페이스 OWNER만 삭제할 수 있습니다." }, { status: 403 });
  }
  if (membership.workspace.deletedAt) {
    return NextResponse.json({ error: "이미 삭제된 워크스페이스입니다." }, { status: 404 });
  }
  if (membership.workspace.name !== confirmName) {
    return NextResponse.json({ error: "워크스페이스 이름이 일치하지 않습니다." }, { status: 400 });
  }

  await prisma.workspace.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await logActivity({
    workspaceId: id,
    userId: user.id,
    action: "workspace.deleted",
    meta: { name: membership.workspace.name },
  });

  return NextResponse.json({ ok: true });
}
