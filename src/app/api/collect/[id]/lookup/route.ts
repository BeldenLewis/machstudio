/**
 * 등록 확인 (Find My QR) — 설계 §10.
 *
 * 이메일 연동 전에는 등록자가 QR 을 되찾는 **유일한 경로**다(§2). 그래서 이건 편의 기능이
 * 아니라 등록 흐름의 일부다.
 *
 * ── 남용 방지(§10.2) ──────────────────────────────────────────────────
 * `or` 로 열어 두는 만큼 기계적 조회는 막는다:
 *  · 레이트리밋을 **IP 와 입력값 양쪽**에 건다. IP 만 걸면 봇넷이 한 이메일을 수천 IP 로
 *    돌려 볼 수 있고, 입력값만 걸면 한 IP 가 이메일을 바꿔 가며 명단을 훑을 수 있다.
 *  · 못 찾으면 **"찾을 수 없습니다" 로만 끝낸다.** "그 이메일은 있는데 전화가 다릅니다"
 *    같은 힌트를 주면 그게 곧 열거 창구다.
 *  · 내보내는 정보는 이름·유형·등록번호·QR 뿐(buildLookupView 가 강제한다).
 */
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getClientIp, rateLimitAsync } from "@/lib/ratelimit";
import { normalizeCollectForm } from "@/lib/collect-form-config";
import { buildLookupCriteria, buildLookupView } from "@/lib/collect-lookup";

function normalizeOrigin(s: string): string {
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}`;
  } catch {
    return s.trim().toLowerCase();
  }
}

const PREFLIGHT_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  Vary: "Origin",
} as const;

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

/** 입력값 기준 한도의 키. 원문을 로그·Redis 에 남기지 않으려고 해시로 만든다. */
function valueKey(id: string, email: string | null, phone: string | null): string {
  const raw = `${id}|${email ?? ""}|${phone ?? ""}`;
  return `collect-lookup-v:${createHash("sha256").update(raw).digest("base64url").slice(0, 22)}`;
}

/** 못 찾음 — **한 가지 응답으로만** 끝낸다. 이유를 나눠 주면 그게 열거 힌트다. */
function notFound(headers: Record<string, string>) {
  return NextResponse.json({ found: false }, { status: 200, headers });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // IP 한도가 먼저다 — 인증 없이 DB 를 여는 경로다.
  const ip = getClientIp(request);
  const ipRl = await rateLimitAsync(`collect-lookup-ip:${ip}`, { limit: 20, windowMs: 60_000 });
  if (!ipRl.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 잦아요. 잠시 후 다시 시도해주세요." },
      { status: 429, headers: { ...PREFLIGHT_HEADERS, "Retry-After": Math.ceil(ipRl.retryAfterMs / 1000).toString() } },
    );
  }

  let body: { email?: unknown; phone?: unknown };
  try {
    body = (await request.json()) as { email?: unknown; phone?: unknown };
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400, headers: PREFLIGHT_HEADERS });
  }

  const source = await prisma.collectSource.findUnique({
    where: { id },
    select: { id: true, isActive: true, mode: true, deletedAt: true, allowedOrigins: true, formConfig: true },
  });
  if (!source || !source.isActive || source.mode !== "builder" || source.deletedAt) {
    return notFound(PREFLIGHT_HEADERS);
  }

  const headers = corsHeaders(request.headers.get("origin"), source.allowedOrigins ?? []);
  if (source.allowedOrigins && source.allowedOrigins.length > 0) {
    const o = request.headers.get("origin");
    const norm = o ? normalizeOrigin(o) : "";
    if (!norm || !source.allowedOrigins.includes(norm)) {
      return NextResponse.json({ error: "허용되지 않은 출처" }, { status: 403, headers });
    }
  }

  const config = normalizeCollectForm(source.formConfig);
  // 운영자가 켜지 않았으면 조회 자체가 없다 — 켜면 이메일 하나만 아는 사람에게 QR 을
  // 보여 주는 화면이라, 의식적으로 켜야 한다(정규화의 기본값도 꺼짐이다).
  if (!config.lookup.enabled) return notFound(headers);

  const criteria = buildLookupCriteria(config, body);
  if (!criteria) return notFound(headers);

  // 입력값 기준 한도 — 같은 값을 반복 조회하는 봇넷을 막는다.
  const valueRl = await rateLimitAsync(valueKey(source.id, criteria.emailNormalized, criteria.phoneE164), {
    limit: 10,
    windowMs: 10 * 60_000,
  });
  if (!valueRl.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 잦아요. 잠시 후 다시 시도해주세요." },
      { status: 429, headers: { ...headers, "Retry-After": Math.ceil(valueRl.retryAfterMs / 1000).toString() } },
    );
  }

  const match: Record<string, unknown>[] = [];
  if (criteria.emailNormalized) match.push({ emailNormalized: criteria.emailNormalized });
  if (criteria.phoneE164) match.push({ phoneE164: criteria.phoneE164 });

  const record = await prisma.collectRecord.findFirst({
    where: {
      sourceId: source.id,
      // `and` 는 buildLookupCriteria 가 둘 다 있을 때만 통과시킨다 — 여기서는 그대로 AND/OR 로 옮긴다.
      ...(criteria.logic === "and" ? { AND: match } : { OR: match }),
    },
    // **필요한 두 컬럼만 읽는다.** 레코드 전체를 가져오면 나중에 응답에 실수로 흘러든다.
    select: { registrationNo: true, data: true },
    orderBy: { createdAt: "asc" },
  });
  if (!record) return notFound(headers);

  const view = buildLookupView(config, record);
  if (!view) return notFound(headers);

  return NextResponse.json({ found: true, ...view }, { headers });
}
