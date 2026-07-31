import { createClient } from "@/lib/supabase/server";
import { redeemInvitationToken } from "@/app/api/invitations/redeem/route";
import { NextResponse } from "next/server";

// next 는 origin 기준 상대경로만 허용한다. 문자열을 이어붙이면(`${origin}${next}`)
// next="@evil.com" 같은 입력이 new URL(origin + next) 파싱 시 origin 을 userinfo 로,
// evil.com 을 host 로 만들어 외부 사이트로 리다이렉트한다(open redirect).
function resolveSafeNext(next: string | null, origin: string): string {
  if (!next) return "/dashboard";
  try {
    const target = new URL(next, origin);
    return target.origin === origin ? next : "/dashboard";
  } catch {
    return "/dashboard";
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const invite = searchParams.get("invite");
  // 워크스페이스가 없어도 대시보드로 — WorkspaceGate 가 안내를 그린다(강제 온보딩 없음).
  const next = resolveSafeNext(searchParams.get("next"), origin);

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);

    // 미가입자 초대(/signup?invite=<token>) — 이메일 확인이 켜져 있으면 signup 페이지가
    // 아니라 여기서 세션이 처음 생긴다. signup 페이지가 emailRedirectTo 에 토큰을 실어 보낸다.
    if (invite) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await redeemInvitationToken(user.id, user.email ?? "", invite);
      }
    }
  }

  return NextResponse.redirect(new URL(next, origin));
}
