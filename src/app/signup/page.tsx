"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SignUpPage } from "@/components/ui/sign-up";
import { createClient } from "@/lib/supabase/client";
import { getAuthCallbackUrl } from "@/lib/app-url";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

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

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: getAuthCallbackUrl(),
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setIsLoading(false);
      return;
    }

    /* 워크스페이스 만들기를 강제하지 않는다 — 대부분은 팀에 초대받아 합류한다.
       워크스페이스가 없으면 WorkspaceGate 가 안내 화면을 그린다.
       이메일 확인이 켜져 있으면 이 시점에 세션이 없어서 proxy 가 로그인 화면으로 되돌린다. */
    router.push("/dashboard");
  };

  const handleGoogleSignUp = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: getAuthCallbackUrl() },
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
