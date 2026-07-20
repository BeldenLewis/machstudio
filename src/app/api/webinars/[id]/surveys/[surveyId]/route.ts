import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { normalizeSurveyQuestions } from "@/lib/webinar-survey";

async function authorize(webinarId: string, userId: string) {
  const webinar = await prisma.webinar.findUnique({ where: { id: webinarId }, select: { id: true, workspaceId: true } });
  if (!webinar) return null;
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: webinar.workspaceId } },
  });
  return membership ? webinar : null;
}

// 활동 피드 기록 — 다른 푸시 타입(popup/poll/tally)과 동일하게 설문 변경도 감사 로그를 남긴다
function logSurveyUpdate(workspaceId: string, userId: string, webinarId: string, surveyId: string, changes: string[]) {
  return logActivity({
    workspaceId,
    userId,
    action: "webinar.survey_updated",
    meta: { webinarId, surveyId, changes },
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; surveyId: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id, surveyId } = await params;
  const webinar = await authorize(id, user.id);
  if (!webinar) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const existing = await prisma.webinarSurvey.findFirst({ where: { id: surveyId, webinarId: id } });
  if (!existing) return NextResponse.json({ error: "없는 설문이에요" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const data: Prisma.WebinarSurveyUpdateInput = {};
  if (typeof body?.title === "string") data.title = body.title.trim() || existing.title;
  if (body?.description !== undefined) data.description = String(body.description ?? "").trim() || null;
  if (body?.questions !== undefined) data.questions = normalizeSurveyQuestions(body.questions, { includeHidden: true }) as unknown as Prisma.InputJsonValue;
  if (typeof body?.isOpen === "boolean") data.isOpen = body.isOpen;

  // 종료화면 연결도 웨비나당 1개만 — 켜면 다른 설문의 연결을 내린다
  if (body?.showOnEnded === true) {
    await prisma.webinarSurvey.updateMany({ where: { webinarId: id, showOnEnded: true, NOT: { id: surveyId } }, data: { showOnEnded: false } });
    data.showOnEnded = true;
  } else if (body?.showOnEnded === false) {
    data.showOnEnded = false;
  }

  // 라이브 푸시 활성화 — 원-액티브: 켤 때 기존 활성 설문을 먼저 내린다 (부분 유니크 인덱스가 레이스 보증, P2002→409)
  if (body?.isActive === true) {
    try {
      const [, survey] = await prisma.$transaction([
        prisma.webinarSurvey.updateMany({ where: { webinarId: id, isActive: true }, data: { isActive: false } }),
        // pushedAt = 재노출 키 — 발행 시에만 갱신 (편집으로 바뀌는 updatedAt 과 분리해, 라이브 중 수정이 시청자 모달을 재노출하지 않게)
        prisma.webinarSurvey.update({ where: { id: surveyId }, data: { ...data, isActive: true, pushedAt: new Date(), sentBy: user.id } }),
      ]);
      await logSurveyUpdate(webinar.workspaceId, user.id, id, surveyId, ["isActive:true", ...Object.keys(data)]);
      return NextResponse.json({ survey });
    } catch (e) {
      if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") {
        return NextResponse.json({ error: "다른 설문이 방금 발행됐어요. 새로고침 후 다시 시도해주세요." }, { status: 409 });
      }
      throw e;
    }
  }
  if (body?.isActive === false) data.isActive = false;

  const survey = await prisma.webinarSurvey.update({ where: { id: surveyId }, data });
  // 자동저장(문항 편집)까지 전부 기록하면 피드가 시끄러워짐 — 발행/중지·마감·종료화면 연결 같은 상태 변화만 남긴다
  if (body?.isActive === false || typeof body?.isOpen === "boolean" || typeof body?.showOnEnded === "boolean") {
    await logSurveyUpdate(webinar.workspaceId, user.id, id, surveyId, Object.keys(data));
  }
  return NextResponse.json({ survey });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; surveyId: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id, surveyId } = await params;
  const webinar = await authorize(id, user.id);
  if (!webinar) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const existing = await prisma.webinarSurvey.findFirst({ where: { id: surveyId, webinarId: id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "없는 설문이에요" }, { status: 404 });

  await prisma.webinarSurvey.delete({ where: { id: surveyId } });
  await logActivity({ workspaceId: webinar.workspaceId, userId: user.id, action: "webinar.survey_deleted", meta: { webinarId: id, surveyId } });
  return NextResponse.json({ ok: true });
}
