import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// 운영 콘솔 "운영 로그" — 이 웨비나에 대한 최근 활동을 사람이 읽는 라벨로 반환.
// logActivity 가 meta.webinarId 로 기록하므로 그걸로 스코프한다(읽기 전용, 어드민 인증).
const LABEL: Record<string, string> = {
  "webinar.created": "웨비나 생성",
  "webinar.updated": "웨비나 설정 변경",
  "webinar.deleted": "웨비나 삭제",
  "webinar.session_created": "세션 추가",
  "webinar.session_updated": "세션 수정",
  "webinar.session_deleted": "세션 삭제",
  "webinar.announcement_created": "공지 등록",
  "webinar.announcement_updated": "공지 상태 변경",
  "webinar.announcement_deleted": "공지 삭제",
  "webinar.popup_created": "팝업 등록",
  "webinar.popup_updated": "팝업 상태 변경",
  "webinar.popup_deleted": "팝업 삭제",
  "webinar.tally_push_created": "Tally 푸시 등록",
  "webinar.tally_push_updated": "Tally 푸시 상태 변경",
  "webinar.tally_push_deleted": "Tally 푸시 삭제",
  "webinar.poll_created": "투표 등록",
  "webinar.poll_updated": "투표 상태 변경",
  "webinar.poll_deleted": "투표 삭제",
  "webinar.chat_host_posted": "진행자 채팅",
  "webinar.chat_deleted": "채팅 삭제",
  "webinar.reminder_sent": "리마인더 발송",
  "webinar.registration_deleted": "등록자 삭제",
  "webinar.registrations_bulk_deleted": "등록자 일괄 삭제",
  "webinar.registrations.exported": "등록자 내보내기",
  "webinar.survey_updated": "설문 상태 변경",
  "webinar.survey_deleted": "설문 삭제",
  "webinar.survey_response_deleted": "설문 응답 삭제",
  "webinar.qa_deleted": "질문 삭제",
  "webinar.sessions_reordered": "세션 순서 변경",
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const webinar = await prisma.webinar.findUnique({ where: { id }, select: { workspaceId: true } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: webinar.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const rows = await prisma.activityLog.findMany({
    where: { workspaceId: webinar.workspaceId, meta: { path: ["webinarId"], equals: id } },
    orderBy: { createdAt: "desc" },
    take: 24,
    include: { user: { select: { name: true } } },
  });

  const items = rows.map((r) => ({
    id: r.id,
    action: r.action,
    // 라벨 없는 액션이 raw 문자열("webinar.foo_bar")로 그대로 노출되지 않게 한글 폴백을 둔다.
    label: LABEL[r.action] ?? "운영 변경",
    at: r.createdAt,
    actor: r.user?.name ?? null,
  }));

  return NextResponse.json({ items });
}
