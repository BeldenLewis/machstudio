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
    pathname.match(/^\/webinar\/[^/]+\/live/) ||
    pathname.startsWith("/api/public") ||
    pathname.startsWith("/api/shorten-url") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/share") ||
    pathname.startsWith("/s/") ||
    pathname.startsWith("/r/") ||
    pathname.startsWith("/api/cron")
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
