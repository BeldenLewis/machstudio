import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWebinarStatus } from "@/lib/webinar-status";
import { rateLimitAsync } from "@/lib/ratelimit";

const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };

// 시청 구간(WebinarAttendanceSegment): 마지막 ping 후 90초 내면 열린 구간을 연장,
// 그보다 오래 끊겼다 돌아오면 새 구간을 만든다. 시청 곡선("몇 분 지점에 몇 명")의 원천.
const SEGMENT_GAP_MS = 90_000;

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // 무인증 쓰기 — IP당 한도로 증폭/비용 방어 (시청자 heartbeat 는 60±10초 주기라 넉넉)
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  if (!(await rateLimitAsync(`webinar-ping:${ip}`, { limit: 120, windowMs: 60_000 })).allowed) {
    return new NextResponse(null, { status: 429, headers: CORS_HEADERS });
  }

  const webinar = await prisma.webinar.findUnique({
    where: { slug },
    select: {
      id: true,
      liveStartAt: true,
      liveEndAt: true,
      signupDeadline: true,
      statusOverride: true,
      // components 는 ping 에서 미사용 — heartbeat 마다 JSON 컬럼을 끌어오지 않게 제외.
    },
  });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });

  // 상태를 응답에 동봉 — live 페이지가 별도 요청 없이 상태 전환을 감지할 수 있게 (Phase 2 에서 소비)
  const statusInfo = resolveWebinarStatus(webinar);

  const body = await request.json().catch(async () => {
    const text = await request.text().catch(() => "");
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  });
  const { registrationId, event, hidden } = body;

  if (!registrationId || typeof registrationId !== "string") {
    return NextResponse.json({ ok: true, status: statusInfo.status }, { headers: CORS_HEADERS });
  }

  const now = new Date();
  let updatedCount = 0;
  // 직전 ping 이후 경과분을 접속 시간에 더한다. 90초(SEGMENT_GAP_MS)를 넘으면 그 사이엔
  // 자리를 비운 것이므로 더하지 않는다 — 구간 합산과 같은 규칙이되, 겹침 이중계산이 불가능하다.
  // 탭이 보였던 경우(hidden !== true)만 포커스 시간에도 함께 더한다.
  // ⚠ lastPingAt 을 갱신하기 전에 실행해야 직전 간격을 읽을 수 있다.
  const GAP = Math.floor(SEGMENT_GAP_MS / 1000);
  const visibleFactor = hidden === true ? 0 : 1;
  await prisma.$executeRaw`
    UPDATE "WebinarRegistration"
    SET "connectedSeconds" = "connectedSeconds" + LEAST(${GAP}, GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (${now}::timestamptz - "lastPingAt")))::int)),
        "focusSeconds" = "focusSeconds" + ${visibleFactor} * LEAST(${GAP}, GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (${now}::timestamptz - "lastPingAt")))::int))
    WHERE "id" = ${registrationId} AND "webinarId" = ${webinar.id} AND "lastPingAt" IS NOT NULL
  `;

  if (event === "enter") {
    // enteredAt 은 최초 입장 시각만 유지 — 새로고침/재입장이 덮어써 체류 시간이 리셋되지 않게 COALESCE.
    updatedCount = await prisma.$executeRaw`
      UPDATE "WebinarRegistration"
      SET "enteredAt" = COALESCE("enteredAt", ${now}), "isActive" = true, "lastPingAt" = ${now}, "presencePingAt" = ${now}
      WHERE "id" = ${registrationId} AND "webinarId" = ${webinar.id}
    `;
  } else if (event === "leave") {
    // stayMinutes 는 enteredAt 기준 재계산 — 기존 조회+갱신 2쿼리를 단일 UPDATE 로.
    // (timestamp 컬럼은 UTC 저장이므로 epoch 연산이 정확하다)
    const nowEpoch = Math.floor(now.getTime() / 1000);
    updatedCount = await prisma.$executeRaw`
      UPDATE "WebinarRegistration"
      SET "leftAt" = ${now}, "isActive" = false, "lastPingAt" = ${now}, "presencePingAt" = ${now},
          "stayMinutes" = GREATEST(0, FLOOR((${nowEpoch} - EXTRACT(EPOCH FROM "enteredAt")) / 60))::int
      WHERE "id" = ${registrationId} AND "webinarId" = ${webinar.id} AND "enteredAt" IS NOT NULL
    `;
  } else {
    // heartbeat
    updatedCount = (
      await prisma.webinarRegistration.updateMany({
        where: { id: registrationId, webinarId: webinar.id },
        data: { lastPingAt: now, presencePingAt: now, isActive: true },
      })
    ).count;
  }

  // 등록 검증(updatedCount>0)을 통과한 경우에만 구간 기록
  if (updatedCount > 0) {
    const extended = await prisma.webinarAttendanceSegment.updateMany({
      where: {
        registrationId,
        webinarId: webinar.id,
        endedAt: { gte: new Date(now.getTime() - SEGMENT_GAP_MS) },
      },
      data: { endedAt: now },
    });
    // leave 는 열린 구간 연장만 — 끊긴 지 오래면 유령 구간을 만들지 않는다
    if (extended.count === 0 && event !== "leave") {
      await prisma.webinarAttendanceSegment
        .create({ data: { webinarId: webinar.id, registrationId, startedAt: now, endedAt: now } })
        .catch(() => {});
    }
  }

  return NextResponse.json({ ok: true, status: statusInfo.status }, { headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
