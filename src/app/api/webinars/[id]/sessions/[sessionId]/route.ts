import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { safeHttpUrl } from "@/lib/webinar-config";
import { serializeSpeakerLinks } from "@/lib/webinar-speaker-links";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { SESSION_TYPE_VALUES } from "@/lib/webinar-sessions";
import { logActivity } from "@/lib/activity";

async function authorize(webinarId: string, sessionId: string, userId: string) {
  const session = await prisma.webinarSession.findFirst({
    where: { id: sessionId, webinarId },
    include: { webinar: true },
  });
  if (!session) return null;

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: session.webinar.workspaceId } },
  });

  return membership ? session : null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id, sessionId } = await params;
  const session = await authorize(id, sessionId, user.id);
  if (!session) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const body = await request.json();
  const number = body.number !== undefined ? Number(body.number) : undefined;
  // 여기도 `?? ""` — null 이 오면 String(null)="null" 이 되고, "null" 은 truthy 라
  // 아래 빈값 검증마저 통과해 제목이 "null" 인 세션이 저장된다.
  const title = body.title !== undefined ? String(body.title ?? "").trim() : undefined;
  const startTime = body.startTime !== undefined ? String(body.startTime ?? "").trim() : undefined;
  const endTime = body.endTime !== undefined ? String(body.endTime ?? "").trim() : undefined;

  if (number !== undefined && (!Number.isInteger(number) || number < 1)) {
    return NextResponse.json({ error: "세션 번호를 확인해주세요" }, { status: 400 });
  }
  if (title !== undefined && !title) {
    return NextResponse.json({ error: "세션 제목을 입력해주세요" }, { status: 400 });
  }
  if (startTime !== undefined && !startTime) {
    return NextResponse.json({ error: "시작 시간을 입력해주세요" }, { status: 400 });
  }
  if (endTime !== undefined && !endTime) {
    return NextResponse.json({ error: "종료 시간을 입력해주세요" }, { status: 400 });
  }
  /**
   * 유형은 400 으로 거른다. 예전엔 모르는 값이 update data 에서 **통째로 누락**되어 기존 값이
   * 유지됐다 — POST(조용히 "session" 강제)와 실패 모드가 다른데 둘 다 성공 응답을 줬다.
   * 낙관적 UI 는 성공처럼 보이고 새로고침하면 되돌아간다.
   */
  if (body.type !== undefined && !SESSION_TYPE_VALUES.includes(String(body.type))) {
    return NextResponse.json({ error: "세션 유형을 확인해주세요" }, { status: 400 });
  }

  const updated = await prisma.webinarSession.update({
    where: { id: session.id },
    data: {
      ...(number !== undefined && { number }),
      ...(body.type !== undefined && { type: String(body.type) }),
      ...(title !== undefined && { title }),
      // `?? ""` 가 반드시 있어야 한다. body.speaker 가 JSON null 이면 null !== undefined 라 이 항목이
      // 통과하고, String(null) === "null" 이 그대로 저장돼 화면에 "null" 이 찍힌다.
      // (연사가 없는 Break/Q&A 행이 정확히 이렇게 speaker="null" 로 저장돼 있었다. POST 쪽은
      //  원래 `?? ""` 가 있어 멀쩡했고 PATCH 에만 빠져 있었다.)
      ...(body.speaker !== undefined && { speaker: String(body.speaker ?? "").trim() || null }),
      ...(body.speakerCompany !== undefined && { speakerCompany: String(body.speakerCompany ?? "").trim() || null }),
      ...(body.speakerPhotoUrl !== undefined && { speakerPhotoUrl: String(body.speakerPhotoUrl ?? "").trim() || null }),
      ...(body.logoUrl !== undefined && { logoUrl: String(body.logoUrl ?? "").trim() || null }),
      ...(body.description !== undefined && { description: String(body.description ?? "").trim() || null }),
      ...(body.speakerBio !== undefined && { speakerBio: String(body.speakerBio ?? "").trim() || null }),
      // 링크는 스킴 검증을 거친다(POST 와 같은 규칙). 잘못된 스킴은 저장하지 않고 비운다 —
      // 조용히 통과시키면 랜딩에서 클릭 가능한 위험 링크가 된다.
      ...(body.speakerHomepage !== undefined && { speakerHomepage: safeHttpUrl(body.speakerHomepage) || null }),
      // Json 컬럼을 비우는 것은 null 이 아니라 Prisma.DbNull 이다(그냥 null 은 타입 오류).
      ...(body.speakerLinks !== undefined && {
        speakerLinks: serializeSpeakerLinks(body.speakerLinks) ?? Prisma.DbNull,
      }),
      ...(startTime !== undefined && { startTime }),
      ...(endTime !== undefined && { endTime }),
    },
  });

  await logActivity({
    workspaceId: session.webinar.workspaceId,
    userId: user.id,
    action: "webinar.session_updated",
    meta: { webinarId: id, sessionId, changes: Object.keys(body) },
  });

  return NextResponse.json({ session: updated });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id, sessionId } = await params;
  const session = await authorize(id, sessionId, user.id);
  if (!session) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  // WebinarQA.sessionNumber 는 이 세션의 number 를 가리키는 참조 키다(reorder 라우트 주석 참고).
  // 세션만 지우면 그 질문들이 고아 참조로 남고, 나중에 순서를 한 번 바꾸면 remap 을 타고
  // **다른 세션의 질문**으로 바뀐다. 삭제와 같은 트랜잭션에서 참조를 끊는다.
  const detached = await prisma.$transaction(async (tx) => {
    const result = await tx.webinarQA.updateMany({
      where: { webinarId: id, sessionNumber: session.number },
      data: { sessionNumber: null },
    });
    await tx.webinarSession.delete({ where: { id: session.id } });
    return result.count;
  });

  await logActivity({
    workspaceId: session.webinar.workspaceId,
    userId: user.id,
    action: "webinar.session_deleted",
    meta: { webinarId: id, sessionId, title: session.title, detachedQuestions: detached },
  });
  return NextResponse.json({ ok: true });
}
