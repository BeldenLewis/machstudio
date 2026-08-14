/**
 * 대회 투표 임베드 로더.
 *
 *   <script async src="https://…/c/{competitionId}/vote"></script>
 *   <div data-mach-competition-vote></div>
 *
 * 공고 로더(/c/{id})와 달리 **설정 스냅샷을 싣지 않는다.** 참가작 목록·이미 찍은 표·남은 표는
 * 사람마다·순간마다 다르므로 런타임이 실행 시점에 /votes 로 가져온다. 스크립트 본문은
 * 대회마다 동일해서 엣지 캐시가 잘 듣는다.
 */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { COMPETITION_VOTE_RUNTIME_JS } from "@/generated/competition-vote-runtime";

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
  const round = url.searchParams.get("round") === "final" ? "final" : "prelim";

  // 존재 확인만 한다 — 없는 id 에 번들을 서빙하면 매번 다른 id 로 엣지 캐시를 우회할 수 있다.
  const competition = await prisma.competition.findUnique({ where: { id }, select: { id: true } });
  if (!competition) {
    return new NextResponse("/* mach competition vote: not found */\n", {
      status: 404,
      headers: { ...SCRIPT_HEADERS, "Cache-Control": "public, max-age=0, s-maxage=60" },
    });
  }

  const body =
    `/* mach competition vote */\n` +
    COMPETITION_VOTE_RUNTIME_JS +
    `\n__msCompetitionVote.boot(${jsonForScript({ competitionId: id, origin, round })});\n`;

  const etag = `W/"${createHash("sha256").update(body).digest("base64url").slice(0, 27)}"`;
  const cacheHeaders = {
    "Cache-Control": "public, max-age=0, must-revalidate",
    // 본문에 가변 상태가 없으므로 엣지에서 넉넉히 캐시해도 안전하다(목록은 런타임이 따로 가져온다).
    "CDN-Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
    ETag: etag,
  } as const;

  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ...SCRIPT_HEADERS, ...cacheHeaders } });
  }

  return new NextResponse(body, { status: 200, headers: { ...SCRIPT_HEADERS, ...cacheHeaders } });
}
