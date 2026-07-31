import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { sendEmailBatch, reminderEmailHtml, emailConfigured, normalizeReminderUrl } from "@/lib/email";
import { rateLimitAsync } from "@/lib/ratelimit";

async function authorize(webinarId: string, userId: string) {
  const webinar = await prisma.webinar.findUnique({ where: { id: webinarId } });
  if (!webinar) return null;
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: webinar.workspaceId } },
  });
  return membership ? { webinar, role: membership.role } : null;
}

// 어드민 POST — 구독자에게 알림 발송(다음 세션 안내·다시보기 링크 등).
// RESEND_API_KEY 미설정 시 실제 발송은 skip 되고 skipped 수만 반환한다.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const auth = await authorize(id, user.id);
  if (!auth) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });
  // 외부로 나가는 대량 발송 — 명단 내보내기·대량삭제와 같은 등급으로 관리자 이상만.
  if (auth.role === "MEMBER") {
    return NextResponse.json({ error: "알림 발송 권한이 없어요. 관리자에게 문의하세요." }, { status: 403 });
  }
  const webinar = auth.webinar;

  const body = await request.json();
  const subject = String(body.subject ?? "").trim().slice(0, 150);
  const message = String(body.message ?? "").trim().slice(0, 2000);
  const rawUrl = body.url ? String(body.url).trim().slice(0, 500) : undefined;
  const buttonLabel = body.buttonLabel ? String(body.buttonLabel).trim().slice(0, 40) : undefined;
  if (!subject || !message) {
    return NextResponse.json({ error: "제목과 내용을 입력해주세요" }, { status: 400 });
  }
  // 스킴 없는 URL("example.com")을 조용히 버려 버튼 없는 메일이 나가지 않도록 — 대량 발송 전에 막는다.
  let url: string | undefined;
  if (rawUrl) {
    const normalized = normalizeReminderUrl(rawUrl);
    if (!normalized) {
      return NextResponse.json({ error: "버튼 링크 주소가 올바르지 않아요" }, { status: 400 });
    }
    url = normalized;
  }

  // 구독 행에는 두 종류가 섞여 있다: 등록자가 켠 것(registrationId 있음)과 등록 없이 신청한 것(null).
  // 등록자가 삭제됐는데 구독이 남아 있으면 **파기를 요청한 사람에게 메일이 간다** → 끊긴 참조는 제외한다.
  // (등록자 삭제 경로가 이제 구독을 함께 지우지만, 그 전에 쌓인 행도 여기서 걸러진다)
  const allReminders = await prisma.webinarReminder.findMany({
    where: { webinarId: id },
    select: { email: true, registrationId: true },
  });
  const linkedIds = allReminders.map((r) => r.registrationId).filter((v): v is string => Boolean(v));
  const aliveIds = new Set(
    linkedIds.length
      ? (await prisma.webinarRegistration.findMany({
          where: { id: { in: linkedIds }, webinarId: id },
          select: { id: true },
        })).map((r) => r.id)
      : [],
  );
  const reminders = allReminders.filter((r) => !r.registrationId || aliveIds.has(r.registrationId));
  const orphaned = allReminders.length - reminders.length;
  const html = reminderEmailHtml({ title: subject, body: message, url, buttonLabel });

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const configured = emailConfigured();
  if (!configured) {
    skipped = reminders.length; // 키 미설정 — 전부 skip
  } else {
    // 중복 발송 방지 — 실제 발송 직전에만 60초 잠금(검증 실패·미설정 skip 은 슬롯 소비 안 함).
    // 인메모리 잠금은 서버리스에서 인스턴스마다 따로라 이중 발송을 못 막는다 → Redis 공유 잠금.
    if (!(await rateLimitAsync(`webinar-reminder-send:${id}`, { limit: 1, windowMs: 60_000 })).allowed) {
      return NextResponse.json({ error: "방금 발송했어요. 60초 후 다시 시도할 수 있어요." }, { status: 429 });
    }
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
    meta: { webinarId: id, total: reminders.length, sent, skipped, failed, orphaned },
  });

  // orphaned — 삭제된 등록자의 구독이라 제외한 건수. 운영자가 숫자 차이를 보고 의아해하지 않게 함께 돌려준다.
  return NextResponse.json({ total: reminders.length, sent, skipped, failed, orphaned, emailConfigured: configured });
}
