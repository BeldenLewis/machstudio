import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SESSION_TYPE, SESSION_TYPE_VALUES } from "@/lib/webinar-sessions";
import { logActivity } from "@/lib/activity";

async function authorize(webinarId: string, userId: string) {
  const webinar = await prisma.webinar.findUnique({ where: { id: webinarId } });
  if (!webinar) return null;

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: webinar.workspaceId } },
  });

  return membership ? webinar : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const webinar = await authorize(id, user.id);
  if (!webinar) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const sessions = await prisma.webinarSession.findMany({
    where: { webinarId: id },
    orderBy: { number: "asc" },
  });

  return NextResponse.json({ sessions });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const webinar = await authorize(id, user.id);
  if (!webinar) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const body = await request.json();
  const title = String(body.title ?? "").trim();
  const number = Number(body.number);
  const startTime = String(body.startTime ?? "").trim();
  const endTime = String(body.endTime ?? "").trim();

  if (!Number.isInteger(number) || number < 1) {
    return NextResponse.json({ error: "세션 번호를 확인해주세요" }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: "세션 제목을 입력해주세요" }, { status: 400 });
  }
  if (!startTime || !endTime) {
    return NextResponse.json({ error: "세션 시간을 입력해주세요" }, { status: 400 });
  }
  /**
   * 유형은 400 으로 거른다. 예전엔 모르는 값을 조용히 "session" 으로 **강제 저장**했다 —
   * 새 유형을 추가할 때 클라이언트는 성공(201)을 받고 저장된 값만 다르니, "왜 유형이 안 바뀌지"
   * 로 한참 헤맨다. 목록의 정본은 SESSION_TYPES(src/lib/webinar-sessions.ts).
   */
  const type = body.type === undefined ? DEFAULT_SESSION_TYPE : String(body.type);
  if (!SESSION_TYPE_VALUES.includes(type)) {
    return NextResponse.json({ error: "세션 유형을 확인해주세요" }, { status: 400 });
  }

  const session = await prisma.webinarSession.create({
    data: {
      webinarId: webinar.id,
      number,
      type,
      title,
      speaker: String(body.speaker ?? "").trim() || null,
      speakerCompany: String(body.speakerCompany ?? "").trim() || null,
      speakerPhotoUrl: String(body.speakerPhotoUrl ?? "").trim() || null,
      logoUrl: String(body.logoUrl ?? "").trim() || null,
      description: String(body.description ?? "").trim() || null,
      speakerBio: String(body.speakerBio ?? "").trim() || null,
      startTime,
      endTime,
    },
  });

  await logActivity({
    workspaceId: webinar.workspaceId,
    userId: user.id,
    action: "webinar.session_created",
    meta: { webinarId: id, sessionId: session.id, number: session.number, title: session.title },
  });

  return NextResponse.json({ session }, { status: 201 });
}
