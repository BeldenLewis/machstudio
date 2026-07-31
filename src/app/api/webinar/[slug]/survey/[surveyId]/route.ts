import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { rateLimitAsync, getClientIp } from "@/lib/ratelimit";
import { isSurveyAcceptingResponses, normalizeSurveyQuestions, surveyOpenState, validateSurveyAnswers } from "@/lib/webinar-survey";

const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };

async function findSurvey(slug: string, surveyId: string) {
  return prisma.webinarSurvey.findFirst({
    where: { id: surveyId, webinar: { slug } },
    select: { id: true, webinarId: true, title: true, description: true, questions: true, isOpen: true, opensAt: true, closesAt: true, doneTitle: true, doneDescription: true },
  });
}

// 공개 설문 조회 — 응답 페이지/라이브 푸시 모달이 사용
export async function GET(request: Request, { params }: { params: Promise<{ slug: string; surveyId: string }> }) {
  const { slug, surveyId } = await params;
  const survey = await findSurvey(slug, surveyId);
  if (!survey) return NextResponse.json({ error: "없는 설문이에요" }, { status: 404, headers: CORS_HEADERS });

  return NextResponse.json(
    {
      survey: {
        id: survey.id,
        title: survey.title,
        description: survey.description,
        questions: normalizeSurveyQuestions(survey.questions),
        isOpen: isSurveyAcceptingResponses(survey), // 온·오프 + 시작·마감 예약을 함께 판정
        // 못 받는 이유 — 뷰어가 "아직 시작 전" 과 "마감" 을 다르게 말해야 한다.
        state: surveyOpenState(survey),
        // 시작 전일 때만 언제부터인지 알려 준다(마감 시각은 시청자가 할 수 있는 게 없다).
        opensAt: surveyOpenState(survey) === "before" ? survey.opensAt : null,
        doneTitle: survey.doneTitle,
        doneDescription: survey.doneDescription,
      },
    },
    { headers: CORS_HEADERS },
  );
}

// 응답 제출 — 등록자(registrationId)는 재제출 시 기존 응답을 덮어쓴다(수정 허용). 익명(링크)은 매번 새 응답.
export async function POST(request: Request, { params }: { params: Promise<{ slug: string; surveyId: string }> }) {
  const { slug, surveyId } = await params;

  const ip = getClientIp(request);
  const rl = await rateLimitAsync(`webinar-survey:${slug}:${ip}`, { limit: 20, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 잦아요. 잠시 후 다시 시도해주세요." },
      { status: 429, headers: { ...CORS_HEADERS, "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString() } },
    );
  }

  const survey = await findSurvey(slug, surveyId);
  if (!survey) return NextResponse.json({ error: "없는 설문이에요" }, { status: 404, headers: CORS_HEADERS });
  if (!isSurveyAcceptingResponses(survey)) {
    const state = surveyOpenState(survey);
    return NextResponse.json(
      { error: state === "before" ? "아직 응답을 받기 전이에요" : "마감된 설문이에요", state },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const body = await request.json().catch(() => ({}));
  const questions = normalizeSurveyQuestions(survey.questions);
  const result = validateSurveyAnswers(questions, body?.answers);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400, headers: CORS_HEADERS });
  if (Object.keys(result.cleaned).length === 0) {
    return NextResponse.json({ error: "답변이 비어 있어요." }, { status: 400, headers: CORS_HEADERS });
  }

  const source = ["ended", "live", "link"].includes(body?.source) ? (body.source as string) : "link";

  // registrationId 는 이 웨비나의 등록 건일 때만 인정 (타 웨비나/위조 id 연결 차단)
  let registrationId: string | null = null;
  if (typeof body?.registrationId === "string" && body.registrationId) {
    const reg = await prisma.webinarRegistration.findFirst({
      where: { id: body.registrationId, webinarId: survey.webinarId },
      select: { id: true },
    });
    registrationId = reg?.id ?? null;
  }

  const answers = result.cleaned as unknown as Prisma.InputJsonValue;
  if (registrationId) {
    await prisma.webinarSurveyResponse.upsert({
      where: { surveyId_registrationId: { surveyId, registrationId } },
      create: { surveyId, webinarId: survey.webinarId, registrationId, answers, source },
      update: { answers, source, submittedAt: new Date() },
    });
  } else {
    await prisma.webinarSurveyResponse.create({
      data: { surveyId, webinarId: survey.webinarId, registrationId: null, answers, source },
    });
  }

  return NextResponse.json({ ok: true }, { status: 201, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
