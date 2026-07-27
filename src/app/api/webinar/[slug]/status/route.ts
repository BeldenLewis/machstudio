import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWebinarStatus } from "@/lib/webinar-status";

// 경량 상태 전용 엔드포인트 — 라이브 전(사전등록·입장 대기) 폴링이 /info 전체(세션·테마·config)를
// 30초마다 다시 받지 않도록, 상태 전환 판정에 필요한 값만 반환한다.
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const webinar = await prisma.webinar.findUnique({
    where: { slug },
    select: { id: true, statusOverride: true, liveStartAt: true, liveEndAt: true, signupDeadline: true, components: true },
  });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404, headers: { "Access-Control-Allow-Origin": "*" } });

  const statusInfo = resolveWebinarStatus(webinar);

  /**
   * 함께 기다리는 사람 수 — 대기 화면 밴드의 값.
   *
   * 이 폴러에 얹은 이유: 대기 화면은 이미 이걸 30초마다 부른다. 수를 위해 새 폴러를 두면
   * 대기 시청자당 요청이 배로 늘고, 이 프로젝트는 그 egress 를 여러 번 줄여 왔다.
   *
   * 라이브 중에는 계산하지 않는다 — 그때는 시청자 수(live-state 의 viewerCount)가 같은 자리를
   * 맡고, 둘을 동시에 세면 "기다리는 사람" 과 "보고 있는 사람" 이 한 화면에서 경쟁한다.
   *
   * 창(5분)은 라이브 시청자 수와 같은 값이다 — 두 수가 같은 기준으로 움직여야 방송이 시작될 때
   * 숫자가 튀지 않는다. isActive 를 보지 않는 이유: 대기 프레즌스(event: "wait")는 그 값을
   * 건드리지 않는다(입장률·시청 시간을 오염시키지 않으려고).
   */
  const PRESENCE_WINDOW_MS = 5 * 60_000;
  const waitingCount = statusInfo.status === "live"
    ? null
    : await prisma.webinarRegistration.count({
        where: {
          webinarId: webinar.id,
          presencePingAt: { gte: new Date(Date.now() - PRESENCE_WINDOW_MS) },
        },
      });

  return NextResponse.json(
    {
      status: statusInfo.status,
      entryOpen: statusInfo.entryOpen,
      canRegister: statusInfo.canRegister,
      serverNow: new Date().toISOString(),
      waitingCount,
    },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET" } });
}
