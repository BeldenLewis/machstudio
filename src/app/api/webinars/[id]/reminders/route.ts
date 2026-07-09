import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { emailConfigured } from "@/lib/email";

async function authorize(webinarId: string, userId: string) {
  const webinar = await prisma.webinar.findUnique({ where: { id: webinarId } });
  if (!webinar) return null;
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: webinar.workspaceId } },
  });
  return membership ? webinar : null;
}

// 어드민 GET — 구독자 수/목록 + 이메일 발송 설정 여부.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const webinar = await authorize(id, user.id);
  if (!webinar) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const reminders = await prisma.webinarReminder.findMany({
    where: { webinarId: id },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, createdAt: true },
  });

  return NextResponse.json({ reminders, count: reminders.length, emailConfigured: emailConfigured() });
}
