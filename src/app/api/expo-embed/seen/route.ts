/**
 * "코드가 실제로 붙어 있다" 비콘.
 *
 * 운영자는 아임웹 편집기에 스니펫을 붙여 넣고 나서 **그게 붙었는지 알 수 없다.**
 * 이 엔드포인트가 갱신하는 `lastSeenAt` 하나로 어드민이 "확인됨" 배지를 보여 준다.
 *
 * ── 프리플라이트를 만들지 않는다 ──────────────────────────────────────
 * 런타임은 JSON 을 **평문 문자열**로 `sendBeacon(url, string)` 에 넘긴다 —
 * `text/plain` 이라 CORS 단순 요청이고 프리플라이트가 없다. 이 저장소는 여기서 실제
 * 장애를 겪었다: 수집 스크립트가 `Blob`(application/json)으로 보내 프리플라이트가
 * 필요해졌고, 그게 막혀 **콘솔을 열어야만 보이는 조용한 실패**가 됐다.
 * 그래서 여기서는 `request.json()` 을 쓰지 않는다 — 본문은 평문으로 온다.
 *
 * ── 무엇을 쓰는가 ─────────────────────────────────────────────────────
 * `lastSeenAt` 과 `lastSeenOrigin` **둘뿐**이다. `draftRevision` 은 건드리지 않는다 —
 * 그 번호는 편집기 자동저장의 비교-교환 값이라, 비콘이 올릴 때마다 운영자가 타이핑
 * 중인 저장이 충돌로 막힌다.
 *
 * `lastSeenAt` 의 뜻: **이 페이지에 속한 페이지·구획 스니펫이 관측됐다.** 페이지 통짜
 * 스니펫이 붙어 있다는 뜻이 아니다.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientIp, rateLimitAsync } from "@/lib/ratelimit";
import { isExpoPublicEmbedReleaseEnabled } from "@/lib/expo/capability";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

/** 비콘 응답은 절대 캐시되지 않는다 — 승인을 켠 뒤에 no-op 응답을 물려받지 않게. */
const HEADERS = { ...CORS_HEADERS, "Cache-Control": "private, no-store" } as const;

/** 본문 상한. 비콘 payload 는 200바이트가 안 된다 — 넘으면 우리가 보낸 것이 아니다. */
const MAX_BODY_BYTES = 2048;

/**
 * 크롤러가 "붙어 있음" 배지를 켜지 못하게 한다. 운영자가 안 붙였는데 배지가 켜지면
 * 그 배지가 거짓이 되고, 거짓 배지는 없는 배지보다 나쁘다.
 */
const BOT_UA = /bot|crawl|spider|slurp|googlebot|bingbot|facebookexternalhit|whatsapp|telegram|twitterbot|linkedinbot|headlesschrome/i;

export async function OPTIONS() {
  // 공개 승인이 꺼져 있어도 204 다 — 프리플라이트로 기능 존재를 알려 주지 않는다.
  return new NextResponse(null, { status: 204, headers: { ...CORS_HEADERS, "Access-Control-Max-Age": "86400" } });
}

const noop = () => new NextResponse(null, { status: 204, headers: HEADERS });

/** 서버가 본 값만 쓴다 — 본문이 보낸 주소는 믿지 않는다. */
function safeOrigin(request: Request): string | null {
  /**
   * `Origin: null` 은 브라우저가 불투명 출처(sandbox iframe·file://)에 보내는 값이다 —
   * 주소가 아니라 "출처를 밝히지 않았다" 는 뜻이므로 없는 것으로 다룬다.
   * 빈 문자열도 마찬가지다(`??` 는 그걸 못 걸러서 referer 폴백이 안 돌았다).
   */
  const originHeader = request.headers.get("origin");
  const refererHeader = request.headers.get("referer");
  const raw = (originHeader && originHeader !== "null" ? originHeader : null)
    ?? (refererHeader ? refererHeader.split("/").slice(0, 3).join("/") : null);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin.slice(0, 200);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  /**
   * 공개 승인이 꺼져 있으면 **Expo 델리게이트를 부르지 않고** 조용히 끝낸다.
   * 순수 문자열 비교라 DB 를 건드리지 않는다.
   */
  if (!isExpoPublicEmbedReleaseEnabled()) return noop();

  const rl = await rateLimitAsync(`expo-seen:${getClientIp(request)}`, { limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return new NextResponse(null, { status: 429, headers: HEADERS });

  if (BOT_UA.test(request.headers.get("user-agent") ?? "")) return noop();

  // 평문으로 **한 번만** 읽고 상한을 먼저 본다.
  let text = "";
  try {
    text = await request.text();
  } catch {
    return noop();
  }
  if (text.length === 0 || new TextEncoder().encode(text).length > MAX_BODY_BYTES) return noop();

  let body: { pageId?: unknown; sectionId?: unknown };
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return noop();
    body = parsed as { pageId?: unknown };
  } catch {
    return noop();
  }

  const pageId = typeof body.pageId === "string" ? body.pageId.slice(0, 64) : "";
  if (!pageId) return noop();

  const origin = safeOrigin(request);

  try {
    /**
     * **발행된**, 삭제되지 않은 페이지만 갱신한다. 발행 전 페이지가 관측됐다는 것은
     * 뜻이 없고(내보낼 것이 없다), 삭제된 페이지에 쓰면 복원 시 거짓 배지가 남는다.
     *
     * `publishedAt` 으로 판정한다 — 발행이 `published` 와 함께 항상 같이 세우는 값이고,
     * Json 컬럼의 null 비교보다 명확하다.
     */
    await prisma.expoPage.updateMany({
      where: {
        id: pageId,
        deletedAt: null,
        publishedAt: { not: null },
        site: { deletedAt: null },
      },
      // 여기 있는 두 필드가 전부다. draftRevision 은 절대 건드리지 않는다.
      data: { lastSeenAt: new Date(), ...(origin ? { lastSeenOrigin: origin } : {}) },
    });
  } catch (error) {
    // 비콘은 실패해도 방문자에게 아무 영향이 없다 — 다만 조용히 삼키지는 않는다.
    console.error("[expo-seen] 갱신 실패", error);
  }

  return noop();
}
