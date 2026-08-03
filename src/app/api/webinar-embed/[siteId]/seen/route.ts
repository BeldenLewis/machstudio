/**
 * seen 비콘 — 로더 초기화 시 세션당 1회 sendBeacon.
 * 역할 두 가지:
 *  1. 연결 감지: lastSeenAt/lastSeenOrigin 갱신 → 어드민 "아임웹 연결됨" 배지
 *  2. 방문 집계: WebinarVisitStat 일 단위(KST) upsert → 퍼널의 "방문" 단계
 * config GET 에 쓰기 부작용을 두지 않기 위해 분리된 엔드포인트 (CDN 캐시와 무충돌).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimitAsync } from "@/lib/ratelimit";
import { normalizeUtmKey } from "@/lib/attribution-normalize";

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

/**
 * 방문 집계 키는 등록 쪽(webinar-attribution 의 cleanKey)과 **같은 규칙**이어야 한다.
 * 예전엔 여기만 trim + 100자였다 — 대문자가 섞인 링크나 100자를 넘는 값에서 방문(분모)과
 * 등록(분자)이 서로 다른 행으로 갈라져 분석 표의 등록률이 양쪽 다 틀렸다.
 */
function cleanUtm(value: unknown): string {
  return normalizeUtmKey(value);
}

/**
 * 봇 방문을 분모에서 뺀다. 어트리뷰션(captureUtm)은 클라이언트에서 봇을 제외하는데 방문 비콘은
 * 그 가드를 안 타서, 크롤러가 '직접 유입' 방문을 부풀리고 그 채널 등록률을 눌렀다.
 */
const BOT_UA = /bot|crawl|spider|slurp|googlebot|bingbot|facebookexternalhit|whatsapp|telegram|twitterbot|linkedinbot|headlesschrome/i;

/** KST 기준 일자 (그 날의 00:00 을 UTC 자정 마커로 저장 — 그룹핑 규약) */
function kstDate(now: Date): Date {
  const kst = new Date(now.getTime() + 9 * 60 * 60_000);
  return new Date(`${kst.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

export async function POST(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  // 무인증 비콘이 방문 퍼널·연결 배지를 갱신하므로 한도는 공유 스토어(Redis)로 강제해야 한다.
  // 인메모리는 서버리스 인스턴스마다 따로라 사실상 무제한이었다.
  const rl = await rateLimitAsync(`webinar-seen:${ip}`, { limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return new NextResponse(null, { status: 429, headers: CORS_HEADERS });

  const body = await request.json().catch(async () => {
    // sendBeacon Blob 이 text 로 오는 브라우저 대비
    const text = await request.text().catch(() => "");
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  });

  const origin = request.headers.get("origin") ?? request.headers.get("referer")?.split("/").slice(0, 3).join("/") ?? null;
  const now = new Date();

  const updated = await prisma.webinarEmbedSite.updateMany({
    where: { id: siteId, deletedAt: null },
    data: { lastSeenAt: now, ...(origin ? { lastSeenOrigin: origin.slice(0, 200) } : {}) },
  });
  if (updated.count === 0) return new NextResponse(null, { status: 204, headers: CORS_HEADERS });

  // 방문 집계는 webinar 컴포넌트가 실제로 렌더된 페이지에서만 (로더가 visit:true 전송).
  // 배너만 뜨는 일반 페이지의 연결 비콘(visit!==true, 대다수)은 lastSeenAt 만 갱신하고 종료 —
  // 아래 findUnique 를 그 경우 건너뛰어 비콘당 DB 왕복 1회를 아낀다(Hobby egress 절감).
  if (body?.visit === true && !BOT_UA.test(request.headers.get("user-agent") ?? "")) {
    const site = await prisma.webinarEmbedSite.findUnique({
      where: { id: siteId },
      select: { activeWebinarId: true },
    });
    if (site?.activeWebinarId) {
      const utmSource = cleanUtm(body?.utmSource);
      const utmMedium = cleanUtm(body?.utmMedium);
      await prisma.webinarVisitStat.upsert({
      where: {
        webinarId_date_utmSource_utmMedium: {
          webinarId: site.activeWebinarId,
          date: kstDate(now),
          utmSource,
          utmMedium,
        },
      },
      update: { visits: { increment: 1 } },
      create: {
        webinarId: site.activeWebinarId,
        date: kstDate(now),
        utmSource,
        utmMedium,
          visits: 1,
        },
      }).catch(() => {});
    }
  }

  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
