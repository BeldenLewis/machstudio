import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimitAsync, rateLimitPeekAsync } from "@/lib/ratelimit";

// found=false 전용 한도 — 미스만 기록해 5분에 5회 넘는 실패 조회를 차단 (명단 enumeration 방지).
// 성공 조회는 미스 버킷에 기록하지 않으므로 정상 참가자의 오타 1~2회는 영향 없음.
const MISS_LIMIT = { limit: 5, windowMs: 300_000 };

function normalizePhone(value: unknown) {
  const text = String(value ?? "").replace(/[^0-9]/g, "");
  return text || null;
}

function normalizeEmail(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  return text || null;
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // 공개 엔드포인트 — 전화번호/이메일 무차별 대입으로 명단 enumeration 방지
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const rl = await rateLimitAsync(`verify:${slug}:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 잦아요. 잠시 후 다시 시도해주세요." },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString(),
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }

  // 미스 한도 초과 상태면 조회 자체를 막는다 (found 여부 노출 차단)
  if ((await rateLimitPeekAsync(`verify-miss:${slug}:${ip}`, MISS_LIMIT)).blocked) {
    return NextResponse.json(
      { error: "확인 실패가 반복됐어요. 잠시 후 다시 시도해주세요." },
      { status: 429, headers: { "Retry-After": "300", "Access-Control-Allow-Origin": "*" } },
    );
  }

  const webinar = await prisma.webinar.findUnique({ where: { slug }, select: { id: true, config: true } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });

  const body = await request.json();
  const { type, value } = body;

  if (!type || !value) {
    return NextResponse.json({ found: false, registration: null }, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  const normalizedValue = type === "phone" ? normalizePhone(value) : normalizeEmail(value);
  if (!normalizedValue) {
    return NextResponse.json({ found: false, registration: null }, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  const where =
    type === "phone"
      ? { webinarId: webinar.id, phone: normalizedValue }
      : { webinarId: webinar.id, email: normalizedValue };

  // 입장 확인엔 이름만 있으면 충분 — PII(email/phone/company/department/jobTitle/industry) 미반환
  const registration = await prisma.webinarRegistration.findFirst({
    where,
    select: { id: true, name: true },
  });

  // 미스만 기록 — 다음 요청부터 peek 이 차단 판정에 사용
  if (!registration) {
    await rateLimitAsync(`verify-miss:${slug}:${ip}`, MISS_LIMIT);
  }

  // 인증 통과자에게만 영상 ID 전달 (공개 /info 에서는 제거됨)
  const youtubeId = registration && webinar.config && typeof (webinar.config as Record<string, unknown>).youtubeId === "string"
    ? (webinar.config as Record<string, unknown>).youtubeId
    : undefined;

  // 알림 스위치 초기 상태 복원용 — 이 등록자가 이미 구독 중인지
  const reminderSubscribed = registration
    ? !!(await prisma.webinarReminder.findFirst({ where: { webinarId: webinar.id, registrationId: registration.id }, select: { id: true } }))
    : false;

  return NextResponse.json(
    { found: !!registration, registration: registration ?? null, reminderSubscribed, ...(youtubeId ? { youtubeId } : {}) },
    { headers: { "Access-Control-Allow-Origin": "*" } }
  );
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
