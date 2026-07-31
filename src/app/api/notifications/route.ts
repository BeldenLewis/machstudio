import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// 알림 목록 조회
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // WORKSPACE_INVITE 의 data 는 생성 시점 스냅샷 — 수락/거절 후에도 그대로 남아있어
  // 지금 초대가 PENDING 인지는 알 수 없다(수락/거절 버튼을 계속 보여줄지 판단하려면 필요).
  // WorkspaceInvitation 을 조인해 현재 상태를 함께 내려준다.
  const invitationIds = notifications
    .filter((n) => n.type === "WORKSPACE_INVITE")
    .map((n) => (n.data as { invitationId?: string })?.invitationId)
    .filter((id): id is string => typeof id === "string");

  const invitationStatusById = new Map<string, string>();
  if (invitationIds.length > 0) {
    const invitations = await prisma.workspaceInvitation.findMany({
      where: { id: { in: invitationIds } },
      select: { id: true, status: true },
    });
    for (const inv of invitations) invitationStatusById.set(inv.id, inv.status);
  }

  const withInvitationStatus = notifications.map((n) => {
    if (n.type !== "WORKSPACE_INVITE") return n;
    const invitationId = (n.data as { invitationId?: string })?.invitationId;
    return {
      ...n,
      invitationStatus: invitationId ? invitationStatusById.get(invitationId) ?? null : null,
    };
  });

  return NextResponse.json({ notifications: withInvitationStatus });
}

// 전체 읽음 처리
export async function PATCH() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  await prisma.notification.updateMany({
    where: { userId: user.id, read: false },
    data: { read: true },
  });

  return NextResponse.json({ ok: true });
}
