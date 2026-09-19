"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getAuthCallbackUrl } from "@/lib/app-url";
import { toast } from "sonner";
import { SignInPage } from "@/components/sign-in";

const testimonials = [
  {
    avatarSrc: "https://randomuser.me/api/portraits/women/57.jpg",
    name: "김지수",
    handle: "@jisu_digital",
    text: "팀 전체가 한 곳에서 UTM을 관리할 수 있어서 업무 효율이 정말 많이 올랐어요.",
  },
  {
    avatarSrc: "https://randomuser.me/api/portraits/men/64.jpg",
    name: "박민준",
    handle: "@minjun_mkt",
    text: "채널별 데이터를 하나의 대시보드에서 보니까 의사결정이 훨씬 빨라졌습니다.",
  },
  {
    avatarSrc: "https://randomuser.me/api/portraits/men/32.jpg",
    name: "이서연",
    handle: "@seoyeon_ads",
    text: "직관적이고 깔끔한 UI 덕분에 팀원들 모두 적응이 빨랐어요. 강력 추천합니다.",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(false);
  const nextPath = () => {
    const value = new URLSearchParams(window.location.search).get("next");
    return value?.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
  };

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error("이메일 또는 비밀번호를 확인해 주세요.");
      setIsLoading(false);
      return;
    }
    // Full page reload — 쿠키를 서버 컴포넌트와 동기화하기 위해 필요.
    // router.push로 soft navigation 하면 RSC가 새 쿠키를 못 읽고 / 로 다시 리다이렉트할 수 있음.
    window.location.href = nextPath();
  };

  const handleGoogleSignIn = async () => {
    const callback = new URL(getAuthCallbackUrl(), window.location.origin);
    callback.searchParams.set("next", nextPath());
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString() },
    });
  };

  return (
    <div className="bg-background text-foreground">
      <SignInPage
        title={<span className="font-semibold tracking-tighter">환영합니다</span>}
        description="계정에 로그인하고 팀과 함께 시작하세요"
        testimonials={testimonials}
        onSignIn={handleSignIn}
        onGoogleSignIn={handleGoogleSignIn}
        onResetPassword={() => router.push("/reset-password")}
        onCreateAccount={() => router.push("/signup")}
        isLoading={isLoading}
      />
    </div>
  );
}
