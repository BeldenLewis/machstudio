/**
 * 공유 기록 비콘 — "누가 공유 버튼을 눌렀나".
 *
 * 뷰어의 공유 버튼(대기 "초대 공유" · 시청 "공유" · 종료 "링크 복사")이 클릭 직후 fire-and-forget
 * 으로 보낸다. **응답을 기다리지 않는다** — 클립보드 쓰기·공유 시트는 사용자 제스처가 살아 있는
 * 동안만 허용되므로(iOS Safari), 여기에 await 를 걸면 공유 자체가 조용히 실패한다.
 * 그래서 링크에 필요한 추천 코드는 이 라우트가 아니라 등록·입장확인 응답에서 미리 받아 둔다.
 *
 * 폴러가 아니다(사용자가 버튼을 누를 때만 1회).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimitAsync } from "@/lib/ratelimit";
import { isShareChannel, isShareSurface } from "@/lib/webinar-share";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { ...CORS_HEADERS, "Access-Control-Max-Age": "86400" },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  /* 무인증 비콘이 행을 만들므로 공유 스토어(Redis) 한도를 쓴다 — visit/seen 과 같은 규칙.
     사람이 공유 버튼을 1분에 20번 넘게 누르는 일은 없다. */
  const rl = await rateLimitAsync(`webinar-share:${ip}`, { limit: 20, windowMs: 60_000 });
  if (!rl.allowed) return new NextResponse(null, { status: 429, headers: CORS_HEADERS });

  const body = await request.json().catch(async () => {
    // sendBeacon 이 text/plain 으로 보내는 브라우저 대비(visit/seen 과 동일한 폴백)
    const text = await request.text().catch(() => "");
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  });

  const registrationId = typeof body?.registrationId === "string" ? body.registrationId : "";
  if (!registrationId || !isShareSurface(body?.surface) || !isShareChannel(body?.channel)) {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }

  const webinar = await prisma.webinar.findUnique({
    where: { slug },
    select: { id: true, project: { select: { deletedAt: true } } },
  });
  // 삭제 유예 중 프로젝트는 공개 면에서 없는 것으로 다룬다(다른 공개 라우트와 같은 규칙).
  if (!webinar || webinar.project.deletedAt !== null) {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }

  /* 이 웨비나의 등록자인지 확인한다 — 확인하지 않으면 남의 웨비나 registrationId 로
     엉뚱한 공유 기록을 심을 수 있고, 외래키 위반으로 500 이 난다. */
  const belongs = await prisma.webinarRegistration.findFirst({
    where: { id: registrationId, webinarId: webinar.id },
    select: { id: true },
  });
  if (!belongs) return new NextResponse(null, { status: 204, headers: CORS_HEADERS });

  await prisma.webinarShareEvent
    .create({
      data: { webinarId: webinar.id, registrationId, surface: body.surface, channel: body.channel },
    })
    .catch(() => {});

  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
