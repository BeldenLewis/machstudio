import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const webinar = await prisma.webinar.findUnique({ where: { id }, select: { id: true, workspaceId: true } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: webinar.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const questions = await prisma.webinarQA.findMany({
    where: { webinarId: id, ...(status ? { status } : {}) },
    // 추천순 우선 — take 상한(200) 안에 득표 높은 오래된 질문이 최신순에 밀려 누락되지 않게(QATab 도 추천순 표시).
    orderBy: [{ voteCount: "desc" }, { createdAt: "desc" }],
    // UI(QATab)가 쓰는 필드만 — 전 컬럼(PII 포함) 전송 방지. 라이브 15초 tick 마다 재조회되므로 egress 직결.
    select: { id: true, question: true, sessionNumber: true, status: true, name: true, company: true, voteCount: true, onScreen: true, createdAt: true },
    take: 200,
  });

  return NextResponse.json({ questions });
}
