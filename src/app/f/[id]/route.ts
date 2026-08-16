/**
 * 등록 폼 임베드 로더 — 외부 사이트(아임웹 등)에 1줄로 부착한다 (설계 §17).
 *
 *   <script async src="https://machstudio.vercel.app/f/{SOURCE_ID}"></script>
 *   <div data-mach-form></div>
 *
 * 응답 본문 = 런타임 번들 + `__msForm.boot({ …formConfig 스냅샷… })`.
 * config 를 스크립트에 실어 보내므로 **요청 1회로 최종 폼이 그려진다** — fetch 방식은
 * 랜딩에서 실측 10초 넘게 빈 화면이었다.
 *
 * 배포 경로가 짧은 이유(/f/): 아임웹 편집기에 손으로 붙여 넣는 값이라 짧을수록 오타가 준다.
 * proxy.ts 공개 경로에 등록돼 있어야 비로그인 방문자에게 리다이렉트되지 않는다.
 */

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { FORM_RUNTIME_JS } from "@/generated/form-runtime";

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
 * 깨는 U+2028/2029 를 막는다. formConfig 는 운영자가 자유롭게 적는 텍스트를 담으므로
 * 이 처리가 없으면 안내 문구 한 줄로 파트너 페이지에 임의 스크립트가 들어간다.
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

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

  let source: { id: string; mode: string; isActive: boolean; formConfig: unknown } | null = null;
  try {
    source = await prisma.collectSource.findUnique({
      where: { id },
      select: { id: true, mode: true, isActive: true, formConfig: true },
    });
  } catch {
    // DB 가 흔들려도 파트너 페이지에 500 을 남기지 않는다 — 아래에서 404 로 떨어진다.
    source = null;
  }

  // 없는 소스·연동형은 404. 연동형에는 그릴 폼이 없고, 존재 여부를 알려 줄 이유도 없다.
  if (!source || source.mode !== "builder") {
    return new NextResponse(`/* mach form: not found */\n`, {
      status: 404,
      headers: { ...SCRIPT_HEADERS, "Cache-Control": "public, max-age=0, must-revalidate" },
    });
  }

  /**
   * 주석에 id 를 넣지 않는다 — id 는 URL 세그먼트라 `%2F` 로 "별표+슬래시" 를 만들어 주석을 닫고
   * 우리 오리진에서 서빙되는 스크립트 본문에 임의 JS 를 넣을 수 있다(랜딩 로더에서 실제로
   * 있었던 취약점, 파트너 CSP allowlist 우회).
   */
  const body =
    `/* mach registration form */\n` +
    FORM_RUNTIME_JS +
    `\n__msForm.boot(${jsonForScript({
      sourceId: source.id,
      origin,
      formConfig: source.formConfig,
      // 접수 창 판정의 기준 시각. 방문자 기기 시계를 믿지 않는다.
      serverNow: new Date().toISOString(),
      active: source.isActive,
    })});\n`;

  /**
   * ETag 필수 — 검증자가 없으면 브라우저가 재검증을 못 해 낡은 스크립트를 계속 실행한다
   * (랜딩에서 실측: 새 탭에서도 transferSize 0 으로 캐시된 옛 번들이 돌았다).
   */
  const etag = `W/"${createHash("sha256").update(body).digest("base64url").slice(0, 27)}"`;

  /**
   * 엣지는 60초만 캐시한다. **접수 상태가 캐시에 굳으면 안 된다**(설계 §17) — 오픈·마감
   * 경계에서 낡은 화면이 남는 것을 막는 장치가 두 겹이다: 짧은 s-maxage 와, 런타임이
   * serverNow 로 매번 다시 판정하는 것.
   */
  const cacheHeaders = {
    "Cache-Control": "public, max-age=0, must-revalidate",
    "CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=86400",
    ETag: etag,
  } as const;

  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ...SCRIPT_HEADERS, ...cacheHeaders } });
  }

  return new NextResponse(body, { status: 200, headers: { ...SCRIPT_HEADERS, ...cacheHeaders } });
}
