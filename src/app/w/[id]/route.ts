/**
 * Public webinar loader — 아임웹 등 외부 사이트에 1회 부착.
 *
 *   <script async src="https://machstudio.vercel.app/w/SITE_ID"></script>
 *
 * - 인증 없음 (외부 사이트에 노출되는 코드).
 * - 본문은 사이트 ID만 다를 뿐 정적 — 설정은 런타임에 /api/webinar-embed/{id}/config 로 가져오므로
 *   이 스크립트는 길게 캐시해도 된다.
 * - 삭제된 사이트는 404, 비활성 사이트는 200 + 경고 주석만 (캐시 짧게 — 재활성화 빠른 반영).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildWebinarLoaderScript } from "@/lib/webinar-loader-script";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const;

const SCRIPT_HEADERS = {
  "Content-Type": "application/javascript; charset=utf-8",
  "X-Content-Type-Options": "nosniff", // 크로스오리진 스크립트 — 콘텐츠 스니핑 차단
  "X-Robots-Tag": "noindex",
  ...CORS_HEADERS,
} as const;

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { ...CORS_HEADERS, "Access-Control-Max-Age": "86400" },
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const site = await prisma.webinarEmbedSite.findUnique({
    where: { id },
    select: { id: true, isActive: true, deletedAt: true },
  });

  if (!site || site.deletedAt !== null) {
    return new NextResponse("/* mach: webinar embed site not found */\n", {
      status: 404,
      headers: { ...SCRIPT_HEADERS, "Cache-Control": "public, max-age=60" },
    });
  }

  if (!site.isActive) {
    const body = `/* mach: webinar embed site is disabled */\n(function(){try{(window.console&&console.warn)&&console.warn("[mach] webinar embed site is disabled");}catch(e){}})();\n`;
    return new NextResponse(body, {
      status: 200,
      headers: { ...SCRIPT_HEADERS, "Cache-Control": "public, max-age=60" },
    });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const body = `/* mach webinar loader — site ${site.id} */\n${buildWebinarLoaderScript({ siteId: site.id, baseUrl })}\n`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      ...SCRIPT_HEADERS,
      "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=60",
    },
  });
}
