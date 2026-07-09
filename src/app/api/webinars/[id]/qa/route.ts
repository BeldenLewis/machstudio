import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const webinar = await prisma.webinar.findUnique({ where: { id } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: webinar.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const questions = await prisma.webinarQA.findMany({
    where: { webinarId: id, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 500, // 최악의 경우 egress/렌더 상한 (실사용 규모 초과분은 페이지네이션 도입 시 확장)
  });

  return NextResponse.json({ questions });
}
