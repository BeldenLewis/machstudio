import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

export type RedeemInvitationResult =
  | { ok: true; workspaceId: string }
  | { ok: false; status: number; error: string };

// Route Handler 파일은 HTTP 메서드 외 값을 export할 수 없으므로 공용 로직은 lib에서 소유한다.
export async function redeemInvitationToken(
  userId: string,
  userEmail: string,
  token: string,
): Promise<RedeemInvitationResult> {
  const invitation = await prisma.workspaceInvitation.findUnique({ where: { token } });
  if (!invitation) return { ok: false, status: 404, error: "초대를 찾을 수 없어요" };
  if (invitation.status !== "PENDING") return { ok: false, status: 409, error: "이미 처리됨" };

  if (invitation.invitedEmail?.toLowerCase() !== userEmail.toLowerCase()) {
    return { ok: false, status: 403, error: "초대 받은 이메일과 가입 이메일이 달라요" };
  }

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
