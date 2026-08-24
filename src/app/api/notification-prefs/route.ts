import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

const NOTIFICATION_EVENTS = [
  { id: "WORKSPACE_INVITE",  label: "워크스페이스 초대",       defaultEnabled: true },
  { id: "COLLECT_SUBMITTED", label: "새 폼 제출",              defaultEnabled: false },
  { id: "REPORT_SENT",       label: "정기 리포트 발송 완료",   defaultEnabled: true },
  { id: "ROLE_CHANGED",      label: "권한 변경",                defaultEnabled: true },
  { id: "MEMBER_REMOVED",    label: "멤버 제거",                defaultEnabled: true },
] as const;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const prefs = await prisma.notificationPref.findMany({ where: { userId: user.id } });
  const map = new Map(prefs.map((p) => [p.eventType, p.enabled]));
  // 모든 카테고리 + 사용자 설정 머지 (없으면 default)
  const result = NOTIFICATION_EVENTS.map((e) => ({
    eventType: e.id,
    label: e.label,
    enabled: map.get(e.id) ?? e.defaultEnabled,
  }));
  return NextResponse.json({ prefs: result });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const body = await request.json();
  const { eventType, enabled } = body as { eventType?: string; enabled?: boolean };
  if (!eventType || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "eventType, enabled 필요" }, { status: 400 });
  }

  const pref = await prisma.notificationPref.upsert({
    where: { userId_eventType: { userId: user.id, eventType } },
    create: { userId: user.id, eventType, enabled },
    update: { enabled, updatedAt: new Date() },
  });
  return NextResponse.json({ pref });
}
