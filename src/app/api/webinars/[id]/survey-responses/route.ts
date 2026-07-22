import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { normalizeSurveyQuestions, type SurveyQuestion } from "@/lib/webinar-survey";

// 라이브 콘솔 "문의·폼 응답" 피드용 — 웨비나의 설문 응답을 최신순으로 합쳐서 준다.
// 콘솔 폴링(라이브 15초)에 얹히므로 상한을 둬 폴당 전송량을 제한한다.
// 전체 보기는 최근 MAX_ALL, 특정 폼(?surveyId=) 필터는 그 폼만 MAX_ONE 까지.
const MAX_ALL = 60;
const MAX_ONE = 200;

/** 웨비나 단위 최근 폼 응답 — 전체 또는 ?surveyId 로 폼별. 폼별 카운트(counts)로 필터 칩 라벨 구성. */
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

  const surveyId = new URL(request.url).searchParams.get("surveyId") || null;
  // 응답 조회 범위 — surveyId 있으면 그 폼만(넉넉히), 없으면 전체 최근
  const where = surveyId ? { webinarId: id, surveyId } : { webinarId: id };

  const [surveys, grouped, rows] = await Promise.all([
    prisma.webinarSurvey.findMany({
      where: { webinarId: id },
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true, questions: true },
    }),
    // 폼별 총 응답 수 — 필터 칩 라벨용(필터와 무관하게 항상 전체 기준). 총합은 전체 건수.
    prisma.webinarSurveyResponse.groupBy({
      by: ["surveyId"],
      where: { webinarId: id },
      _count: { _all: true },
    }),
    prisma.webinarSurveyResponse.findMany({
      where,
      orderBy: { submittedAt: "desc" },
      take: surveyId ? MAX_ONE : MAX_ALL,
      select: { id: true, surveyId: true, registrationId: true, answers: true, source: true, submittedAt: true },
    }),
  ]);

  const counts: Record<string, number> = {};
  let total = 0;
  grouped.forEach((g) => { counts[g.surveyId] = g._count._all; total += g._count._all; });

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
    counts,
    // 필터 칩 순서 고정용 — 만든 순(createdAt asc). 응답 0건 폼도 포함하니 클라에서 count>0 만 노출.
    surveyOrder: surveys.map((s) => s.id),
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
