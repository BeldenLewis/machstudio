import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { sendEmailBatch, reminderEmailHtml, emailConfigured } from "@/lib/email";
import { rateLimit } from "@/lib/ratelimit";

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

  // 중복 발송 방지 — 같은 웨비나에 60초 내 재발송 차단(더블클릭·재시도로 전 구독자에게 같은 메일이 다시 나가는 것 방지).
  if (!rateLimit(`webinar-reminder-send:${id}`, { limit: 1, windowMs: 60_000 }).allowed) {
    return NextResponse.json({ error: "방금 발송했어요. 60초 후 다시 시도할 수 있어요." }, { status: 429 });
  }

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
    // 배치 발송 — 100건씩 묶어 Resend /emails/batch 로(수신자 간 노출 없음). 왕복 수 대폭 감소.
    const result = await sendEmailBatch(reminders.map((r) => ({ to: r.email, subject, html })));
    sent = result.sent;
    skipped = result.skipped;
    failed = result.failed;
  }

  await logActivity({
    workspaceId: webinar.workspaceId,
    userId: user.id,
    action: "webinar.reminder_sent",
    meta: { webinarId: id, total: reminders.length, sent, skipped, failed },
  });

  return NextResponse.json({ total: reminders.length, sent, skipped, failed, emailConfigured: configured });
}
