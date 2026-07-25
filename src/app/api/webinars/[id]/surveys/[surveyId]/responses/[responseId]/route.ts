import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

/**
 * 설문 개별 응답 삭제.
 *
 * 왜 필요한가: 테스트 응답·중복 제출·본인 요청 삭제(개인정보 파기)를 처리할 방법이 없었다.
 * 응답에는 등록자 연결(registrationId)과 자유 서술이 들어가므로 삭제 요청은 실제로 들어온다.
 *
 * 되돌릴 수 없으므로 UI 에서 확인 단계를 두고, 여기서는 소속 검증만 엄격히 한다:
 * webinarId + surveyId + responseId 세 개가 모두 맞아야 지운다. id 하나만 맞으면
 * 다른 웨비나·다른 설문의 응답을 지울 수 있다.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; surveyId: string; responseId: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id, surveyId, responseId } = await params;
  const webinar = await prisma.webinar.findUnique({ where: { id }, select: { workspaceId: true } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: webinar.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  // 세 조건을 모두 걸어 조회 — 소속이 어긋나면 404 로 끝낸다(존재 여부도 알려주지 않는다)
  const response = await prisma.webinarSurveyResponse.findFirst({
    where: { id: responseId, surveyId, webinarId: id },
    select: { id: true, registrationId: true, source: true },
  });
  if (!response) return NextResponse.json({ error: "없는 응답이에요" }, { status: 404 });

  await prisma.webinarSurveyResponse.delete({ where: { id: response.id } });

  await logActivity({
    workspaceId: webinar.workspaceId,
    userId: user.id,
    action: "webinar.survey_response_deleted",
    // 응답 내용은 로그에 남기지 않는다(자유 서술에 PII 가 들어갈 수 있다)
    meta: { webinarId: id, surveyId, responseId, hadRegistration: Boolean(response.registrationId), source: response.source },
  });

  return NextResponse.json({ ok: true });
}
