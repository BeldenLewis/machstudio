import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { normalizeSurveyQuestions, type SurveyQuestion } from "@/lib/webinar-survey";

// 라이브 콘솔 "문의·폼 응답" 피드용 — 웨비나의 모든 설문 응답을 최신순으로 합쳐서 준다.
// 콘솔 폴링(라이브 15초)에 얹히므로 상한을 둬 폴당 전송량을 제한한다.
const MAX = 60;

/** 웨비나 단위 최근 폼 응답 — 어느 폼이든(CTA 문의·만족도 등) 최신순. 등록자 연결분은 이름·연락처 동봉. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const [surveys, total, rows] = await Promise.all([
    prisma.webinarSurvey.findMany({
      where: { webinarId: id },
      select: { id: true, title: true, questions: true },
    }),
    prisma.webinarSurveyResponse.count({ where: { webinarId: id } }),
    prisma.webinarSurveyResponse.findMany({
      where: { webinarId: id },
      orderBy: { submittedAt: "desc" },
      take: MAX,
      select: { id: true, surveyId: true, registrationId: true, answers: true, source: true, submittedAt: true },
    }),
  ]);

  // 폼 제목·문항(라벨 포맷용) — 지워진 문항 답도 남도록 includeHidden
  const surveyMap: Record<string, { title: string; questions: SurveyQuestion[] }> = {};
  surveys.forEach((s) => { surveyMap[s.id] = { title: s.title, questions: normalizeSurveyQuestions(s.questions, { includeHidden: true }) }; });

  // 등록자 정보는 응답 relation 이 없어 id 로 한 번에 조회해 붙인다
  const regIds = [...new Set(rows.map((r) => r.registrationId).filter((v): v is string => !!v))];
  const regs = regIds.length
    ? await prisma.webinarRegistration.findMany({
        where: { id: { in: regIds } },
        select: { id: true, name: true, company: true, email: true, phone: true },
      })
    : [];
  const regMap = new Map(regs.map((r) => [r.id, r]));

  return NextResponse.json({
    total,
    surveys: surveyMap,
    responses: rows.map((r) => ({
      id: r.id,
      surveyId: r.surveyId,
      surveyTitle: surveyMap[r.surveyId]?.title ?? "폼",
      submittedAt: r.submittedAt,
      source: r.source,
      answers: r.answers,
      registrant: r.registrationId ? (regMap.get(r.registrationId) ?? null) : null,
    })),
  });
}
