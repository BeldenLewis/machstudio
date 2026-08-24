/**
 * 대회 결과 발표 임베드 로더.
 *
 *   <script async src="https://…/c/{competitionId}/result"></script>
 *   <div data-mach-competition-result></div>
 *
 * 투표 로더와 마찬가지로 **결과 스냅샷을 싣지 않는다.** 발표 전에 스크립트만 열어도 명단이
 * 보이면 안 되고, 공개 버튼을 누른 뒤에는 새로고침만으로 바뀌어야 한다.
 */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { COMPETITION_RESULT_RUNTIME_JS } from "@/generated/competition-result-runtime";

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

function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { ...CORS_HEADERS, "Access-Control-Max-Age": "86400" } });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;
  const previewToken = url.searchParams.get("preview") ?? undefined;

  // 존재 확인만 한다 — 없는 id 에 번들을 서빙하면 매번 다른 id 로 엣지 캐시를 우회할 수 있다.
  const competition = await prisma.competition.findUnique({ where: { id }, select: { id: true } });
  if (!competition) {
    return new NextResponse("/* mach competition result: not found */\n", {
      status: 404,
      headers: { ...SCRIPT_HEADERS, "Cache-Control": "public, max-age=0, s-maxage=60" },
    });
  }

  const body =
    `/* mach competition result */\n` +
    COMPETITION_RESULT_RUNTIME_JS +
    `\n__msCompetitionResult.boot(${jsonForScript({ competitionId: id, origin, previewToken })});\n`;

  const etag = `W/"${createHash("sha256").update(body).digest("base64url").slice(0, 27)}"`;
  const cacheHeaders = {
    "Cache-Control": "public, max-age=0, must-revalidate",
    // 본문에 결과가 없으므로 엣지에서 넉넉히 캐시해도 안전하다(결과는 런타임이 따로 가져온다).
    // 미리보기 토큰이 붙은 요청은 운영자용이라 공유 캐시에 남기지 않는다.
    ...(previewToken
      ? { "CDN-Cache-Control": "private, no-store" }
      : { "CDN-Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" }),
    ETag: etag,
  } as const;

  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ...SCRIPT_HEADERS, ...cacheHeaders } });
  }

  return new NextResponse(body, { status: 200, headers: { ...SCRIPT_HEADERS, ...cacheHeaders } });
}
