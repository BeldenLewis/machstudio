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

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWebinarStatus } from "@/lib/webinar-status";
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
  let notFound = false;
  try {
    const row = await prisma.webinar.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        liveStartAt: true,
        // 상태 판정에 필요 — 예전엔 이 3개가 select 에 없어서 랜딩 CTA 가 상태를 알 수 없었다.
        liveEndAt: true,
        signupDeadline: true,
        statusOverride: true,
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
            logoUrl: true,
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
      const landingRaw = rawConfig.landingPage;
      const landingEnabled =
        landingRaw && typeof landingRaw === "object" && !Array.isArray(landingRaw)
          ? (landingRaw as Record<string, unknown>).enabled === true
          : false;
      // 미공개 랜딩은 **서버에서** 콘텐츠를 뺀다. 예전엔 무조건 실어 보내고 브라우저 게이트에만
      // 의존해서, curl 로 미공개 히어로·연사 약력·FAQ 를 그대로 읽을 수 있었다.
      // 임베드에는 소유자 미리보기 개념이 없으므로 조건 없이 차단한다.
      const st = resolveWebinarStatus(row);
      const stateFields = { status: st.status, entryOpen: st.entryOpen, canRegister: st.canRegister };
      webinar = landingEnabled
        ? { ...row, ...stateFields, config: { landingPage: landingRaw } }
        : {
            // 렌더러가 "아직 공개되지 않은 페이지예요." 를 그릴 최소 정보만 남긴다.
            id: row.id,
            name: row.name,
            slug: row.slug,
            description: null,
            liveStartAt: row.liveStartAt,
            theme: row.theme,
            config: { landingPage: { enabled: false } },
            sessions: [],
            ...stateFields,
          };
    }
    else notFound = true; // 조회는 됐고 그런 웨비나가 없다
  } catch {
    // DB 장애여도 스크립트는 내려간다. 런타임이 /info 로 한 번 더 시도하고,
    // 그래도 실패하면 스니펫의 폴백 링크가 그대로 남는다.
    webinar = null;
  }

  // 없는 slug 에 런타임 번들(50KB)을 서빙하지 않는다 — 매번 다른 slug 로 엣지 캐시를 우회해
  // DB·대역폭을 때릴 수 있었다. 스니펫의 폴백 링크는 그대로 남으므로 진입 경로는 유지된다.
  if (notFound) {
    return new NextResponse('/* mach webinar landing: not found */\n', {
      status: 404,
      headers: { ...SCRIPT_HEADERS, "Cache-Control": "public, max-age=0, s-maxage=60" },
    });
  }

  // 주석에 slug 를 넣지 않는다 — slug 는 URL 세그먼트라 %2F 로 `*/` 를 만들어 주석을 닫고
  // 우리 오리진에서 서빙되는 스크립트 본문에 임의 JS 를 넣을 수 있었다(파트너 CSP allowlist 우회).
  // slug 는 jsonForScript 로만 내보낸다.
  const body =
    `/* mach webinar landing */\n` +
    LANDING_RUNTIME_JS +
    `\n__msLanding.boot(${jsonForScript({ slug, origin, webinar })});\n`;

  // ETag 필수 — 검증자가 없으면 브라우저가 재검증을 못 해 낡은 스크립트를 계속 실행한다
  // (실측: 새 탭에서도 transferSize 0 으로 캐시된 옛 번들이 돌아 수정이 반영되지 않았다).
  // 본문 해시라 런타임이 바뀌거나 데이터가 바뀌면 자동으로 무효화된다.
  const etag = `W/"${createHash("sha256").update(body).digest("base64url").slice(0, 27)}"`;
  const cacheHeaders = {
    "Cache-Control": "public, max-age=0, must-revalidate",
    // 엣지만 60초 캐시 + 최대 하루 stale 서빙 → DB 가 죽어도 콘텐츠가 보인다.
    "CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=86400",
    ETag: etag,
  } as const;

  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ...SCRIPT_HEADERS, ...cacheHeaders } });
  }

  return new NextResponse(body, {
    status: 200,
    headers: { ...SCRIPT_HEADERS, ...cacheHeaders },
  });
}
