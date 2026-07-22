import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { normalizeSurveyQuestions } from "@/lib/webinar-survey";

// 최근 응답부터 이만큼만 — 개별 열람·CSV 용도로 충분하고 egress 를 한 번에 키우지 않는다. 초과분은 total 로 알린다.
const MAX_RESPONSES = 500;

/** 설문 개별 응답 목록 — 분석 탭 "개별 응답"이 사용. 등록자 연결 응답은 이름·연락처를 함께 준다. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; surveyId: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id, surveyId } = await params;
  const webinar = await prisma.webinar.findUnique({ where: { id }, select: { workspaceId: true } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: webinar.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const survey = await prisma.webinarSurvey.findFirst({
    where: { id: surveyId, webinarId: id },
    select: { id: true, title: true, questions: true },
  });
  if (!survey) return NextResponse.json({ error: "없는 설문이에요" }, { status: 404 });

  const [total, rows] = await Promise.all([
    prisma.webinarSurveyResponse.count({ where: { surveyId, webinarId: id } }),
    prisma.webinarSurveyResponse.findMany({
      where: { surveyId, webinarId: id },
      orderBy: { submittedAt: "desc" },
      take: MAX_RESPONSES,
      select: { id: true, registrationId: true, answers: true, source: true, submittedAt: true },
    }),
  ]);

  // 응답 모델엔 등록 relation 이 없다 — id 로 한 번에 조회해 붙인다
  const regIds = [...new Set(rows.map((r) => r.registrationId).filter((v): v is string => !!v))];
  const regs = regIds.length
    ? await prisma.webinarRegistration.findMany({
        where: { id: { in: regIds } },
        select: { id: true, name: true, email: true, phone: true, company: true },
      })
    : [];
  const regMap = new Map(regs.map((r) => [r.id, r]));

  return NextResponse.json({
    survey: { id: survey.id, title: survey.title },
    // 어드민 열람 — 나중에 지운 문항의 답도 열에 남도록 includeHidden
    questions: normalizeSurveyQuestions(survey.questions, { includeHidden: true }),
    total,
    responses: rows.map((r) => ({
      id: r.id,
      submittedAt: r.submittedAt,
      source: r.source,
      answers: r.answers,
      registrant: r.registrationId ? (regMap.get(r.registrationId) ?? null) : null,
    })),
  });
}
