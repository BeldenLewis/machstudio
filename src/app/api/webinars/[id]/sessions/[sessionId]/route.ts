import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

async function authorize(webinarId: string, sessionId: string, userId: string) {
  const session = await prisma.webinarSession.findFirst({
    where: { id: sessionId, webinarId },
    include: { webinar: true },
  });
  if (!session) return null;

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: session.webinar.workspaceId } },
  });

  return membership ? session : null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id, sessionId } = await params;
  const session = await authorize(id, sessionId, user.id);
  if (!session) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const body = await request.json();
  const number = body.number !== undefined ? Number(body.number) : undefined;
  const title = body.title !== undefined ? String(body.title).trim() : undefined;
  const startTime = body.startTime !== undefined ? String(body.startTime).trim() : undefined;
  const endTime = body.endTime !== undefined ? String(body.endTime).trim() : undefined;

  if (number !== undefined && (!Number.isInteger(number) || number < 1)) {
    return NextResponse.json({ error: "세션 번호를 확인해주세요" }, { status: 400 });
  }
  if (title !== undefined && !title) {
    return NextResponse.json({ error: "세션 제목을 입력해주세요" }, { status: 400 });
  }
  if (startTime !== undefined && !startTime) {
    return NextResponse.json({ error: "시작 시간을 입력해주세요" }, { status: 400 });
  }
  if (endTime !== undefined && !endTime) {
    return NextResponse.json({ error: "종료 시간을 입력해주세요" }, { status: 400 });
  }

  const updated = await prisma.webinarSession.update({
    where: { id: session.id },
    data: {
      ...(number !== undefined && { number }),
      ...(["session", "qa", "break"].includes(String(body.type)) && { type: String(body.type) }),
      ...(title !== undefined && { title }),
      ...(body.speaker !== undefined && { speaker: String(body.speaker).trim() || null }),
      ...(body.speakerCompany !== undefined && { speakerCompany: String(body.speakerCompany).trim() || null }),
      ...(body.speakerPhotoUrl !== undefined && { speakerPhotoUrl: String(body.speakerPhotoUrl).trim() || null }),
      ...(body.description !== undefined && { description: String(body.description).trim() || null }),
      ...(body.speakerBio !== undefined && { speakerBio: String(body.speakerBio).trim() || null }),
      ...(startTime !== undefined && { startTime }),
      ...(endTime !== undefined && { endTime }),
    },
  });

  await logActivity({
    workspaceId: session.webinar.workspaceId,
    userId: user.id,
    action: "webinar.session_updated",
    meta: { webinarId: id, sessionId, changes: Object.keys(body) },
  });

  return NextResponse.json({ session: updated });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id, sessionId } = await params;
  const session = await authorize(id, sessionId, user.id);
  if (!session) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  await prisma.webinarSession.delete({ where: { id: session.id } });

  await logActivity({
    workspaceId: session.webinar.workspaceId,
    userId: user.id,
    action: "webinar.session_deleted",
    meta: { webinarId: id, sessionId, title: session.title },
  });
  return NextResponse.json({ ok: true });
}
