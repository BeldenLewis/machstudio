/**
 * 랜딩 임베드 하니스 — **개발 환경 전용**(프로덕션 404).
 *
 * `/dev/landing-harness` 는 랜딩 **뷰**를 React 로 그려 보는 곳이다. 이 하니스는 다른 걸 본다:
 * 아임웹처럼 **외부 문서에 스니펫만 붙인 상태**에서 실제 `/w/l/{slug}` 스크립트를 태워
 * boot → 렌더 → **방문 비콘**까지 도는지 확인한다.
 *
 * 왜 필요한가(실측 사고): 등록 262건이 전부 아임웹 랜딩 `k-expo.org/webinar` 에서 일어나는데
 * 그 페이지의 방문 집계가 **0** 이었다. 랜딩 임베드는 `data-ms-landing-mount` 를 쓰는데
 * 로더의 seen 비콘은 `data-mach-webinar-mount` 만 찾아서 `visit:false` 로 보냈기 때문이다.
 * 이제 랜딩 임베드가 직접 방문 비콘을 보내는데, 그 배선은 이 경로로만 확인할 수 있다.
 *
 * page.tsx 가 아니라 route.ts 인 이유: React 는 컴포넌트가 렌더한 script 태그를 실행하지
 * 않는다. 랜딩 임베드는 script 태그로 붙는 물건이라 생 HTML 이 실제 부착 환경에 더 가깝다.
 * (임베드 로더 하니스 `/dev/embed-harness` 와 같은 이유·같은 구조)
 *
 * **로컬에서 비콘이 다른 포트로 나가는 건 정상이다.** `/w/l/{slug}` 는 스크립트에
 * `NEXT_PUBLIC_APP_URL` 을 origin 으로 구워 보낸다(프로덕션에서 Vercel 프리뷰 URL 이 박히지
 * 않게 하려는 의도). dev 서버가 autoPort 로 3001 에 뜨면 .env.local 의 3000 과 어긋나
 * 비콘이 `localhost:3000` 으로 간다 — 여기서 볼 것은 **경로와 호출 여부**이고, 도메인이
 * 맞는지는 프로덕션 스크립트의 boot({origin}) 로 따로 확인한다.
 */
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const url = new URL(request.url);
  // 실제 웨비나 슬러그가 필요하다 — /w/l/{slug} 가 서버에서 스냅샷을 구워 보내기 때문.
  const slug = (url.searchParams.get("slug") ?? "p4-676125").replace(/[^a-zA-Z0-9_-]/g, "");
  const origin = url.origin;
  /* 광고 유입은 **하니스 URL 에 utm_* 를 직접 붙여** 재현한다 — 비콘이 window.location.search
     에서 채널을 읽으므로, 그게 실제 광고 랜딩과 완전히 같은 조건이다.
     예: /dev/landing-embed-harness?slug=x&utm_source=meta&utm_medium=da */
  const channel = `${url.searchParams.get("utm_source") ?? "(없음)"} / ${url.searchParams.get("utm_medium") ?? "(없음)"}`;

  const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>랜딩 임베드 하니스</title>
<style>
  :root { color-scheme: dark }
  body { margin:0; background:#0b0d12; color:#e7ecf5; font:400 14px/1.6 Pretendard,-apple-system,sans-serif }
  header { padding:16px 20px; border-bottom:1px solid #1e2430 }
  h1 { margin:0; font-size:14px }
  .note { margin:4px 0 0; font-size:11px; color:#8b96a8 }
  .note a { color:#a78bfa }
  /* 아임웹 위젯 래퍼를 흉내낸다 — unhideWidget 경로도 함께 태운다 */
  ._widget_data { display:block }
</style>
</head><body>
<header>
  <h1>랜딩 임베드 하니스</h1>
  <p class="note">
    개발 전용. 실제 <code>/w/l/${slug}</code> 스크립트 + 실제 스니펫.
    지금 채널: <b>${channel}</b> — URL 의 utm_* 가 방문 비콘 채널이 됩니다.
    <a href="?slug=${slug}&utm_source=kakao&utm_medium=content">kakao 로 바꿔 보기</a>
  </p>
  <p class="note">
    확인할 것: 콘솔 오류 없음 · 랜딩이 그려짐 · <code>POST /api/webinar/${slug}/visit</code> 1회(세션당).
    비콘 도메인이 이 페이지와 달라도 정상 — NEXT_PUBLIC_APP_URL 이 구워지기 때문입니다.
  </p>
</header>

<div class="_widget_data">
  <div id="ms-landing-${slug}" data-ms-landing-mount data-ms-slug="${slug}"
       style="display:block;min-height:100svh;background:#0b0d12">
    <a href="${origin}/webinar/${slug}/landing"
       style="display:block;padding:96px 20px;color:#abb5c7;text-align:center;text-decoration:none;font:600 15px/1.7 Pretendard,-apple-system,sans-serif">
      사전 등록 페이지 열기 →
    </a>
  </div>
</div>
<script async src="${origin}/w/l/${slug}"></script>
</body></html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
