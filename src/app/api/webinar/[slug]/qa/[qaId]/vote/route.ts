import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimitAsync } from "@/lib/ratelimit";

const CORS = { "Access-Control-Allow-Origin": "*" };

// 공개 POST — Q&A 추천. 등록자당 1표(unique)로 중복 방지, voteCount 원자적 증가.
export async function POST(request: Request, { params }: { params: Promise<{ slug: string; qaId: string }> }) {
  const { slug, qaId } = await params;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const rl = await rateLimitAsync(`webinar-qa-vote:${slug}:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 잦아요." },
      { status: 429, headers: { ...CORS, "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString() } },
    );
  }

  const webinar = await prisma.webinar.findUnique({ where: { slug }, select: { id: true } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404, headers: CORS });

  const body = await request.json().catch(() => ({}));

  // registrationId 는 이 웨비나 등록자일 때만 신뢰 (아니면 익명 — 중복 방지 불가하나 rate-limit 로 완화)
  const rawRegId = body?.registrationId ? String(body.registrationId) : null;
  let registrationId: string | null = null;
  if (rawRegId) {
    const reg = await prisma.webinarRegistration.findFirst({ where: { id: rawRegId, webinarId: webinar.id }, select: { id: true } });
    registrationId = reg ? reg.id : null;
  }
  // 등록 후 입장한 시청자만 추천 가능 — 익명(null) 표는 등록자당 1표 유니크로 디둡되지 않아 중복 추천 우회가 되므로 차단.
  if (!registrationId) {
    return NextResponse.json({ error: "등록 후 입장한 시청자만 추천할 수 있어요." }, { status: 403, headers: CORS });
  }

  // 질문이 이 웨비나 소속이며 미채택이 아닌지 확인
  const qa = await prisma.webinarQA.findFirst({
    where: { id: qaId, webinarId: webinar.id, status: { not: "dismissed" } },
    select: { id: true },
  });
  if (!qa) return NextResponse.json({ error: "질문을 찾지 못했어요" }, { status: 404, headers: CORS });

  let alreadyVoted = false;
  try {
    await prisma.$transaction([
      prisma.webinarQAVote.create({ data: { qaId: qa.id, registrationId } }),
      prisma.webinarQA.update({ where: { id: qa.id }, data: { voteCount: { increment: 1 } } }),
    ]);
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "P2002") alreadyVoted = true;
    else throw e;
  }

  const updated = await prisma.webinarQA.findUnique({ where: { id: qa.id }, select: { voteCount: true } });
  return NextResponse.json({ voteCount: updated?.voteCount ?? 0, alreadyVoted }, { status: 201, headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: { ...CORS, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type" },
  });
}
