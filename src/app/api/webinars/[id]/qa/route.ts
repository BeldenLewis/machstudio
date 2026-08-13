import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { buildSessionNumbering, resolveSessionRef } from "@/lib/webinar-sessions";

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

  const [rows, sessions] = await Promise.all([
    prisma.webinarQA.findMany({
      where: { webinarId: id, ...(status ? { status } : {}) },
      // 추천순 우선 — take 상한(200) 안에 득표 높은 오래된 질문이 최신순에 밀려 누락되지 않게(QATab 도 추천순 표시).
      orderBy: [{ voteCount: "desc" }, { createdAt: "desc" }],
      // UI(QATab)가 쓰는 필드만 — 전 컬럼(PII 포함) 전송 방지. 라이브 15초 tick 마다 재조회되므로 egress 직결.
      select: { id: true, question: true, sessionNumber: true, status: true, name: true, company: true, voteCount: true, onScreen: true, createdAt: true },
      take: 200,
    }),
    prisma.webinarSession.findMany({ where: { webinarId: id }, select: { number: true, type: true } }),
  ]);

  // 표시번호로 바꿔서 내려준다 — 화면이 참조 키를 그대로 찍지 못하게 **원본을 페이로드에서 뺀다**.
  // 시청자 화면은 세션 목록을 갖고 있어 직접 변환하지만, 어드민 화면들은 목록이 없어 여기서 끝낸다.
  const numbering = buildSessionNumbering(sessions);
  const questions = rows.map(({ sessionNumber, ...rest }) => ({
    ...rest,
    sessionNo: resolveSessionRef(numbering, sessionNumber),
  }));

  return NextResponse.json({ questions });
}
