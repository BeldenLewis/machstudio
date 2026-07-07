import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { isWebinarStatusOverride } from "@/lib/webinar-status";

async function getWebinarWithAuth(id: string, userId: string) {
  const webinar = await prisma.webinar.findUnique({ where: { id } });
  if (!webinar) return { webinar: null, membership: null };

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: webinar.workspaceId } },
  });
  return { webinar, membership };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const { webinar, membership } = await getWebinarWithAuth(id, user.id);
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const full = await prisma.webinar.findUnique({
    where: { id },
    include: {
      sessions: { orderBy: { number: "asc" } },
      _count: { select: { registrations: true, questions: true } },
    },
  });

  return NextResponse.json({ webinar: full });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const { webinar, membership } = await getWebinarWithAuth(id, user.id);
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const body = await request.json();
  const { name, description, liveStartAt, liveEndAt, signupDeadline, theme, config, statusOverride, components } = body;

  // 상태 수동 오버라이드 — null(자동 복귀) 또는 유틸이 정의한 값만 허용
  if (statusOverride !== undefined && statusOverride !== null && !isWebinarStatusOverride(statusOverride)) {
    return NextResponse.json({ error: "잘못된 상태 값이에요" }, { status: 400 });
  }

  const updated = await prisma.webinar.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(liveStartAt !== undefined && { liveStartAt: new Date(liveStartAt) }),
      ...(liveEndAt !== undefined && { liveEndAt: new Date(liveEndAt) }),
      ...(signupDeadline !== undefined && { signupDeadline: new Date(signupDeadline) }),
      ...(theme !== undefined && { theme }),
      ...(config !== undefined && { config }),
      ...(statusOverride !== undefined && { statusOverride }),
      ...(components !== undefined && { components }),
    },
  });

  const changed = Object.keys(body).filter((k) =>
    ["name", "description", "liveStartAt", "liveEndAt", "signupDeadline", "theme", "config", "statusOverride", "components"].includes(k),
  );
  await logActivity({
    workspaceId: webinar.workspaceId,
    userId: user.id,
    action: "webinar.updated",
    meta: { webinarId: id, changes: changed },
  });

  return NextResponse.json({ webinar: updated });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const { webinar, membership } = await getWebinarWithAuth(id, user.id);
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });
  if (!membership || membership.role === "MEMBER") {
    return NextResponse.json({ error: "삭제 권한 없음" }, { status: 403 });
  }

  await prisma.webinar.delete({ where: { id } });

  await logActivity({
    workspaceId: webinar.workspaceId,
    userId: user.id,
    action: "webinar.deleted",
    meta: { webinarId: id, slug: webinar.slug, name: webinar.name },
  });

  return NextResponse.json({ ok: true });
}
