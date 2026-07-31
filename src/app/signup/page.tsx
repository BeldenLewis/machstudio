"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SignUpPage } from "@/components/ui/sign-up";
import { createClient } from "@/lib/supabase/client";
import { getAuthCallbackUrl } from "@/lib/app-url";

// useSearchParams 는 Suspense 경계가 필요 — 본문을 감싼다.
export default function SignupPage() {
  return (
    <Suspense fallback={<div className="bg-background text-foreground min-h-screen" />}>
      <SignupPageContent />
    </Suspense>
  );
}

function SignupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // 미가입자 초대(워크스페이스 설정 → 멤버 초대)로 들어온 링크 — /signup?invite=<token>.
  // 이메일 확인이 켜져 있으면 여기서 세션이 안 생기므로 auth/callback 까지 실어 보내야 한다.
  const inviteToken = searchParams.get("invite");
  const authRedirectUrl = inviteToken
    ? `${getAuthCallbackUrl()}?invite=${encodeURIComponent(inviteToken)}`
    : getAuthCallbackUrl();

  const redeemInvite = async (token: string) => {
    try {
      const res = await fetch("/api/invitations/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      // 성공하면 그 워크스페이스를 활성으로 — WorkspaceProvider 가 다음 로드에서 읽는다.
      if (res.ok && data.workspaceId) {
        localStorage.setItem("currentWorkspaceId", data.workspaceId);
        localStorage.removeItem("currentProjectId");
      }
    } catch {
      // 실패해도 로그인은 막지 않는다 — 워크스페이스 없으면 WorkspaceGate 가 안내한다.
    }
  };

  const handleSignUp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (password !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      setIsLoading(false);
      return;
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: authRedirectUrl,
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setIsLoading(false);
      return;
    }

    /* 워크스페이스 만들기를 강제하지 않는다 — 대부분은 팀에 초대받아 합류한다.
       워크스페이스가 없으면 WorkspaceGate 가 안내 화면을 그린다.
       이메일 확인이 켜져 있으면 이 시점에 세션이 없어서 proxy 가 로그인 화면으로 되돌린다 —
       그 경우 redeem 은 여기서 하지 않고 auth/callback 이 처리한다(위 authRedirectUrl 참고). */
    if (inviteToken && signUpData.session) {
      await redeemInvite(inviteToken);
    }
    router.push("/dashboard");
  };

  const handleGoogleSignUp = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: authRedirectUrl },
    });
  };

  return (
    <div className="bg-background text-foreground">
      <SignUpPage
        onSignUp={handleSignUp}
        onGoogleSignUp={handleGoogleSignUp}
        onSignIn={() => router.push("/")}
        isLoading={isLoading}
        error={error}
      />
    </div>
  );
}
