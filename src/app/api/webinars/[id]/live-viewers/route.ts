import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { ACTIVE_VIEWER_WINDOW_MS, resolveWebinarStatus } from "@/lib/webinar-status";

/**
 * 만들기 화면의 "지금 시청자 N명" 배지 전용 — **한 줄짜리 응답**.
 *
 * 왜 /dashboard 를 안 쓰는가: 그쪽은 카운트 9개 + 원시 집계 + 현재 시청자 목록까지 실어
 * 페이로드가 크다. 만들기에서는 30초마다 숫자 하나만 필요해서, 라이브 중일 때만
 * 이 라우트를 두드린다(라이브가 아니면 클라이언트가 아예 호출하지 않는다).
 *
 * 판정 창은 ACTIVE_VIEWER_WINDOW_MS 한 곳에서 온다 — 대시보드와 다른 숫자를 보여주면
 * "운영 탭은 12명, 만들기는 9명" 같은 신뢰 붕괴가 생긴다.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const webinar = await prisma.webinar.findUnique({
    where: { id },
    select: { workspaceId: true, liveStartAt: true, liveEndAt: true, signupDeadline: true, statusOverride: true },
  });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: webinar.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const activeViewers = await prisma.webinarRegistration.count({
    where: { webinarId: id, lastPingAt: { gte: new Date(Date.now() - ACTIVE_VIEWER_WINDOW_MS) } },
  });

  return NextResponse.json({
    activeViewers,
    // 상태도 함께 준다 — 클라이언트의 isLive 는 브라우저 시계로 계산한 값이라,
    // 방송이 끝난 뒤에도 배지가 "라이브 중" 이라고 남을 수 있다. 서버 판정이 기준이다.
    isLive: resolveWebinarStatus(webinar).status === "live",
  });
}
