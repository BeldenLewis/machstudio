"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getPublicAppOrigin } from "@/lib/app-url";

export default function ResetPasswordRequestPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    const origin = getPublicAppOrigin() || (typeof window !== "undefined" ? window.location.origin : "");
    const redirectTo = `${origin}/auth/callback?next=/reset-password/update`;

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo,
    });

    if (resetError) {
      setError(resetError.message);
      setIsLoading(false);
      return;
    }

    setSent(true);
    setIsLoading(false);
  };

  return (
    <div className="h-[100dvh] flex items-center justify-center bg-background">
      <div className="w-full max-w-md px-8">
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-4xl font-semibold tracking-tighter">비밀번호 재설정</h1>
            <p className="mt-2 text-muted-foreground">
              가입할 때 사용한 이메일을 입력하면 재설정 링크를 보내드려요
            </p>
          </div>

          {error && (
            <div className="rounded-2xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-500">
              {error}
            </div>
          )}

          {sent ? (
            <div className="space-y-4">
              <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-600">
                <p className="font-medium">메일을 보냈어요</p>
                <p className="mt-1 text-emerald-600/80">
                  {email}으로 재설정 링크를 보냈어요. 메일이 안 보이면 스팸함도 확인해주세요.
                </p>
              </div>
              <Link
                href="/"
                className="inline-flex w-full items-center justify-center rounded-2xl border border-border bg-foreground/5 backdrop-blur-sm py-4 font-medium hover:bg-foreground/10 transition-colors"
              >
                로그인 화면으로 돌아가기
              </Link>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="text-sm font-medium text-muted-foreground">이메일</label>
                <div data-focus-shell className="mt-1 rounded-2xl border border-border bg-foreground/5 backdrop-blur-sm transition-colors focus-within:bg-violet-500/10">
                  <input
                    type="email"
                    placeholder="you@example.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-transparent text-sm p-4 rounded-2xl focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !email.trim()}
                className="w-full rounded-2xl bg-primary py-4 font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isLoading ? "전송 중..." : "재설정 링크 보내기"}
              </button>

              <Link
                href="/"
                className="block text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                ← 로그인으로 돌아가기
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
