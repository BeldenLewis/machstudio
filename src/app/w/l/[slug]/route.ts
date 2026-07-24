/**
 * 랜딩 임베드 로더 — 외부 사이트(아임웹 등)에 1줄로 부착한다.
 *
 *   <script async src="https://machstudio.vercel.app/w/l/{slug}"></script>
 *
 * 응답 본문 = 런타임 번들 + `__msLanding.boot({ …데이터 스냅샷… })`.
 * 데이터를 스크립트에 실어 보내므로 **요청 1회로 최종 콘텐츠가 그려진다**
 * (iframe 방식은 별도 문서 로드 → 클라이언트 fetch → 렌더 → 높이 통보 순이라
 *  실측 10초 넘게 빈 화면이 보였다).
 *
 * 배포 경로가 /w/ 아래인 이유: src/proxy.ts 의 matcher 가 .js 를 제외하지 않아
 * public/ 에 두면 비로그인 방문자가 "/" 로 리다이렉트된다 → nosniff 로 실행 거부.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LANDING_RUNTIME_JS } from "@/generated/landing-runtime";

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

/**
 * <script> 안에 넣어도 안전한 JSON. `</script>` 브레이크아웃과 JS 문자열 리터럴을
 * 깨는 U+2028/2029 를 막는다.
 */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { ...CORS_HEADERS, "Access-Control-Max-Age": "86400" },
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

  let webinar: unknown = null;
  try {
    const row = await prisma.webinar.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        liveStartAt: true,
        theme: true,
        config: true,
        sessions: {
          orderBy: { number: "asc" },
          select: {
            id: true,
            number: true,
            type: true,
            title: true,
            speaker: true,
            speakerCompany: true,
            speakerPhotoUrl: true,
            description: true,
            speakerBio: true,
            startTime: true,
            endTime: true,
          },
        },
      },
    });
    if (row) {
      // config 는 랜딩이 실제로 쓰는 키만 — youtubeId 등 민감 키가 외부 사이트로 새지 않게.
      const rawConfig = (row.config ?? {}) as Record<string, unknown>;
      webinar = { ...row, config: { landingPage: rawConfig.landingPage } };
    }
  } catch {
    // DB 장애여도 스크립트는 내려간다. 런타임이 /info 로 한 번 더 시도하고,
    // 그래도 실패하면 스니펫의 폴백 링크가 그대로 남는다.
    webinar = null;
  }

  const body =
    `/* mach webinar landing — ${slug} */\n` +
    LANDING_RUNTIME_JS +
    `\n__msLanding.boot(${jsonForScript({ slug, origin, webinar })});\n`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      ...SCRIPT_HEADERS,
      // 브라우저는 **항상 재검증**한다(대개 304). stale-while-revalidate 를 브라우저에까지
      // 주면 랜딩을 고쳐도 방문자가 최대 하루 낡은 화면을 보게 된다 — 실제로 하니스에서 재현했다.
      "Cache-Control": "public, max-age=0, must-revalidate",
      // 엣지만 60초 캐시 + 최대 하루 stale 서빙 → DB 가 죽어도 콘텐츠가 보인다.
      "CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=86400",
    },
  });
}
