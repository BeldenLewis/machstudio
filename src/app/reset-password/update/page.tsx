"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordUpdatePage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  // 이메일 링크로 들어와야 recovery 세션이 살아 있어야 함.
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setHasSession(!!data.session);
    });
    return () => { mounted = false; };
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (password !== confirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    setIsLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setIsLoading(false);
      return;
    }

    // 성공 시 로그인 페이지로 이동
    router.push("/?reset=success");
  };

  return (
    <div className="h-[100dvh] flex items-center justify-center bg-background">
      <div className="w-full max-w-md px-8">
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-4xl font-semibold tracking-tighter">새 비밀번호 설정</h1>
            <p className="mt-2 text-muted-foreground">
              새로 사용하실 비밀번호를 입력해주세요
            </p>
          </div>

          {hasSession === false && (
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-amber-600">
              <p className="font-medium">세션이 만료됐거나 잘못된 링크예요</p>
              <p className="mt-1 text-amber-600/80">
                이메일의 재설정 링크를 다시 클릭하거나, 재설정을 처음부터 진행해주세요.
              </p>
              <Link
                href="/reset-password"
                className="mt-3 inline-block text-amber-700 hover:underline font-medium"
              >
                재설정 다시 요청하기 →
              </Link>
            </div>
          )}

          {error && (
            <div className="rounded-2xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-500">
              {error}
            </div>
          )}

          {hasSession && (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="text-sm font-medium text-muted-foreground">새 비밀번호</label>
                <div data-focus-shell className="mt-1 rounded-2xl border border-border bg-foreground/5 backdrop-blur-sm transition-colors focus-within:bg-violet-500/10">
                  <input
                    type="password"
                    placeholder="8자 이상"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-transparent text-sm p-4 rounded-2xl focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground">비밀번호 확인</label>
                <div data-focus-shell className="mt-1 rounded-2xl border border-border bg-foreground/5 backdrop-blur-sm transition-colors focus-within:bg-violet-500/10">
                  <input
                    type="password"
                    placeholder="다시 입력"
                    required
                    minLength={8}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="w-full bg-transparent text-sm p-4 rounded-2xl focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !password || !confirm}
                className="w-full rounded-2xl bg-primary py-4 font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isLoading ? "변경 중..." : "비밀번호 변경"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
