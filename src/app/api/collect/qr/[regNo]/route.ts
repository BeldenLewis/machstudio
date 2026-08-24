/**
 * 등록 QR 이미지 (설계 §9.2).
 *
 *   GET /api/collect/qr/{registrationNo}  →  image/png
 *
 * 완료 화면·티켓 페이지의 `<img src>` 가 여기를 가리킨다. 이미지를 서버에서 만드는 이유는
 * §9.2 의 규칙(EC Q, 여백 4모듈, 불투명 흰 배경, 순수 흑백)을 **한 곳에서만** 지키기
 * 위해서다 — 클라이언트에서 각자 그리면 자리마다 옵션이 갈리고, 그 차이는 현장에서
 * 스캐너가 안 읽힐 때 처음 드러난다.
 *
 * ── 왜 DB 를 보지 않는가 ───────────────────────────────────────────────
 * QR 은 **번호를 그림으로 바꾼 것뿐**이다. 존재 여부를 확인하면 이 라우트가 곧 등록번호
 * 열거 오라클이 된다(있으면 200, 없으면 404). 형식·체크digit 만 보고 그린다 — 없는 번호로
 * 만든 QR 은 현장 스캐너가 "등록 없음" 으로 거르므로 아무 힘이 없다.
 */
import { NextResponse } from "next/server";
import { getClientIp, rateLimitAsync } from "@/lib/ratelimit";
import { isValidRegistrationNo } from "@/lib/collect-registration-no";
import { qrPngBuffer } from "@/lib/collect-qr";

export async function GET(request: Request, { params }: { params: Promise<{ regNo: string }> }) {
  const { regNo } = await params;
  // `.png` 를 붙여 부르는 곳(이메일 클라이언트 일부가 확장자를 요구한다)도 받아 준다.
  const value = regNo.replace(/\.png$/i, "");

  /**
   * 체크digit 이 안 맞으면 그리지 않는다. 이미지 생성은 CPU 를 쓰므로, 아무 문자열이나
   * 그려 주면 그게 곧 값싼 증폭 경로다.
   */
  if (!isValidRegistrationNo(value)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  /**
   * (IP, 번호)로 센다 — IP 만 쓰면 전시장 와이파이 뒤 수백 명이 한 버킷을 나눠 쓰게 되어
   * 입장 줄에서 QR 이 안 뜬다(티켓 페이지와 같은 이유·같은 규칙).
   */
  const rl = await rateLimitAsync(`collect-qr:${getClientIp(request)}:${value}`, { limit: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: { "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString() },
    });
  }

  const png = await qrPngBuffer(value);
  const download = new URL(request.url).searchParams.get("download") === "1";

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
      /**
       * 번호가 같으면 그림도 항상 같다 — 오래 캐시해도 안전하고, 그래야 티켓 화면을
       * 여러 번 열어도 매번 다시 그리지 않는다. `private` 인 이유: 공유 CDN 에 남의
       * 티켓 이미지가 쌓일 이유가 없다.
       */
      "Cache-Control": "private, max-age=86400, immutable",
      "Access-Control-Allow-Origin": "*",
      ...(download ? { "Content-Disposition": `attachment; filename="ticket-${value}.png"` } : {}),
    },
  });
}
