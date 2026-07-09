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

// 어드민 GET — 모더레이션용 최근 메시지(실명 그대로).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const webinar = await authorize(id, user.id);
  if (!webinar) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const recent = await prisma.webinarChatMessage.findMany({
    where: { webinarId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, name: true, message: true, isHost: true, createdAt: true },
  });
  return NextResponse.json({ messages: recent });
}

// 어드민 POST — 호스트(운영자) 발언.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const webinar = await authorize(id, user.id);
  if (!webinar) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const body = await request.json();
  const message = String(body.message ?? "").trim().slice(0, 300);
  if (!message) return NextResponse.json({ error: "메시지를 입력해주세요" }, { status: 400 });
  const name = String(body.name ?? "").trim().slice(0, 60) || "운영자";

  const created = await prisma.webinarChatMessage.create({
    data: { webinarId: id, name, message, isHost: true },
    select: { id: true },
  });

  await logActivity({
    workspaceId: webinar.workspaceId,
    userId: user.id,
    action: "webinar.chat_host_posted",
    meta: { webinarId: id, messageId: created.id },
  });

  return NextResponse.json({ message: created }, { status: 201 });
}
