import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";

const CORS = { "Access-Control-Allow-Origin": "*" };

// 등록자 검증 후 이메일을 얻는다 — 이 웨비나 등록자일 때만.
async function resolveEmail(webinarId: string, registrationId: string | null): Promise<string | null> {
  if (!registrationId) return null;
  const reg = await prisma.webinarRegistration.findFirst({
    where: { id: registrationId, webinarId },
    select: { email: true },
  });
  return reg?.email?.trim() || null;
}

// 공개 POST — "알림 받고 이어보기" 구독. 등록자 이메일을 저장(upsert).
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const rl = rateLimit(`webinar-reminder:${slug}:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "요청이 너무 잦아요." }, { status: 429, headers: CORS });

  const webinar = await prisma.webinar.findUnique({ where: { slug }, select: { id: true } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404, headers: CORS });

  const body = await request.json().catch(() => ({}));
  const registrationId = body?.registrationId ? String(body.registrationId) : null;
  const email = await resolveEmail(webinar.id, registrationId);
  if (!email) {
    return NextResponse.json({ error: "등록 시 이메일이 없어 알림을 받을 수 없어요." }, { status: 400, headers: CORS });
  }

  await prisma.webinarReminder.upsert({
    where: { webinarId_email: { webinarId: webinar.id, email } },
    create: { webinarId: webinar.id, email, registrationId },
    update: { registrationId },
  });

  return NextResponse.json({ subscribed: true }, { status: 201, headers: CORS });
}

// 공개 DELETE — 구독 해제.
export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const rl = rateLimit(`webinar-reminder:${slug}:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "요청이 너무 잦아요." }, { status: 429, headers: CORS });

  const webinar = await prisma.webinar.findUnique({ where: { slug }, select: { id: true } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404, headers: CORS });

  const body = await request.json().catch(() => ({}));
  const registrationId = body?.registrationId ? String(body.registrationId) : null;
  const email = await resolveEmail(webinar.id, registrationId);
  if (email) {
    await prisma.webinarReminder.deleteMany({ where: { webinarId: webinar.id, email } });
  }

  return NextResponse.json({ subscribed: false }, { headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: { ...CORS, "Access-Control-Allow-Methods": "POST, DELETE", "Access-Control-Allow-Headers": "Content-Type" },
  });
}
