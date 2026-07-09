import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";

const CORS = { "Access-Control-Allow-Origin": "*" };

// 공개 POST — 투표. 등록자당 1표(unique)로 중복 방지, 옵션 voteCount 원자적 증가.
export async function POST(request: Request, { params }: { params: Promise<{ slug: string; pollId: string }> }) {
  const { slug, pollId } = await params;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const rl = rateLimit(`webinar-poll-vote:${slug}:${ip}`, { limit: 20, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 잦아요. 잠시 후 다시 시도해주세요." },
      { status: 429, headers: { ...CORS, "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString() } },
    );
  }

  const webinar = await prisma.webinar.findUnique({ where: { slug }, select: { id: true } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404, headers: CORS });

  const body = await request.json().catch(() => ({}));
  const optionId = String(body?.optionId ?? "");

  // registrationId 는 이 웨비나의 실제 등록자일 때만 신뢰 (ping 라우트와 동일) —
  // 임의·타 웨비나 id 로 남의 표 슬롯을 선점하는 것을 막고, 확인 안 되면 익명 처리.
  const rawRegId = body?.registrationId ? String(body.registrationId) : null;
  let registrationId: string | null = null;
  if (rawRegId) {
    const reg = await prisma.webinarRegistration.findFirst({
      where: { id: rawRegId, webinarId: webinar.id },
      select: { id: true },
    });
    registrationId = reg ? reg.id : null;
  }

  // 활성 투표 + 해당 웨비나 소속 + 옵션 유효성 확인
  const poll = await prisma.webinarPoll.findFirst({
    where: { id: pollId, webinarId: webinar.id, isActive: true },
    select: { id: true, options: { select: { id: true } } },
  });
  if (!poll) return NextResponse.json({ error: "종료된 투표예요" }, { status: 400, headers: CORS });
  if (!poll.options.some((o) => o.id === optionId)) {
    return NextResponse.json({ error: "선택지가 올바르지 않아요" }, { status: 400, headers: CORS });
  }

  // 중복 투표(P2002)면 증가 없이 현재 집계만 반환 — 이미 참여한 것으로 처리
  let alreadyVoted = false;
  try {
    await prisma.$transaction([
      prisma.webinarPollVote.create({ data: { pollId: poll.id, optionId, registrationId } }),
      prisma.webinarPollOption.update({ where: { id: optionId }, data: { voteCount: { increment: 1 } } }),
    ]);
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "P2002") alreadyVoted = true;
    else throw e;
  }

  const options = await prisma.webinarPollOption.findMany({
    where: { pollId: poll.id },
    orderBy: { order: "asc" },
    select: { id: true, label: true, voteCount: true },
  });

  return NextResponse.json({ options, alreadyVoted }, { status: 201, headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: { ...CORS, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type" },
  });
}
