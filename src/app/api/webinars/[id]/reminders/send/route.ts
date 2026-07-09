import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { sendEmail, reminderEmailHtml, emailConfigured } from "@/lib/email";

async function authorize(webinarId: string, userId: string) {
  const webinar = await prisma.webinar.findUnique({ where: { id: webinarId } });
  if (!webinar) return null;
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: webinar.workspaceId } },
  });
  return membership ? webinar : null;
}

// 어드민 POST — 구독자에게 알림 발송(다음 세션 안내·다시보기 링크 등).
// RESEND_API_KEY 미설정 시 실제 발송은 skip 되고 skipped 수만 반환한다.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const webinar = await authorize(id, user.id);
  if (!webinar) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const body = await request.json();
  const subject = String(body.subject ?? "").trim().slice(0, 150);
  const message = String(body.message ?? "").trim().slice(0, 2000);
  const url = body.url ? String(body.url).trim().slice(0, 500) : undefined;
  const buttonLabel = body.buttonLabel ? String(body.buttonLabel).trim().slice(0, 40) : undefined;
  if (!subject || !message) {
    return NextResponse.json({ error: "제목과 내용을 입력해주세요" }, { status: 400 });
  }

  const reminders = await prisma.webinarReminder.findMany({ where: { webinarId: id }, select: { email: true } });
  const html = reminderEmailHtml({ title: subject, body: message, url, buttonLabel });

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const configured = emailConfigured();
  if (!configured) {
    skipped = reminders.length; // 키 미설정 — 전부 skip
  } else {
    // 개별 발송(수신자 간 노출 방지). 소규모 리스트 가정.
    for (const r of reminders) {
      const result = await sendEmail({ to: r.email, subject, html });
      if (result.sent) sent += 1;
      else if (result.skipped) skipped += 1;
      else failed += 1;
    }
  }

  await logActivity({
    workspaceId: webinar.workspaceId,
    userId: user.id,
    action: "webinar.reminder_sent",
    meta: { webinarId: id, total: reminders.length, sent, skipped, failed },
  });

  return NextResponse.json({ total: reminders.length, sent, skipped, failed, emailConfigured: configured });
}
