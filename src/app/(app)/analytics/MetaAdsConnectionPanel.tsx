"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, ChevronUp, Loader2, RefreshCw, Unplug, Waves } from "lucide-react";
import { toast } from "sonner";

type Metric = { key: string; label: string; defaultOn: boolean };
type Account = { id: string; name: string; currency?: string; timezone_name?: string };
type Connection = { status: string; adAccountId: string | null; adAccountName: string | null; enabledMetrics: unknown; lastSyncedAt: string | null; lastSyncError: string | null };

export function MetaAdsConnectionPanel({ workspaceId, projectId, onSynced, onMetricsChanged }: { workspaceId: string; projectId: string; onSynced(): void; onMetricsChanged(metrics: string[]): void }) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [enabled, setEnabled] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [canEdit, setCanEdit] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ workspaceId, projectId });
    const res = await fetch(`/api/meta-ads/connection?${params}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setConnection(data.connection ?? null); setAccounts(data.accounts ?? []); setMetrics(data.metrics ?? []); setCanEdit(data.canEdit === true);
      const nextMetrics = Array.isArray(data.connection?.enabledMetrics) ? data.connection.enabledMetrics : [];
      setEnabled(nextMetrics); onMetricsChanged(nextMetrics);
    }
    setLoading(false);
  }, [workspaceId, projectId, onMetricsChanged]);
  useEffect(() => { void load(); }, [load]);

  const save = async (patch: { adAccountId?: string; enabledMetrics?: string[] }) => {
    setSaving(true);
    const params = new URLSearchParams({ workspaceId, projectId });
    const res = await fetch(`/api/meta-ads/connection?${params}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const data = await res.json().catch(() => ({})); setSaving(false);
    if (!res.ok) return toast.error(data.error || "Meta 설정을 저장하지 못했어요.");
    toast.success("Meta 설정을 저장했어요."); void load();
  };
  const sync = async () => {
    setSyncing(true);
    const res = await fetch("/api/meta-ads/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, projectId }) });
    const data = await res.json().catch(() => ({})); setSyncing(false);
    if (!res.ok) return toast.error(data.error || "Meta 데이터를 동기화하지 못했어요.");
    toast.success(`Meta 광고 성과 ${Number(data.rowCount || 0).toLocaleString()}건을 동기화했어요.`); await load(); onSynced();
  };

  if (loading) return <div className="flex h-20 items-center justify-center rounded-2xl bg-secondary/30"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  if (!connection) return (
    <section className="flex flex-col gap-4 rounded-2xl bg-gradient-to-r from-blue-600/10 via-background to-violet-500/10 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3"><div className="rounded-xl bg-blue-600 p-2.5 text-white shadow-md shadow-blue-600/20"><Waves className="h-5 w-5" /></div><div><h2 className="text-sm font-semibold">Meta Ads 데이터 연결</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">광고 계정을 연결하면 캠페인·광고세트·소재별 Insights를 이 대시보드로 가져옵니다.</p></div></div>
      <a href={`/api/meta-ads/connect?${new URLSearchParams({ workspaceId, projectId })}`} className="inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Meta 연결</a>
    </section>
  );

  return <section className="overflow-hidden rounded-2xl bg-background shadow-sm ring-1 ring-black/5 dark:ring-white/10">
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3"><div className={`grid h-9 w-9 place-items-center rounded-xl ${connection.status === "CONNECTED" ? "bg-emerald-500/12 text-emerald-600" : "bg-amber-500/12 text-amber-600"}`}>{connection.status === "CONNECTED" ? <Check className="h-4 w-4" /> : <Unplug className="h-4 w-4" />}</div><div className="min-w-0"><div className="flex items-center gap-2"><h2 className="text-sm font-semibold">Meta Ads</h2><span className="truncate text-xs text-muted-foreground">{connection.adAccountName || "광고 계정 선택 필요"}</span></div><p className="mt-0.5 text-[11px] text-muted-foreground">{connection.lastSyncedAt ? `마지막 동기화 ${new Date(connection.lastSyncedAt).toLocaleString("ko-KR")}` : "아직 동기화하지 않았어요"} · 지표 {enabled.length}개 표시</p></div></div>
      <div className="flex items-center gap-2"><button type="button" onClick={() => void sync()} disabled={syncing || !connection.adAccountId} className="inline-flex h-9 items-center gap-2 rounded-xl bg-blue-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-40">{syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}지금 동기화</button><button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex h-9 items-center gap-1 rounded-xl px-3 text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground">설정 {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</button></div>
    </div>
    {open && <div className="grid gap-5 bg-secondary/25 p-4 sm:grid-cols-[minmax(220px,0.7fr)_1.3fr]">
      <label className="space-y-1.5"><span className="text-xs font-medium">광고 계정</span><select value={connection.adAccountId || ""} disabled={!canEdit || saving} onChange={(event) => void save({ adAccountId: event.target.value })} className="h-10 w-full rounded-xl bg-background px-3 text-sm shadow-sm ring-1 ring-black/5 outline-none focus:ring-2 focus:ring-blue-500"><option value="">선택해주세요</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency || ""}</option>)}</select>{connection.lastSyncError && <p className="text-xs text-amber-600">{connection.lastSyncError}</p>}</label>
      <div><div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium">대시보드 지표</span><button type="button" disabled={!canEdit || saving} onClick={() => void save({ enabledMetrics: enabled })} className="text-xs font-semibold text-blue-600 disabled:opacity-40">변경 저장</button></div><div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">{metrics.map((metric) => { const on = enabled.includes(metric.key); return <label key={metric.key} className="flex cursor-pointer items-center gap-2 rounded-lg bg-background px-2.5 py-2 text-xs shadow-sm"><input type="checkbox" checked={on} disabled={!canEdit} onChange={() => setEnabled((current) => on ? current.filter((key) => key !== metric.key) : [...current, metric.key])} className="accent-blue-600" /><span>{metric.label}</span></label>; })}</div></div>
    </div>}
  </section>;
}
