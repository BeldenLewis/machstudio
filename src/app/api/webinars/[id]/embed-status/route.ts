/**
 * 연결 상태 — 이 웨비나를 노출 중인 임베드 사이트들의 lastSeenAt.
 * DeployTab 이 10초 폴링(+visibility 가드)으로 "아임웹 연결됨" 배지를 그린다.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const webinar = await prisma.webinar.findUnique({ where: { id }, select: { workspaceId: true } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: webinar.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const sites = await prisma.webinarEmbedSite.findMany({
    where: { activeWebinarId: id, deletedAt: null },
    select: { id: true, name: true, siteUrl: true, livePageUrl: true, lastSeenAt: true, lastSeenOrigin: true, isActive: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ sites, now: new Date().toISOString() });
}
