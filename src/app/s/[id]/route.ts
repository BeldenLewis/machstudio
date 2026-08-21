/**
 * Public collect script loader — GTM-style 1줄 설치.
 *
 *   <script async src="https://machstudio.app/s/SOURCE_ID"></script>
 *
 * - 인증 없음 (어차피 customer site에 노출되는 코드).
 * - 본문에는 source.apiKey가 포함됨 — 이 키는 form 제출 시점에 어차피 클라이언트로 내려가야 하므로
 *   inline 설치와 노출 수준이 동일하다.
 * - 삭제된 소스는 404, 비활성 소스는 200 + 경고 주석만 반환 (캐시 짧게).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildCollectScripts } from "@/lib/collect-script";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const;

const SCRIPT_HEADERS = {
  "Content-Type": "application/javascript; charset=utf-8",
  "X-Robots-Tag": "noindex",
  ...CORS_HEADERS,
} as const;

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...CORS_HEADERS,
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const source = await prisma.collectSource.findUnique({
    where: { id },
    include: { fieldMappings: { orderBy: { sortOrder: "asc" } } },
  });

  // 존재하지 않거나 삭제된 소스 → 404 (스크립트 본문 X)
  if (!source || source.deletedAt !== null) {
    return new NextResponse(
      "/* mach: collect source not found */\n",
      {
        status: 404,
        headers: {
          ...SCRIPT_HEADERS,
          "Cache-Control": "public, max-age=60",
        },
      },
    );
  }

  // 비활성 소스 → 빈 본문 + 경고 (캐시 짧게 — 재활성화 빠르게 반영)
  if (source.isActive === false) {
    const body = `/* mach: collect source is disabled */\n(function(){try{(window.console&&console.warn)&&console.warn("[mach] collect source is disabled");}catch(e){}})();\n`;
    return new NextResponse(body, {
      status: 200,
      headers: {
        ...SCRIPT_HEADERS,
        "Cache-Control": "public, max-age=60",
      },
    });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

  const { script, utmScript } = buildCollectScripts({
    source: {
      id: source.id,
      apiKey: source.apiKey,
      successTrigger: source.successTrigger,
      redirectUrl: source.redirectUrl,
      formPagePatterns: source.formPagePatterns,
      fieldGroupSelector: source.fieldGroupSelector,
    },
    fieldMappings: source.fieldMappings.map((f) => ({
      index: f.index,
      key: f.key,
      label: f.label,
      // 앵커는 대행전시 소스에만 있다 — null 이면 생성물에 실리지 않고 위치 경로를 탄다.
      matchBy: f.matchBy as "id" | "name" | null,
      matchValue: f.matchValue,
    })),
    baseUrl,
  });

  // utmScript + script 결합. 둘 다 자체 IIFE라 그대로 이어붙이면 된다.
  const body = `/* mach collect loader — source ${source.id} */\n${utmScript}\n;${script}\n`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      ...SCRIPT_HEADERS,
      "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=60",
    },
  });
}
