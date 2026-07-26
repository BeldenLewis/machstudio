import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { parseGrantableRole } from "@/lib/workspace-scope";
import { randomBytes } from "node:crypto";

// 미가입자 이메일로 초대 — 가입 시 자동으로 워크스페이스 멤버십 부여.
// 이메일 발송은 별도 인프라 필요. 여기선 token 만 발급하고 응답으로 가입 링크 반환.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: workspaceId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const body = await request.json();
  const { email, role } = body as { email?: string; role?: string };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "유효한 이메일 필요" }, { status: 400 });
  }
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId } },
  });
  if (!membership || membership.role === "MEMBER") {
    return NextResponse.json({ error: "ADMIN 이상 필요" }, { status: 403 });
  }

  // 역할 부여 권한을 확인한다 — 예전엔 화이트리스트에 OWNER 가 있고 게이트가 'MEMBER 아님'
  // 뿐이라 ADMIN 이 OWNER 로 초대할 수 있었다(역할 변경 PATCH 는 OWNER 부여를 금지하는데
  // 초대 경로가 그 불변식을 우회했다). 멤버십 확인 뒤에 판정해야 actorRole 을 알 수 있다.
  const validRole = parseGrantableRole(role, membership.role);
  if (!validRole) {
    return NextResponse.json({ error: "그 역할로 초대할 권한이 없어요" }, { status: 403 });
  }

  const lowerEmail = email.trim().toLowerCase();

  // 이미 가입된 사용자라면 기존 invitation 로직으로 흡수
  const existingUser = await prisma.user.findUnique({ where: { email: lowerEmail } });
  if (existingUser) {
    // 이미 멤버인지 확인
    const already = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: existingUser.id, workspaceId } },
    });
    if (already) return NextResponse.json({ error: "이미 멤버예요" }, { status: 409 });

    const invitation = await prisma.workspaceInvitation.upsert({
      where: { workspaceId_invitedUserId: { workspaceId, invitedUserId: existingUser.id } },
      create: { workspaceId, invitedUserId: existingUser.id, invitedById: user.id, role: validRole, status: "PENDING" },
      update: { invitedById: user.id, role: validRole, status: "PENDING" },
    });
    // 알림 생성
    await prisma.notification.create({
      data: {
        userId: existingUser.id,
        type: "WORKSPACE_INVITE",
        data: { invitationId: invitation.id, workspaceId } as never,
      },
    });
    return NextResponse.json({ invitation, type: "existing_user" });
  }

  // 미가입자 — 이메일 + token 기반 초대
  const token = randomBytes(24).toString("base64url");
  const invitation = await prisma.workspaceInvitation.create({
    data: {
      workspaceId,
      invitedEmail: lowerEmail,
      invitedById: user.id,
      role: validRole,
      status: "PENDING",
      token,
    },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const signupLink = new URL(`/signup?invite=${token}`, baseUrl).toString();

  return NextResponse.json({
    invitation,
    type: "email_pending",
    signupLink,
    // 운영자가 이메일로 보내거나 카톡으로 전달
    instructions: "이메일 인프라 미연결 — 위 signupLink 를 직접 전달해주세요.",
  });
}
