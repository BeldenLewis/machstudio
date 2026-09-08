"use client";

import { use, useCallback, useEffect, useState } from "react";
import { LayoutGrid, Loader2, RefreshCw } from "lucide-react";
import ProjectSummaryCard from "@/app/(app)/dashboard/ProjectSummaryCard";
import type { RealtimeReportData } from "@/app/(app)/dashboard/RealtimeReport";

export default function SummarySharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<{ workspaceName: string; channelColors: Record<string, string> | null; projects: RealtimeReportData[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    const response = await fetch(`/api/public/summary-dashboard/${token}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error || "공유 대시보드를 불러오지 못했습니다."); else setData(payload);
    setLoading(false);
  }, [token]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  if (loading) return <main className="grid min-h-screen place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></main>;
  if (error || !data) return <main className="grid min-h-screen place-items-center p-6 text-center"><div><LayoutGrid className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" /><p className="text-sm text-muted-foreground">{error}</p></div></main>;
  return <main className="min-h-screen bg-background p-4 sm:p-6 lg:p-8"><div className="mx-auto max-w-[1500px] space-y-5"><header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs text-muted-foreground">{data.workspaceName}</p><h1 className="mt-1 text-2xl font-semibold">요약 대시보드</h1><p className="mt-1 text-xs text-muted-foreground">진행 중인 프로젝트 · 읽기 전용 공유 보기</p></div><button onClick={() => void load()} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-secondary px-3 text-xs font-medium shadow-sm"><RefreshCw className="h-3.5 w-3.5" />새로고침</button></header>{data.projects.length ? <div className="space-y-4">{data.projects.map((report, index) => <ProjectSummaryCard key={`${report.project.name}-${index}`} data={report} channelColors={data.channelColors} />)}</div> : <div className="grid h-64 place-items-center text-sm text-muted-foreground">진행 중인 프로젝트가 없습니다.</div>}</div></main>;
}
