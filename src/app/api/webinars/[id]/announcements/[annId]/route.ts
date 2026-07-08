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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; annId: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id, annId } = await params;
  const webinar = await authorize(id, user.id);
  if (!webinar) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const body = await request.json();
  const announcement = await prisma.webinarAnnouncement.findFirst({
    where: { id: annId, webinarId: id },
    select: { id: true },
  });
  if (!announcement) return NextResponse.json({ error: "공지를 찾지 못했어요" }, { status: 404 });

  // 라이브 페이지는 공지 1건(가장 최근)만 노출한다 — 여러 개를 켜면 관리자 표시와 시청자 화면이 어긋난다.
  // 하나를 켤 때 같은 웨비나의 나머지 공지는 자동으로 끄는 단일 활성(라디오) 규칙으로 상태를 일치시킨다.
  const [updated] = await prisma.$transaction([
    prisma.webinarAnnouncement.update({
      where: { id: announcement.id },
      data: { ...(body.isActive !== undefined && { isActive: body.isActive }), ...(body.message !== undefined && { message: body.message }) },
    }),
    ...(body.isActive === true
      ? [prisma.webinarAnnouncement.updateMany({
          where: { webinarId: id, id: { not: announcement.id }, isActive: true },
          data: { isActive: false },
        })]
      : []),
  ]);

  await logActivity({
    workspaceId: webinar.workspaceId,
    userId: user.id,
    action: "webinar.announcement_updated",
    meta: { webinarId: id, announcementId: annId, changes: Object.keys(body) },
  });

  return NextResponse.json({ announcement: updated });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; annId: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id, annId } = await params;
  const webinar = await authorize(id, user.id);
  if (!webinar) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const announcement = await prisma.webinarAnnouncement.findFirst({
    where: { id: annId, webinarId: id },
    select: { id: true },
  });
  if (!announcement) return NextResponse.json({ error: "공지를 찾지 못했어요" }, { status: 404 });

  await prisma.webinarAnnouncement.delete({ where: { id: announcement.id } });

  await logActivity({
    workspaceId: webinar.workspaceId,
    userId: user.id,
    action: "webinar.announcement_deleted",
    meta: { webinarId: id, announcementId: annId },
  });
  return NextResponse.json({ ok: true });
}
