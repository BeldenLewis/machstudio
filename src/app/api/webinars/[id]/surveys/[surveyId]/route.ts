import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { normalizeSurveyQuestions, retainAnsweredQuestions, validateSurveyQuestionLimits } from "@/lib/webinar-survey";

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
  // 제출 완료 화면 문구 — 빈 값이면 null(노출면별 기본 문구로 폴백)
  if (body?.doneTitle !== undefined) data.doneTitle = String(body.doneTitle ?? "").trim() || null;
  if (body?.doneDescription !== undefined) data.doneDescription = String(body.doneDescription ?? "").trim() || null;
  // 종료 화면 카드 버튼 문구 — 빈 값이면 null(EndedScreen 이 "설문 참여하기" 로 폴백)
  if (body?.ctaLabel !== undefined) data.ctaLabel = String(body.ctaLabel ?? "").trim() || null;
  let retiredCount = 0;
  if (body?.questions !== undefined) {
    const incoming = normalizeSurveyQuestions(body.questions, { includeHidden: true });

    // 상한 초과는 조용히 자르지 않고 알린다 — 예전엔 slice(0,30)/slice(0,20) 가 버렸는데
    // 응답은 200 이라 화면에 '저장됨' 이 떴고, 운영자는 문항이 사라진 걸 나중에 알았다.
    const limitError = validateSurveyQuestionLimits(incoming);
    if (limitError) return NextResponse.json({ error: limitError }, { status: 400 });

    // 편집기에서 지운 문항 중 **이미 답변이 있는 것**은 보관 상태로 남긴다.
    // 정의에서 사라지면 분석·개별응답·CSV 가 그 열을 못 그려 수집된 답변이 조회 불가가 된다.
    const previous = normalizeSurveyQuestions(existing.questions, { includeHidden: true });
    const dropped = previous.filter((q) => !incoming.some((n) => n.id === q.id)).map((q) => q.id);
    let questions = incoming;
    if (dropped.length) {
      const responses = await prisma.webinarSurveyResponse.findMany({
        where: { surveyId, webinarId: id },
        select: { answers: true },
      });
      const answered = new Set<string>();
      for (const r of responses) {
        for (const key of Object.keys((r.answers ?? {}) as Record<string, unknown>)) answered.add(key);
      }
      questions = retainAnsweredQuestions(incoming, previous, answered);
      retiredCount = questions.length - incoming.length;
    }
    data.questions = questions as unknown as Prisma.InputJsonValue;
  }
  if (typeof body?.isOpen === "boolean") data.isOpen = body.isOpen;

  // 마감 예약 — null/빈 문자열이면 해제, 아니면 유효한 시각만 수용
  if (body?.closesAt !== undefined) {
    if (body.closesAt === null || body.closesAt === "") {
      data.closesAt = null;
    } else {
      const d = new Date(body.closesAt);
      if (isNaN(d.getTime())) return NextResponse.json({ error: "마감 예약 시각이 올바르지 않아요" }, { status: 400 });
      data.closesAt = d;
    }
  }

  /**
   * 종료 화면 연결은 **여러 개 가능**하다 — 만족도 설문과 다음 행사 사전조사를 함께 걸 수 있다.
   * 예전엔 켤 때 다른 설문의 연결을 내렸는데(원-액티브), 스키마에는 그런 제약이 없었고
   * 코드만 하나로 묶고 있었다. 종료 화면이 카드 목록이라 N개를 그리는 데 문제가 없다.
   *
   * 라이브 푸시(isActive)는 여전히 하나뿐이다 — 그건 화면을 덮는 오버레이라 겹치면 안 되고,
   * 부분 유니크 인덱스가 DB 차원에서 보증한다(아래 블록). 두 축을 섞지 않는다.
   */
  if (typeof body?.showOnEnded === "boolean") data.showOnEnded = body.showOnEnded;

  // 라이브 푸시 활성화 — 원-액티브: 켤 때 기존 활성 설문을 먼저 내린다 (부분 유니크 인덱스가 레이스 보증, P2002→409)
  if (body?.isActive === true) {
    try {
      const [, survey] = await prisma.$transaction([
        prisma.webinarSurvey.updateMany({ where: { webinarId: id, isActive: true }, data: { isActive: false } }),
        // pushedAt = 재노출 키 — 발행 시에만 갱신 (편집으로 바뀌는 updatedAt 과 분리해, 라이브 중 수정이 시청자 모달을 재노출하지 않게)
        prisma.webinarSurvey.update({ where: { id: surveyId }, data: { ...data, isActive: true, pushedAt: new Date(), sentBy: user.id } }),
      ]);
      await logSurveyUpdate(webinar.workspaceId, user.id, id, surveyId, ["isActive:true", ...Object.keys(data)]);
      return NextResponse.json({ survey, retired: retiredCount });
    } catch (e) {
      if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") {
        return NextResponse.json({ error: "다른 설문이 방금 발행됐어요. 새로고침 후 다시 시도해주세요." }, { status: 409 });
      }
      throw e;
    }
  }
  if (body?.isActive === false) data.isActive = false;

  const survey = await prisma.webinarSurvey.update({ where: { id: surveyId }, data });
  // 자동저장(문항 편집)까지 전부 기록하면 피드가 시끄러워짐 — 발행/중지·마감·마감 예약·종료화면 연결 같은 상태 변화만 남긴다
  if (body?.isActive === false || typeof body?.isOpen === "boolean" || typeof body?.showOnEnded === "boolean" || body?.closesAt !== undefined) {
    await logSurveyUpdate(webinar.workspaceId, user.id, id, surveyId, Object.keys(data));
  }
  // retired — 답변이 있어 보관 처리된 문항 수. 편집기가 "지웠지만 보관됨" 을 알릴 수 있게 함께 준다.
  return NextResponse.json({ survey, retired: retiredCount });
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
