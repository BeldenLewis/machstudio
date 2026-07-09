import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

async function authorize(webinarId: string, userId: string) {
  const webinar = await prisma.webinar.findUnique({ where: { id: webinarId } });
  if (!webinar) return null;
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: webinar.workspaceId } },
  });
  return membership ? webinar : null;
}

// 어드민 DELETE — 메시지 모더레이션(삭제).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id, messageId } = await params;
  const webinar = await authorize(id, user.id);
  if (!webinar) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const msg = await prisma.webinarChatMessage.findFirst({ where: { id: messageId, webinarId: id }, select: { id: true } });
  if (!msg) return NextResponse.json({ error: "메시지를 찾지 못했어요" }, { status: 404 });

  await prisma.webinarChatMessage.delete({ where: { id: msg.id } });

  await logActivity({
    workspaceId: webinar.workspaceId,
    userId: user.id,
    action: "webinar.chat_deleted",
    meta: { webinarId: id, messageId },
  });
  return NextResponse.json({ ok: true });
}
