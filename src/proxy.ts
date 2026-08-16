import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // OAuth 콜백과 공개/토큰 기반 엔드포인트는 세션 확인 전 통과.
  // 공개 경로에서 Supabase Auth 호출을 먼저 하면 헬스체크와 수집 스크립트도 인증 상태에 영향받을 수 있다.
  if (
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/api/collect") ||
    pathname.startsWith("/api/webinar/") ||
    pathname.startsWith("/api/webinar-embed/") || // 임베드 공개 설정/비콘 (webinar-embed-sites 어드민 CRUD는 제외)
    pathname.startsWith("/w/") || // 웨비나 로더 (외부 사이트 부착)
    pathname === "/webinar/sample" ||
    pathname === "/live-preview" || // 라이브 페이지 상태별 디자인 프리뷰(목업 데이터, 공개)
    pathname.match(/^\/webinar\/[^/]+\/live/) ||
    pathname.match(/^\/webinar\/[^/]+\/survey\//) || // 시청자 설문 응답 페이지(공개 — 종료화면·응답링크로 진입)
    pathname.match(/^\/webinar\/[^/]+\/landing/) || // 랜딩 상세페이지(공개 — 외부 사이트 iframe 임베드)
    pathname.startsWith("/api/public") ||
    pathname.startsWith("/api/shorten-url") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/share") ||
    pathname.startsWith("/s/") ||
    pathname.startsWith("/r/") ||
    // 빌더형 등록 폼 미리보기(/p/{previewToken}) — 검토자는 워크스페이스 멤버가 아니다.
    // 권한은 추측 불가능한 토큰이 대신하고, 페이지 자체가 조회 외의 부작용을 갖지 않는다.
    pathname.startsWith("/p/") ||
    pathname.startsWith("/api/cron") ||
    // 개발 전용 하니스(/dev/*) — 로그인 뒤에 있는 컴포넌트를 격리해 검증할 때 쓴다.
    // 프로덕션에서는 이 조건이 false 이고, 각 페이지도 notFound() 로 한 번 더 막는다.
    (process.env.NODE_ENV !== "production" && pathname.startsWith("/dev/"))
  ) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const publicPages = ["/", "/signup", "/reset-password"];
  const isPublicPage = publicPages.includes(pathname);

  // 비로그인 상태에서 보호된 페이지 접근 → 로그인으로
  if (!user && !isPublicPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // 로그인 상태에서 로그인/회원가입 페이지 접근 → 대시보드로
  if (user && (pathname === "/" || pathname === "/signup")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return supabaseResponse;
}

export const config = {
  /**
   * monitoring: Sentry 터널 경로(next.config 의 tunnelRoute)를 반드시 제외해야 한다.
   * 여기 걸리면 비로그인 방문자의 POST 가 "/" 로 307 되고, 따라간 "/" 는 POST 를 안 받아 405 →
   * **브라우저 에러 리포트가 전부 유실된다**(실측: POST /monitoring → 307 → / → 405).
   * 시청자·랜딩 방문자는 전부 비로그인이라, 정작 봐야 할 공개 페이지 에러만 통째로 사라진다.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|monitoring|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
