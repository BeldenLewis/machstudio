import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

export type RedeemInvitationResult =
  | { ok: true; workspaceId: string }
  | { ok: false; status: number; error: string };

// token 으로 미가입자 초대를 redeem — 이 라우트의 POST 핸들러와
// auth/callback(이메일 확인이 켜져 있을 때 세션이 거기서 처음 생긴다)이 함께 쓴다.
// 가입 시 사용한 이메일과 invitation.invitedEmail 이 일치해야 자동 멤버십 부여.
export async function redeemInvitationToken(
  userId: string,
  userEmail: string,
  token: string
): Promise<RedeemInvitationResult> {
  const invitation = await prisma.workspaceInvitation.findUnique({ where: { token } });
  if (!invitation) return { ok: false, status: 404, error: "초대를 찾을 수 없어요" };
  if (invitation.status !== "PENDING") return { ok: false, status: 409, error: "이미 처리됨" };

  // 이메일 일치 확인
  if (invitation.invitedEmail?.toLowerCase() !== userEmail.toLowerCase()) {
    return { ok: false, status: 403, error: "초대 받은 이메일과 가입 이메일이 달라요" };
  }

  // 멤버십 생성 + 상태 변경
  await prisma.$transaction(async (tx) => {
    await tx.workspaceMember.upsert({
      where: { userId_workspaceId: { userId, workspaceId: invitation.workspaceId } },
      create: { userId, workspaceId: invitation.workspaceId, role: invitation.role },
      update: {},
    });
    await tx.workspaceInvitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED", invitedUserId: userId },
    });
  });

  await logActivity({
    workspaceId: invitation.workspaceId,
    userId,
    action: "invitation.redeemed",
    meta: { invitationId: invitation.id, role: invitation.role },
  });

  return { ok: true, workspaceId: invitation.workspaceId };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const body = await request.json();
  const { token } = body as { token?: string };
  if (!token) return NextResponse.json({ error: "token 필요" }, { status: 400 });

  const result = await redeemInvitationToken(user.id, user.email ?? "", token);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, workspaceId: result.workspaceId });
}
