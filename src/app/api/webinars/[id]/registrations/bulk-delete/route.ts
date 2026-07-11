import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

const MAX_IDS = 1000;

async function authorize(webinarId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "인증 필요" }, { status: 401 }) } as const;
  const webinar = await prisma.webinar.findUnique({ where: { id: webinarId } });
  if (!webinar) return { error: NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 }) } as const;
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: webinar.workspaceId } },
  });
  if (!membership) return { error: NextResponse.json({ error: "접근 권한 없음" }, { status: 403 }) } as const;
  // 파괴적 대량 작업 — 웨비나 삭제와 동일하게 관리자 이상만(MEMBER 차단).
  if (membership.role === "MEMBER") return { error: NextResponse.json({ error: "일괄 삭제 권한이 없어요. 관리자에게 문의하세요." }, { status: 403 }) } as const;
  return { error: null, workspaceId: webinar.workspaceId, userId: user.id } as const;
}

// 선택 등록자 일괄 삭제 — 항상 이 웨비나 소속으로 스코프해 타 웨비나 행이 지워지지 않게 한다.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body?.ids)
    ? Array.from(new Set(body.ids.map((x: unknown) => String(x)).filter(Boolean))).slice(0, MAX_IDS)
    : [];
  if (ids.length === 0) return NextResponse.json({ error: "선택된 등록자가 없어요" }, { status: 400 });

  const result = await prisma.webinarRegistration.deleteMany({
    where: { id: { in: ids as string[] }, webinarId: id },
  });

  await logActivity({
    workspaceId: auth.workspaceId,
    userId: auth.userId,
    action: "webinar.registrations_bulk_deleted",
    meta: { webinarId: id, requested: ids.length, deleted: result.count },
  });

  return NextResponse.json({ deleted: result.count });
}
