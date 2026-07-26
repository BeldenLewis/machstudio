import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { parseGrantableRole } from "@/lib/workspace-scope";
import { logActivity } from "@/lib/activity";

async function requireMembership(userId: string, workspaceId: string) {
  return prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
}

// 멤버 목록 조회
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const membership = await requireMembership(user.id, id);
  if (!membership) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: id },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    orderBy: { joinedAt: "asc" },
  });

  return NextResponse.json({ members });
}

// 멤버 초대 (이메일로 → 초대 대기)
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const membership = await requireMembership(user.id, id);
  if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
    return NextResponse.json({ error: "초대 권한이 없어요" }, { status: 403 });
  }

  const { email, role: rawRole } = await request.json();
  if (!email) return NextResponse.json({ error: "이메일을 입력해주세요" }, { status: 400 });

  // 여기엔 role 검증이 **아예 없었다** — body 의 값이 그대로 invitation.role 로 들어가고,
  // 수락 경로가 `role: invitation.role` 로 create 하므로 ADMIN 이 OWNER 를 만들 수 있었다.
  // 아래 PATCH 는 `["ADMIN","MEMBER"]` 로 막는데 이 경로만 빠져 있었다.
  const role = parseGrantableRole(rawRole, membership.role);
  if (!role) {
    return NextResponse.json({ error: "그 역할로 초대할 권한이 없어요" }, { status: 403 });
  }

  const invitedUser = await prisma.user.findUnique({ where: { email } });
  if (!invitedUser) {
    return NextResponse.json({ error: "해당 이메일로 가입된 계정이 없어요. 먼저 가입 후 초대해주세요." }, { status: 404 });
  }

  const alreadyMember = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: invitedUser.id, workspaceId: id } },
  });
  if (alreadyMember) {
    return NextResponse.json({ error: "이미 워크스페이스 멤버예요" }, { status: 409 });
  }

  const existingInvitation = await prisma.workspaceInvitation.findUnique({
    where: { workspaceId_invitedUserId: { workspaceId: id, invitedUserId: invitedUser.id } },
  });
  if (existingInvitation?.status === "PENDING") {
    return NextResponse.json({ error: "이미 초대가 전송됐어요" }, { status: 409 });
  }

  const workspace = await prisma.workspace.findUnique({ where: { id }, select: { name: true } });
  const inviter = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true, email: true } });

  const invitation = await prisma.workspaceInvitation.upsert({
    where: { workspaceId_invitedUserId: { workspaceId: id, invitedUserId: invitedUser.id } },
    update: { status: "PENDING", role, invitedById: user.id },
    create: { workspaceId: id, invitedUserId: invitedUser.id, invitedById: user.id, role },
  });

  await prisma.notification.create({
    data: {
      userId: invitedUser.id,
      type: "WORKSPACE_INVITE",
      data: {
        invitationId: invitation.id,
        workspaceId: id,
        workspaceName: workspace?.name ?? "",
        inviterName: inviter?.name || inviter?.email || "",
        role,
      },
    },
  });

  await logActivity({
    workspaceId: id,
    userId: user.id,
    action: "workspace.member.invited",
    meta: { email, role, invitationId: invitation.id, targetUserId: invitedUser.id },
  });

  return NextResponse.json({ ok: true });
}

// 역할 변경
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const membership = await requireMembership(user.id, id);
  if (!membership || membership.role !== "OWNER") {
    return NextResponse.json({ error: "소유자만 역할을 변경할 수 있어요" }, { status: 403 });
  }

  const { memberId, role } = await request.json();
  if (!["ADMIN", "MEMBER"].includes(role)) {
    return NextResponse.json({ error: "올바른 역할이 아니에요" }, { status: 400 });
  }

  const target = await prisma.workspaceMember.findUnique({ where: { id: memberId } });
  if (!target || target.workspaceId !== id) {
    return NextResponse.json({ error: "멤버를 찾을 수 없어요" }, { status: 404 });
  }
  if (target.role === "OWNER") {
    return NextResponse.json({ error: "소유자의 역할은 변경할 수 없어요" }, { status: 403 });
  }

  const workspace = await prisma.workspace.findUnique({ where: { id }, select: { name: true } });

  const updated = await prisma.workspaceMember.update({
    where: { id: memberId },
    data: { role },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
  });

  await prisma.notification.create({
    data: {
      userId: target.userId,
      type: "ROLE_CHANGED",
      data: { workspaceId: id, workspaceName: workspace?.name ?? "", role },
    },
  });

  await logActivity({
    workspaceId: id,
    userId: user.id,
    action: "workspace.member.role_changed",
    meta: { targetUserId: target.userId, memberId, oldRole: target.role, newRole: role },
  });

  return NextResponse.json({ member: updated });
}

// 멤버 제거
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const membership = await requireMembership(user.id, id);
  if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const { memberId } = await request.json();

  // workspaceId 확인은 필수다. 위 PATCH 는 하고 DELETE 만 빠져 있었다 → A 의 관리자가
  // memberId 만 알면 B 의 멤버를 제거할 수 있었고, 피해자에게는 A 이름으로 제거 알림이 갔다.
  const target = await prisma.workspaceMember.findUnique({ where: { id: memberId } });
  if (!target || target.workspaceId !== id) {
    return NextResponse.json({ error: "멤버를 찾을 수 없어요" }, { status: 404 });
  }
  if (target.role === "OWNER") {
    return NextResponse.json({ error: "소유자는 제거할 수 없어요" }, { status: 403 });
  }
  if (membership.role === "ADMIN" && target.role === "ADMIN") {
    return NextResponse.json({ error: "편집자는 다른 편집자를 제거할 수 없어요" }, { status: 403 });
  }

  const workspace = await prisma.workspace.findUnique({ where: { id }, select: { name: true } });

  await prisma.workspaceMember.delete({ where: { id: memberId } });

  await prisma.notification.create({
    data: {
      userId: target.userId,
      type: "MEMBER_REMOVED",
      data: { workspaceId: id, workspaceName: workspace?.name ?? "" },
    },
  });

  await logActivity({
    workspaceId: id,
    userId: user.id,
    action: "workspace.member.removed",
    meta: { targetUserId: target.userId, memberId, role: target.role },
  });

  return NextResponse.json({ ok: true });
}
