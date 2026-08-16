/**
 * 등록 폼 임베드 하니스 — **개발 환경 전용**(프로덕션 404).
 *
 * 아임웹처럼 **외부 문서에 스니펫 한 줄만 붙인 상태**에서 실제 `/f/{id}` 스크립트를 태워
 * boot → 마운트 → 입력 → 제출까지 도는지 본다. 어드민 화면(로그인 벽 뒤)이나 React 미리보기
 * 로는 확인할 수 없는 것들이 여기서만 드러난다:
 *  · 스크립트 본문에 실려 온 config 로 **요청 1회에** 폼이 그려지는가
 *  · 호스트 CSS 를 물려받아 폼이 망가지지 않는가(`.msf { all:initial }` 가 듣는가)
 *  · 마운트 `<div>` 를 빠뜨렸을 때 스크립트 자리에 자동으로 붙는가
 *  · 아임웹 위젯 애니메이션(visibility:hidden)에 먹히지 않는가
 *
 * page.tsx 가 아니라 route.ts 인 이유: React 는 컴포넌트가 렌더한 script 태그를 실행하지
 * 않는다. 임베드는 script 태그로 붙는 물건이라 생 HTML 이 실제 부착 환경에 더 가깝다
 * (랜딩 임베드 하니스와 같은 이유·같은 구조).
 */
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const url = new URL(request.url);
  // 실제 빌더형 소스 id 가 필요하다 — /f/{id} 가 서버에서 formConfig 를 구워 보내기 때문.
  const id = (url.searchParams.get("id") ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
  // ?nomount=1 — 마운트 div 를 일부러 빼서 "스크립트 자리 자동 마운트" 폴백을 확인한다.
  const noMount = url.searchParams.get("nomount") === "1";

  const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>등록 폼 임베드 하니스</title>
<style>
  body { margin:0; background:#f2f4f7; color:#111; font:400 14px/1.6 -apple-system,sans-serif }
  header { padding:16px 20px; background:#fff; border-bottom:1px solid #e3e7ec }
  h1 { margin:0; font-size:14px }
  .note { margin:4px 0 0; font-size:11px; color:#6b7480 }
  main { padding:24px 20px 80px }

  /* ── 호스트 CSS 오염 재현 ─────────────────────────────────────────
     아임웹 테마가 실제로 거는 종류의 전역 규칙이다. 우리 폼이 .msf 안에서
     이걸 전부 되돌리지 못하면 여기서 바로 눈에 띈다. */
  input, select, button, label { font-family:"Comic Sans MS",cursive; border-radius:0 !important; }
  input, select { border:3px dashed #f00; background:#ffe; }
  button { background:#0f0; color:#000; text-transform:uppercase; letter-spacing:3px }
  label { display:block; color:#f0f; font-size:9px }
  div { line-height:3 }
</style>
</head><body>
<header>
  <h1>등록 폼 임베드 하니스</h1>
  <p class="note">
    호스트 페이지가 <b>일부러 험한 CSS</b>를 겁니다 — 폼이 멀쩡하면 <code>.msf</code> 격리가 듣는 것입니다.
    ${id ? `소스: <code>${id}</code>` : `<b>?id=SOURCE_ID</b> 를 붙여 주세요(빌더형 소스).`}
    ${noMount ? " · 마운트 div 없음(자동 마운트 확인)" : ""}
  </p>
</header>
<main>
  <!-- 아임웹 위젯 래퍼를 흉내낸다 — unhideWidget 경로도 함께 태운다 -->
  <div class="_widget_data wg_animated" style="visibility:hidden;opacity:0">
    ${noMount ? "" : `<div data-mach-form></div>`}
    ${id ? `<script async src="/f/${id}"></script>` : ""}
  </div>
</main>
</body></html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
