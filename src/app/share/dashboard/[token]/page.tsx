"use client";

import { useCallback, useEffect, useState, use } from "react";
import { Activity, Loader2, Lock } from "lucide-react";
import RealtimeReport, { type RealtimeReportData } from "@/app/(app)/dashboard/RealtimeReport";

interface PublicProject {
  name: string;
  workspaceName: string;
}

export default function DashboardSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [project, setProject] = useState<PublicProject | null>(null);
  const [report, setReport] = useState<RealtimeReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/public/realtime-dashboard/${token}`);
      if (res.status === 401) {
        const data = await res.json().catch(() => ({}));
        if (data?.requiresPassword) {
          setRequiresPassword(true);
          return;
        }
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "공유된 대시보드를 찾을 수 없어요");
        return;
      }
      setRequiresPassword(false);
      setProject(data.project);

      const password = sessionStorage.getItem(`share_password_dashboard_${token}`) ?? undefined;
      const dataRes = await fetch("/api/public/realtime-dashboard-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const dataPayload = await dataRes.json().catch(() => ({}));
      if (!dataRes.ok) {
        setError(dataPayload.error ?? "데이터를 불러올 수 없어요");
        return;
      }
      setReport(dataPayload as RealtimeReportData);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const submitPassword = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput) return;
    setVerifying(true);
    setPasswordError(null);
    try {
      const res = await fetch(`/api/public/realtime-dashboard/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPasswordError(data.error ?? "비밀번호가 일치하지 않아요");
        return;
      }
      sessionStorage.setItem(`share_password_dashboard_${token}`, passwordInput);
      await loadAll();
    } finally {
      setVerifying(false);
    }
  }, [passwordInput, token, loadAll]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (requiresPassword) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-sm font-medium">비밀번호로 보호된 공유 페이지</h1>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">접근하려면 공유 받은 비밀번호를 입력해주세요.</p>
          <form onSubmit={submitPassword} className="space-y-3">
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="비밀번호"
              autoFocus
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-violet-400"
            />
            {passwordError && <p className="text-xs text-rose-500">{passwordError}</p>}
            <button
              type="submit"
              disabled={!passwordInput || verifying}
              className="w-full rounded-xl bg-violet-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-600 disabled:opacity-50"
            >
              {verifying ? "확인 중…" : "확인"}
            </button>
          </form>
        </div>
      </div>
    );
  }
  if (error || !project || !report) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <Activity className="w-12 h-12 text-muted-foreground/20 mb-3" />
        <p className="text-sm text-muted-foreground">{error ?? "데이터가 없어요"}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{project.workspaceName}</p>
            <h1 className="text-2xl font-semibold mt-1">{project.name} · 공유된 대시보드</h1>
            <p className="text-xs text-muted-foreground mt-1">최근 30일 요약 · 읽기 전용</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-3 py-1 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3" /> 읽기 전용
          </span>
        </header>

        <RealtimeReport data={report} loading={false} rangeLabel="최근 30일" />
      </div>
    </div>
  );
}
