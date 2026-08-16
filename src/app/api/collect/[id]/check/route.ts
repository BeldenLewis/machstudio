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

const PREFLIGHT_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  Vary: "Origin",
} as const;

function normalizeOrigin(s: string): string {
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}`;
  } catch {
    return s.trim().toLowerCase();
  }
}

/**
 * **제출 라우트와 같은 Origin 규칙을 쓴다.**
 *
 * 예전에는 여기만 항상 `*` 였다. 그러면 운영자가 allowedOrigins 를 파트너 도메인으로
 * 좁혀 놔도, 공격자가 아무 사이트에 스크립트 한 줄을 심어 **방문자들의 브라우저로 분산**
 * 조회를 돌릴 수 있다("ceo@경쟁사.com 이 이 전시에 등록했는가"). 부울 하나뿐이라도
 * 참관객 명단은 전시 사업의 자산이다.
 */
function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  const allowAll = allowed.length === 0;
  let allowOrigin = "*";
  if (!allowAll) {
    const o = origin ? normalizeOrigin(origin) : "";
    allowOrigin = o && allowed.includes(o) ? o : "null";
  }
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { ...PREFLIGHT_HEADERS, "Access-Control-Max-Age": "86400" },
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
      { status: 429, headers: { ...PREFLIGHT_HEADERS, "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString() } },
    );
  }

  let body: { email?: unknown };
  try {
    body = (await request.json()) as { email?: unknown };
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400, headers: PREFLIGHT_HEADERS });
  }

  const email = normalizeEmail(body.email);
  // 형식이 아니면 **소스를 조회하기도 전에** 끊는다 — 무효한 값으로 DB 를 두드리게 두면
  // 그게 곧 남용 경로다.
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ exists: false }, { headers: PREFLIGHT_HEADERS });
  }

  /**
   * 소스를 확인한다. 예전에는 URL 의 id 를 그대로 레코드 조회에 넣어서, 연동형·비활성·
   * 삭제된 소스에도 그대로 답하는 **범용 이메일 존재 오라클**이었다. 제출 라우트는 같은
   * 검사를 하는데 여기만 빠져 있었다.
   */
  const source = await prisma.collectSource.findUnique({
    where: { id },
    select: { id: true, isActive: true, mode: true, deletedAt: true, allowedOrigins: true },
  });
  if (!source || !source.isActive || source.mode !== "builder" || source.deletedAt) {
    return NextResponse.json({ exists: false }, { headers: PREFLIGHT_HEADERS });
  }

  const headers = corsHeaders(request.headers.get("origin"), source.allowedOrigins ?? []);
  if (source.allowedOrigins && source.allowedOrigins.length > 0) {
    const o = request.headers.get("origin");
    const norm = o ? normalizeOrigin(o) : "";
    if (!norm || !source.allowedOrigins.includes(norm)) {
      return NextResponse.json({ error: "허용되지 않은 출처" }, { status: 403, headers });
    }
  }

  const found = await prisma.collectRecord.findFirst({
    where: { sourceId: source.id, emailNormalized: email },
    select: { id: true },
  });

  return NextResponse.json({ exists: Boolean(found) }, { headers });
}
