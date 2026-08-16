import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
import { fireWebhook } from "@/lib/webhook";

// Origin/Host 정규화: 프로토콜 + 호스트만 남김
function normalizeOrigin(s: string): string {
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}`;
  } catch {
    return s.trim().toLowerCase();
  }
}

function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  // 빈 allowed = 모두 허용 (이전 동작 호환). 명시된 경우 매칭되는 경우에만 허용.
  const allowAll = allowed.length === 0;
  let allowOrigin = "*";
  if (!allowAll) {
    const o = origin ? normalizeOrigin(origin) : "";
    allowOrigin = o && allowed.includes(o) ? o : "null";
  }
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key",
    "Vary": "Origin",
  };
}

// CORS preflight 시점에는 apiKey 를 모를 수 있으므로 보수적으로 열어둠 (실제 차단은 POST 시점)
const PREFLIGHT_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PREFLIGHT_HEADERS });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400, headers: PREFLIGHT_HEADERS });
  }

  const url = new URL(request.url);
  const apiKey =
    request.headers.get("x-api-key") ?? url.searchParams.get("k") ?? (body.apiKey as string);
  if (!apiKey) {
    return NextResponse.json({ error: "API 키 필요" }, { status: 401, headers: PREFLIGHT_HEADERS });
  }

  // ── 1. API 키 검증 + 소스 로드 ─────────────────
  const source = await prisma.collectSource.findUnique({
    where: { apiKey },
    include: { fieldMappings: { orderBy: { sortOrder: "asc" } } },
  });
  if (!source || !source.isActive) {
    return NextResponse.json({ error: "유효하지 않은 API 키" }, { status: 401, headers: PREFLIGHT_HEADERS });
  }
  /**
   * 빌더형 소스는 **이 경로로 받지 않는다.**
   *
   * 여기는 외부 폼의 제출을 가로채는 연동형 입구라 data 를 그대로 받는다. 빌더형이 이걸
   * 통과하면 formConfig 검증·접수 창·동의가 전부 건너뛰어지고 임의 키가 그대로 저장된다
   * (validateSubmission 의 unknown_key 가 막으려는 바로 그 오염이다). 게다가 그렇게 들어온
   * 레코드 한 건이 "레코드가 있으면 방식 전환 불가" 규칙을 영구히 발동시킨다.
   * 빌더형 제출은 자기 라우트가 생기면 그쪽에서 검증과 함께 받는다.
   */
  if (source.mode === "builder") {
    return NextResponse.json(
      { error: "이 수집 소스는 빌더형이에요 — 이 엔드포인트로는 받지 않습니다" },
      { status: 409, headers: PREFLIGHT_HEADERS },
    );
  }

  const headers = corsHeaders(origin, source.allowedOrigins ?? []);

  // ── 2. Origin 검증 ────────────────────────────
  // allowedOrigins 가 비어있으면 모든 Origin 허용 (이전 동작과 호환).
  // 비어있지 않은데 매칭 실패 → 403.
  if (source.allowedOrigins && source.allowedOrigins.length > 0) {
    const o = origin ? normalizeOrigin(origin) : "";
    if (!o || !source.allowedOrigins.includes(o)) {
      return NextResponse.json(
        { error: "허용되지 않은 출처" },
        { status: 403, headers },
      );
    }
  }

  // ── 3. Rate limit (apiKey + IP 조합) ─────────
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const rlKey = `collect:${source.id}:${ip}`;
  const rl = rateLimit(rlKey, { limit: 30, windowMs: 60_000 }); // 1분 30회
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 잦아요. 잠시 후 다시 시도해주세요." },
      {
        status: 429,
        headers: {
          ...headers,
          "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString(),
        },
      },
    );
  }

  // ── 4. 허니팟 ─────────────────────────────────
  // 봇이 자동완성하는 hidden 필드. 값이 들어오면 봇으로 간주.
  // 보낸 쪽이 봇이라고 의심해도 200으로 응답해서 봇이 재시도하지 못하게 한다.
  const honeypot = (body._hp ?? body.honeypot ?? body.website) as string | undefined;
  if (honeypot && String(honeypot).trim() !== "") {
    return NextResponse.json({ ok: true, id: "skipped" }, { status: 200, headers });
  }

  const {
    data, _fieldMeta,
    utmSource, utmMedium, utmCampaign, utmTerm, utmContent, utmId,
    firstUtmSource, firstUtmMedium, firstUtmCampaign, firstUtmTerm, firstUtmContent, firstUtmId,
    firstReferrer, firstSeenAt,
    journey,
    referrer, userAgent,
  } = body as {
    data: Record<string, string>;
    _fieldMeta?: Array<{ index: number; label: string; type: string }>;
    utmSource?: string; utmMedium?: string; utmCampaign?: string;
    utmTerm?: string; utmContent?: string; utmId?: string;
    firstUtmSource?: string; firstUtmMedium?: string; firstUtmCampaign?: string;
    firstUtmTerm?: string; firstUtmContent?: string; firstUtmId?: string;
    firstReferrer?: string; firstSeenAt?: string;
    journey?: unknown;
    referrer?: string; userAgent?: string;
  };

  if (!data || typeof data !== "object") {
    return NextResponse.json({ error: "data 필드 필요" }, { status: 400, headers });
  }

  const parseDate = (s?: string): Date | null => {
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  };

  // journey 검증: 배열이어야 하고, 각 touchpoint 는 plain object. 최대 20개.
  // 형태가 잘못된 항목은 drop. 전체가 array 가 아니면 null.
  type JourneyTouch = {
    utmSource: string; utmMedium: string; utmCampaign: string;
    utmId: string; referrer: string; seenAt: string;
  };
  const sanitizeJourney = (j: unknown): JourneyTouch[] | null => {
    if (!Array.isArray(j)) return null;
    const out: JourneyTouch[] = [];
    for (const item of j) {
      if (!item || typeof item !== "object") continue;
      const it = item as Record<string, unknown>;
      out.push({
        utmSource:   typeof it.utmSource   === "string" ? it.utmSource   : "",
        utmMedium:   typeof it.utmMedium   === "string" ? it.utmMedium   : "",
        utmCampaign: typeof it.utmCampaign === "string" ? it.utmCampaign : "",
        utmId:       typeof it.utmId       === "string" ? it.utmId       : "",
        referrer:    typeof it.referrer    === "string" ? it.referrer    : "",
        seenAt:      typeof it.seenAt      === "string" ? it.seenAt      : "",
      });
      if (out.length >= 20) break;
    }
    return out.length > 0 ? out : null;
  };
  const cleanJourney = sanitizeJourney(journey);

  const recordData = {
    sourceId: source.id,
    projectId: source.projectId,
    workspaceId: source.workspaceId,
    data,
    utmSource: utmSource ?? null,
    utmMedium: utmMedium ?? null,
    utmCampaign: utmCampaign ?? null,
    utmTerm: utmTerm ?? null,
    utmContent: utmContent ?? null,
    utmId: utmId ?? null,
    firstUtmSource:   firstUtmSource   ?? null,
    firstUtmMedium:   firstUtmMedium   ?? null,
    firstUtmCampaign: firstUtmCampaign ?? null,
    firstUtmTerm:     firstUtmTerm     ?? null,
    firstUtmContent:  firstUtmContent  ?? null,
    firstUtmId:       firstUtmId       ?? null,
    firstReferrer:    firstReferrer    ?? null,
    firstSeenAt:      parseDate(firstSeenAt),
    journey:          (cleanJourney ?? null) as never,
    referrer: referrer ?? null,
    userAgent: userAgent ?? null,
    ip: ip === "unknown" ? null : ip,
  };

  let recordId: string;

  if (Array.isArray(_fieldMeta) && _fieldMeta.length > 0) {
    const [record] = await prisma.$transaction([
      prisma.collectRecord.create({ data: recordData }),
      prisma.collectSource.update({
        where: { id: source.id },
        data: { discoveredFields: _fieldMeta },
      }),
    ]);
    recordId = record.id;
  } else {
    const record = await prisma.collectRecord.create({ data: recordData });
    recordId = record.id;
  }

  // ── 5. 알림/웹훅 (백그라운드) ──────────────────
  if (source.webhookUrl) {
    fireWebhook(source.webhookUrl, {
      event: "record.created",
      sourceId: source.id,
      sourceName: source.name,
      recordId,
      data,
      utm: { utmSource, utmMedium, utmCampaign, utmTerm, utmContent },
      createdAt: new Date().toISOString(),
    });
  }

  if (source.notifyOnSubmit) {
    // 인앱 알림: 워크스페이스 멤버들에게
    prisma.workspaceMember
      .findMany({ where: { workspaceId: source.workspaceId }, select: { userId: true } })
      .then(async (members) => {
        if (members.length === 0) return;
        await prisma.notification.createMany({
          data: members.map((m) => ({
            userId: m.userId,
            type: "COLLECT_SUBMITTED",
            data: { sourceId: source.id, sourceName: source.name, recordId } as never,
          })),
        });
      })
      .catch((e) => console.warn("[notify] failed:", e));
  }

  return NextResponse.json({ ok: true, id: recordId }, { status: 201, headers });
}
