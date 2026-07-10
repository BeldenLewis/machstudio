import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; qaId: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id, qaId } = await params;
  const webinar = await prisma.webinar.findUnique({ where: { id } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: webinar.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const body = await request.json();

  const question = await prisma.webinarQA.findFirst({
    where: { id: qaId, webinarId: id },
    select: { id: true },
  });
  if (!question) return NextResponse.json({ error: "질문을 찾지 못했어요" }, { status: 404 });

  // 상태 변경(pending/answered/dismissed). 답변완료·미채택이면 시청 화면 송출도 함께 종료.
  if (body.status !== undefined) {
    if (!["pending", "answered", "dismissed"].includes(String(body.status))) {
      return NextResponse.json({ error: "상태 값을 확인해주세요" }, { status: 400 });
    }
    await prisma.webinarQA.update({
      where: { id: question.id },
      data: { status: body.status, ...(body.status !== "pending" ? { onScreen: false } : {}) },
    });
  }

  // 화면에 띄우기(송출) — 웨비나당 1개만. 켜는 순간 다른 질문을 전부 끈다(팝업·투표 규칙 계승).
  if (body.onScreen === true) {
    try {
      await prisma.$transaction([
        prisma.webinarQA.updateMany({ where: { webinarId: id, onScreen: true }, data: { onScreen: false } }),
        prisma.webinarQA.update({ where: { id: question.id }, data: { onScreen: true } }),
      ]);
    } catch (e) {
      // 부분 유니크 인덱스(웨비나당 송출 1개) 위반 — 동시에 다른 질문이 켜진 경우. 500 대신 409.
      if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") {
        return NextResponse.json({ error: "다른 질문이 방금 송출됐어요. 새로고침 후 다시 시도해주세요." }, { status: 409 });
      }
      throw e;
    }
  } else if (body.onScreen === false) {
    await prisma.webinarQA.update({ where: { id: question.id }, data: { onScreen: false } });
  }

  const updated = await prisma.webinarQA.findUnique({ where: { id: question.id } });
  return NextResponse.json({ question: updated });
}
