import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimitAsync } from "@/lib/ratelimit";

const CORS = { "Access-Control-Allow-Origin": "*" };
const KINDS = new Set(["cta", "tally", "cta_secondary"]);

// 공개 POST — 라이브 CTA/팝업 버튼 클릭 비콘. 클릭률·리드 스코어링 집계용(신규 수집).
// registrationId·popupId 는 이 웨비나 소속일 때만 신뢰(vote/ping 라우트와 동일). 익명 클릭도 총계엔 반영.
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const rl = await rateLimitAsync(`webinar-cta-click:${slug}:${ip}`, { limit: 40, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 잦아요." },
      { status: 429, headers: { ...CORS, "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString() } },
    );
  }

  const webinar = await prisma.webinar.findUnique({ where: { slug }, select: { id: true } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404, headers: CORS });

  const body = await request.json().catch(() => ({}));
  const kind = KINDS.has(body?.kind) ? String(body.kind) : "cta";

  let popupId: string | null = null;
  if (body?.popupId) {
    const p = await prisma.webinarPopup.findFirst({
      where: { id: String(body.popupId), webinarId: webinar.id },
      select: { id: true },
    });
    popupId = p ? p.id : null;
  }

  let registrationId: string | null = null;
  if (body?.registrationId) {
    const reg = await prisma.webinarRegistration.findFirst({
      where: { id: String(body.registrationId), webinarId: webinar.id },
      select: { id: true },
    });
    registrationId = reg ? reg.id : null;
  }

  await prisma.webinarPopupClick.create({
    data: { webinarId: webinar.id, popupId, registrationId, kind },
  });

  return NextResponse.json({ ok: true }, { status: 201, headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: { ...CORS, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type" },
  });
}
