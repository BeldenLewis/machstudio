import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimitAsync, getClientIp } from "@/lib/ratelimit";
import { isValidPhone, isValidEmail } from "@/lib/webinar-config";

const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };

// 등록 폼 실시간 중복 확인 — 연락처/이메일이 이미 등록돼 있는지 불리언만 답한다.
// register 의 409(duplicateField)·verify 가 이미 같은 사실을 노출하므로 새 정보 유출은 없지만,
// 열거(enumeration) 남용을 막기 위해 레이트리밋을 건다.
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const ip = getClientIp(request);
  const rl = await rateLimitAsync(`webinar-regcheck:${slug}:${ip}`, { limit: 20, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 잦아요. 잠시 후 다시 시도해주세요." },
      { status: 429, headers: { ...CORS_HEADERS, "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString() } },
    );
  }

  const webinar = await prisma.webinar.findUnique({ where: { slug }, select: { id: true } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404, headers: CORS_HEADERS });

  const body = await request.json().catch(() => ({}));
  const phone = String(body?.phone ?? "").replace(/[^0-9]/g, "");
  const email = String(body?.email ?? "").trim().toLowerCase();
  const phoneValid = isValidPhone(phone);
  const emailValid = isValidEmail(email);
  if (!phoneValid && !emailValid) {
    return NextResponse.json({ error: "확인할 연락처 또는 이메일을 보내주세요" }, { status: 400, headers: CORS_HEADERS });
  }

  const [phoneDup, emailDup] = await Promise.all([
    phoneValid
      ? prisma.webinarRegistration.findFirst({ where: { webinarId: webinar.id, phone }, select: { id: true } })
      : Promise.resolve(null),
    emailValid
      ? prisma.webinarRegistration.findFirst({ where: { webinarId: webinar.id, email }, select: { id: true } })
      : Promise.resolve(null),
  ]);

  return NextResponse.json(
    { exists: { phone: Boolean(phoneDup), email: Boolean(emailDup) } },
    { headers: CORS_HEADERS },
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
