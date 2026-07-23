/**
 * 랜딩 임베드 로더 — 아임웹 등 외부 사이트에 1회 부착(슬러그 기준, 사이트 연결 불필요).
 *
 *   <script async src="https://machstudio.vercel.app/webinar/SLUG/embed"></script>
 *
 * - 인증 없음(외부 노출 코드). slug 만 다를 뿐 본문은 정적 — 상태는 런타임에 /api/webinar/{slug}/info 로 가져온다.
 * - 자동높이 iframe(랜딩) + 상태연동 하단 배너를 호스트 페이지에 주입한다.
 * - 없는 웨비나는 404 주석. (기존 /w/{siteId} 로더·마운트 마커 방식은 그대로 유지)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildLandingLoaderScript } from "@/lib/webinar-landing-loader";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const;

const SCRIPT_HEADERS = {
  "Content-Type": "application/javascript; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex",
  ...CORS_HEADERS,
} as const;

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { ...CORS_HEADERS, "Access-Control-Max-Age": "86400" },
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const webinar = await prisma.webinar.findUnique({ where: { slug }, select: { id: true } });
  if (!webinar) {
    return new NextResponse("/* mach: webinar not found */\n", {
      status: 404,
      headers: { ...SCRIPT_HEADERS, "Cache-Control": "public, max-age=60" },
    });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const body = `/* mach webinar landing loader — ${slug} */\n${buildLandingLoaderScript(baseUrl, slug)}\n`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      ...SCRIPT_HEADERS,
      "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=60",
    },
  });
}
