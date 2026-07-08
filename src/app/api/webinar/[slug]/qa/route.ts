import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
import { resolveWebinarStatus } from "@/lib/webinar-status";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const webinar = await prisma.webinar.findUnique({ where: { slug }, select: { id: true } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });

  // 공개 GET — 답변된 질문만, 질문자 이름(PII)은 제외
  const questions = await prisma.webinarQA.findMany({
    where: { webinarId: webinar.id, status: "answered" },
    orderBy: { createdAt: "asc" },
    select: { id: true, question: true, sessionNumber: true, status: true, createdAt: true },
  });

  return NextResponse.json({ questions }, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const rl = rateLimit(`webinar-qa:${slug}:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 잦아요. 잠시 후 다시 시도해주세요." },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString() } },
    );
  }

  const webinar = await prisma.webinar.findUnique({ where: { slug } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });

  // 라이브 여부는 상태머신으로 판정 — statusOverride(운영 콘솔 수동 전환) 반영
  if (resolveWebinarStatus(webinar).status !== "live") {
    return NextResponse.json({ error: "라이브 중에만 질문을 남길 수 있어요" }, { status: 400 });
  }

  const body = await request.json();
  const { question, sessionNumber, name, company, phone, email } = body;

  // 허니팟 — 봇 차단. 200 으로 응답.
  const honeypot = (body?._hp ?? body?.honeypot ?? body?.website) as string | undefined;
  if (honeypot && String(honeypot).trim() !== "") {
    return NextResponse.json(
      { qa: { id: "skipped" } },
      { status: 201, headers: { "Access-Control-Allow-Origin": "*" } },
    );
  }

  if (!question?.trim()) {
    return NextResponse.json({ error: "질문 내용을 입력해주세요" }, { status: 400 });
  }

  const qa = await prisma.webinarQA.create({
    data: {
      webinarId: webinar.id,
      question: question.trim(),
      sessionNumber: sessionNumber ?? null,
      name: name?.trim() || null,
      company: company?.trim() || null,
      phone: phone?.trim() || null,
      email: email?.trim() || null,
    },
  });

  return NextResponse.json({ qa: { id: qa.id } }, {
    status: 201,
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
