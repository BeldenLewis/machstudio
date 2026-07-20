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

function cleanUtm(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 100);
}

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
  if (body?.visit === true) {
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
