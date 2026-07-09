import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
import { resolveWebinarStatus } from "@/lib/webinar-status";
import { maskName } from "@/lib/mask";

const CORS = { "Access-Control-Allow-Origin": "*" };
const MAX_LEN = 300;

// 공개 GET — 최근 채팅. after(ISO) 이후만 증분 조회. 이름은 마스킹(호스트는 표시명 유지).
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const webinar = await prisma.webinar.findUnique({ where: { slug }, select: { id: true, components: true } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404, headers: CORS });

  const components = (webinar.components ?? {}) as Record<string, unknown>;
  if (components.chatEnabled !== true) {
    return NextResponse.json({ messages: [], disabled: true }, { headers: { ...CORS, "Cache-Control": "no-store" } });
  }

  const afterParamRaw = new URL(request.url).searchParams.get("after");
  const afterMs = afterParamRaw ? Date.parse(afterParamRaw) : NaN;
  const after = Number.isNaN(afterMs) ? null : new Date(afterMs);

  let rows;
  if (after) {
    // 증분 — after 이후 오름차순. gte + 클라이언트 id 디둡으로 같은 ms/경계 메시지 유실 방지.
    rows = await prisma.webinarChatMessage.findMany({
      where: { webinarId: webinar.id, createdAt: { gte: after } },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: { id: true, name: true, message: true, isHost: true, createdAt: true },
    });
  } else {
    // 초기 — 최근 50개를 시간순으로
    const recent = await prisma.webinarChatMessage.findMany({
      where: { webinarId: webinar.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, name: true, message: true, isHost: true, createdAt: true },
    });
    rows = recent.reverse();
  }

  const messages = rows.map((m) => ({
    id: m.id,
    name: m.isHost ? m.name : maskName(m.name),
    message: m.message,
    isHost: m.isHost,
    createdAt: m.createdAt,
  }));

  return NextResponse.json({ messages }, { headers: { ...CORS, "Cache-Control": "no-store" } });
}

// 공개 POST — 시청자 채팅 전송. 라이브 + chatEnabled 에서만, 등록자 검증, 레이트 리밋.
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const rl = rateLimit(`webinar-chat:${slug}:${ip}`, { limit: 15, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "메시지를 너무 자주 보내고 있어요. 잠시 후 다시 시도해주세요." },
      { status: 429, headers: { ...CORS, "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString() } },
    );
  }

  const webinar = await prisma.webinar.findUnique({ where: { slug } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404, headers: CORS });

  const components = (webinar.components ?? {}) as Record<string, unknown>;
  if (components.chatEnabled !== true) {
    return NextResponse.json({ error: "채팅이 열려 있지 않아요" }, { status: 403, headers: CORS });
  }
  if (resolveWebinarStatus(webinar).status !== "live") {
    return NextResponse.json({ error: "라이브 중에만 채팅할 수 있어요" }, { status: 400, headers: CORS });
  }

  const body = await request.json().catch(() => ({}));
  const message = String(body?.message ?? "").trim().slice(0, MAX_LEN);
  if (!message) return NextResponse.json({ error: "메시지를 입력해주세요" }, { status: 400, headers: CORS });

  // 등록자 검증 — 이 웨비나 등록자일 때만 신뢰. 이름은 등록명 우선.
  const rawRegId = body?.registrationId ? String(body.registrationId) : null;
  let registrationId: string | null = null;
  let name = String(body?.name ?? "").trim();
  if (rawRegId) {
    const reg = await prisma.webinarRegistration.findFirst({
      where: { id: rawRegId, webinarId: webinar.id },
      select: { id: true, name: true },
    });
    if (reg) {
      registrationId = reg.id;
      if (!name) name = reg.name;
    }
  }
  if (!name) name = "익명";

  const created = await prisma.webinarChatMessage.create({
    data: { webinarId: webinar.id, registrationId, name: name.slice(0, 60), message, isHost: false },
    select: { id: true },
  });

  return NextResponse.json({ message: { id: created.id } }, { status: 201, headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: { ...CORS, "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "Content-Type" },
  });
}
