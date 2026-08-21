/**
 * 등록 폼·등록 확인 임베드 로더의 **공통 몸통** (설계 §17).
 *
 * `/f/{id}` 와 `/f/{id}/check` 가 같은 번들·같은 캐시 정책·같은 안전 처리를 쓴다.
 * 두 라우트에 각자 적으면 한쪽만 고쳐지고, 그 차이는 파트너 페이지에서 처음 드러난다.
 */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientIp, rateLimitAsync } from "@/lib/ratelimit";
import { normalizeCollectForm, resolveCollectFormConfigOrgTokens } from "@/lib/collect-form-config";
import { resolveOrgProfile, type WorkspaceLegalProfile } from "@/lib/legal-templates";
import { FORM_RUNTIME_JS } from "@/generated/form-runtime";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const;

export const SCRIPT_HEADERS = {
  "Content-Type": "application/javascript; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex",
  ...CORS_HEADERS,
} as const;

export function loaderOptions() {
  return new NextResponse(null, {
    status: 204,
    headers: { ...CORS_HEADERS, "Access-Control-Max-Age": "86400" },
  });
}

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

/** 두 로더가 공유하는 처리 — 한도 → 조회 → 번들 + boot 조립 → ETag/캐시. */
export async function serveFormRuntime(
  req: Request,
  id: string,
  view: "form" | "check",
): Promise<NextResponse> {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

  /**
   * 인증 없이 DB 를 여는 경로다 — 없는 id 를 난사하면 매 요청이 쿼리 한 번이 된다.
   * 이 저장소는 커넥션 풀 고갈로 실제 장애를 겪었으므로 **조회 전에** 한도를 건다.
   */
  const rl = await rateLimitAsync(`collect-loader:${getClientIp(req)}`, { limit: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return new NextResponse(`/* mach form: slow down */\n`, {
      status: 429,
      headers: { ...SCRIPT_HEADERS, "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString() },
    });
  }

  let source:
    | {
        id: string;
        mode: string;
        isActive: boolean;
        formConfig: unknown;
        deletedAt: Date | null;
        workspace: { legalProfile: unknown };
      }
    | null = null;
  try {
    source = await prisma.collectSource.findUnique({
      where: { id },
      select: {
        id: true, mode: true, isActive: true, formConfig: true, deletedAt: true,
        // 동의 전문에 남은 조직 토큰({{ORG_ADDRESS}} 등)을 풀 때 쓴다 — 관계로 딸려 오게 해
        // 이 로더가 이 저장소에서 가장 신경 쓰는 "쿼리 한 번" 을 유지한다.
        workspace: { select: { legalProfile: true } },
      },
    });
  } catch (e) {
    /**
     * DB 가 흔들려도 파트너 페이지에 500 을 남기지 않는다 — 아래에서 404 로 떨어진다.
     * 다만 **조용히 삼키지는 않는다.** 빈 catch 면 폼이 소리 없이 사라져도 로그에
     * 아무것도 안 남고, 운영자는 제보를 받고서야 안다.
     */
    console.error("[form-loader] 소스 조회 실패", { id, view, error: e });
    source = null;
  }

  // 없는 소스·연동형·삭제된 소스는 404. 존재 여부를 알려 줄 이유도 없다.
  if (!source || source.mode !== "builder" || source.deletedAt) {
    return new NextResponse(`/* mach form: not found */\n`, {
      status: 404,
      headers: {
        ...SCRIPT_HEADERS,
        "Cache-Control": "public, max-age=0, must-revalidate",
        // 404 도 엣지가 흡수해야 한다 — 없는 id 난사가 매번 DB 까지 내려가면 안 된다.
        "CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=60",
      },
    });
  }

  /**
   * 동의 전문에 남은 조직 토큰({{ORG_ADDRESS}} 등)을 여기서 푼다 — 방문자에게 나가기 직전이
   * 최신 워크스페이스 값을 반영할 마지막 지점이다. 정규화까지 여기서 미리 해 둬도
   * 클라이언트(form-entry.ts)가 다시 normalizeCollectForm 을 거는 게 멱등이라 안전하다.
   */
  let resolvedFormConfig: ReturnType<typeof normalizeCollectForm> | null = null;
  if (source.isActive) {
    const normalized = normalizeCollectForm(source.formConfig);
    const org = resolveOrgProfile(source.workspace.legalProfile as WorkspaceLegalProfile | null, normalized.legal.country);
    resolvedFormConfig = resolveCollectFormConfigOrgTokens(normalized, org);
  }

  /**
   * 주석에 id 를 넣지 않는다 — id 는 URL 세그먼트라 `%2F` 로 "별표+슬래시" 를 만들어
   * 주석을 닫고 우리 오리진에서 서빙되는 스크립트 본문에 임의 JS 를 넣을 수 있다
   * (랜딩 로더에서 실제로 있었던 취약점, 파트너 CSP allowlist 우회).
   */
  const body =
    `/* mach registration ${view} */\n` +
    FORM_RUNTIME_JS +
    `\n__msForm.boot(${jsonForScript({
      sourceId: source.id,
      origin,
      /**
       * **비활성 소스에는 formConfig 를 싣지 않는다**(§17 "비활성 → 경고 주석만").
       *
       * 런타임은 active:false 면 아무것도 그리지 않으므로 화면에는 차이가 없지만,
       * 그대로 실어 보내면 아직 공개 전인 폼의 문항 라벨·선택지·안내 문구·행사 개요가
       * 인증 없이 통째로 읽힌다. 눈에 안 띄는 노출이 제일 늦게 발견된다.
       */
      formConfig: resolvedFormConfig,
      // 접수 창 판정의 기준 시각. 방문자 기기 시계를 믿지 않는다.
      serverNow: new Date().toISOString(),
      active: source.isActive,
      view,
    })});\n`;

  /**
   * ETag 필수 — 검증자가 없으면 브라우저가 재검증을 못 해 낡은 스크립트를 계속 실행한다
   * (랜딩에서 실측: 새 탭에서도 transferSize 0 으로 캐시된 옛 번들이 돌았다).
   */
  const etag = `W/"${createHash("sha256").update(body).digest("base64url").slice(0, 27)}"`;

  /**
   * SWR 을 짧게 잡는다. 이 응답에는 **serverNow 가 구워져 있어서** stale 응답이 오래
   * 서빙되면 접수 창 판정이 그만큼 과거에 머문다 — 오픈했는데 "아직 안 열렸어요" 가
   * 나가는 실패다. 런타임에도 상한 가드가 있지만, 애초에 오래된 응답을 내보내지 않는 것이 먼저다.
   */
  const cacheHeaders = {
    "Cache-Control": "public, max-age=0, must-revalidate",
    "CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=60",
    ETag: etag,
  } as const;

  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ...SCRIPT_HEADERS, ...cacheHeaders } });
  }

  return new NextResponse(body, { status: 200, headers: { ...SCRIPT_HEADERS, ...cacheHeaders } });
}
