/**
 * 실시간 중복 확인 (설계 §6.2) — 이메일 하나가 이미 등록됐는지만 답한다.
 *
 * **boolean 하나만 돌려준다.** 이름·등록일 같은 걸 함께 주면 이 엔드포인트가 남의 등록
 * 정보를 캐는 창구가 된다. 제출 라우트의 409 가 이미 같은 사실을 노출하므로 새로운 정보
 * 유출은 없지만, **열거(enumeration) 남용**은 막아야 해서 레이트리밋을 건다.
 *
 * 이건 안내이지 방어선이 아니다 — 조회와 INSERT 사이에 다른 제출이 끼어들 수 있다.
 * 실제 차단은 (sourceId, emailNormalized) 부분 유니크 인덱스가 한다.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientIp, rateLimitAsync } from "@/lib/ratelimit";
import { isValidEmail } from "@/lib/webinar-config";
import { normalizeEmail } from "@/lib/collect-submit";

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

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // 레이트리밋이 먼저다 — 인증 없이 DB 를 여는 경로다.
  const ip = getClientIp(request);
  const rl = await rateLimitAsync(`collect-check:${id}:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 잦아요" },
      { status: 429, headers: { ...CORS_HEADERS, "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString() } },
    );
  }

  let body: { email?: unknown };
  try {
    body = (await request.json()) as { email?: unknown };
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400, headers: CORS_HEADERS });
  }

  const email = normalizeEmail(body.email);
  // 형식이 아니면 조회하지 않는다 — 무효한 값으로 DB 를 두드리게 두면 그게 곧 남용 경로다.
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ exists: false }, { headers: CORS_HEADERS });
  }

  const found = await prisma.collectRecord.findFirst({
    where: { sourceId: id, emailNormalized: email },
    select: { id: true },
  });

  return NextResponse.json({ exists: Boolean(found) }, { headers: CORS_HEADERS });
}
