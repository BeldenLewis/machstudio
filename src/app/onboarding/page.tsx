"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const workspaceName = formData.get("workspaceName") as string;

    // 인증은 서버에서 Supabase 세션으로 검증 — 클라이언트 userId 전송 불필요.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/");
      return;
    }

    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceName }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "오류가 발생했습니다.");
      setIsLoading(false);
      return;
    }

    router.push("/dashboard");
  };

  return (
    <div className="h-[100dvh] flex items-center justify-center bg-background">
      <div className="w-full max-w-md px-8">
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-4xl font-semibold tracking-tighter">워크스페이스 만들기</h1>
            <p className="mt-2 text-muted-foreground">팀 이름을 입력해주세요</p>
          </div>

          {error && (
            <div className="rounded-2xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-500">
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="text-sm font-medium text-muted-foreground">워크스페이스 이름</label>
              <div data-focus-shell className="mt-1 rounded-2xl border border-border bg-foreground/5 backdrop-blur-sm transition-colors focus-within:bg-violet-500/10">
                <input
                  name="workspaceName"
                  type="text"
                  placeholder="디지털마케팅팀"
                  required
                  className="w-full bg-transparent text-sm p-4 rounded-2xl focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-2xl bg-primary py-4 font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isLoading ? "생성 중..." : "시작하기"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
