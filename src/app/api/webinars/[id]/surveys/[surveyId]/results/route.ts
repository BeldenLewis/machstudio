import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { normalizeSurveyQuestions, type SurveyQuestion } from "@/lib/webinar-survey";

// 설문 결과 집계 — 문항별 분포·평균·NPS·주관식 리스트. 분석 탭이 사용.
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

  const questions = normalizeSurveyQuestions(survey.questions);

  // 문항별 누적기 — 응답을 전부 메모리에 들지 않고 청크 단위로 스트리밍 집계한다.
  interface Acc { count: number; sum: number; dist: Record<number, number>; options: Record<string, number>; texts: string[]; promoters: number; detractors: number }
  const accs = new Map<string, Acc>(
    questions.map((q) => {
      const dist: Record<number, number> = {};
      if (q.type === "rating") for (let n = 1; n <= 5; n++) dist[n] = 0;
      if (q.type === "nps") for (let n = 0; n <= 10; n++) dist[n] = 0;
      const options: Record<string, number> = {};
      q.options.forEach((o) => { options[o] = 0; });
      return [q.id, { count: 0, sum: 0, dist, options, texts: [], promoters: 0, detractors: 0 }];
    }),
  );

  let totalResponses = 0;
  let linkedResponses = 0;
  const bySource: Record<string, number> = {};

  // 커서 청크 루프 — 최신순이라 주관식은 자연스럽게 "최근 50개"가 유지된다
  const CHUNK = 1000;
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.webinarSurveyResponse.findMany({
      where: { surveyId },
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      take: CHUNK,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, answers: true, registrationId: true, source: true },
    });

    for (const r of rows) {
      totalResponses += 1;
      if (r.registrationId) linkedResponses += 1;
      const src = r.source ?? "link";
      bySource[src] = (bySource[src] ?? 0) + 1;

      const answers = (r.answers ?? {}) as Record<string, unknown>;
      for (const q of questions) {
        const v = answers[q.id];
        if (v === undefined || v === null || v === "") continue;
        const acc = accs.get(q.id)!;

        if (q.type === "rating" || q.type === "nps") {
          const n = Number(v);
          const min = q.type === "rating" ? 1 : 0;
          const max = q.type === "rating" ? 5 : 10;
          if (!Number.isFinite(n) || n < min || n > max) continue;
          acc.count += 1;
          acc.sum += n;
          acc.dist[n] += 1;
          if (q.type === "nps") {
            if (n >= 9) acc.promoters += 1;
            else if (n <= 6) acc.detractors += 1;
          }
        } else if (q.type === "single" || q.type === "multiple") {
          acc.count += 1;
          const arr = Array.isArray(v) ? v : [v];
          // 응답 후 선택지 문구를 바꾸거나 지우면 기존 응답이 어느 항목에도 안 잡혀
          // "응답 20건인데 막대 합은 12건"처럼 보인다 → 별도 버킷으로 남긴다.
          arr.forEach((o) => {
            const s = String(o);
            if (s in acc.options) acc.options[s] += 1;
            else acc.options[`${s} (삭제된 선택지)`] = (acc.options[`${s} (삭제된 선택지)`] ?? 0) + 1;
          });
        } else {
          acc.count += 1;
          if (acc.texts.length < 50) acc.texts.push(String(v));
        }
      }
    }

    if (rows.length < CHUNK) break;
    cursor = rows[rows.length - 1].id;
  }

  const results = questions.map((q: SurveyQuestion) => {
    const acc = accs.get(q.id)!;
    if (q.type === "rating" || q.type === "nps") {
      return {
        id: q.id, type: q.type, title: q.title, count: acc.count,
        avg: acc.count ? acc.sum / acc.count : null,
        // NPS 점수 = 추천(9-10)% - 비추천(0-6)%
        nps: q.type === "nps" && acc.count ? Math.round(((acc.promoters - acc.detractors) / acc.count) * 100) : null,
        dist: acc.dist,
      };
    }
    if (q.type === "single" || q.type === "multiple") {
      return { id: q.id, type: q.type, title: q.title, count: acc.count, options: acc.options };
    }
    return { id: q.id, type: q.type, title: q.title, count: acc.count, texts: acc.texts };
  });

  return NextResponse.json({
    survey: { id: survey.id, title: survey.title },
    totalResponses,
    linkedResponses,
    bySource,
    results,
  });
}
