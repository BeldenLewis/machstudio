"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, ChevronRight, ImageIcon, Layers3, Loader2, Megaphone, PlugZap, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import AdPerformanceDashboard from "../AdPerformanceDashboard";
import { FolderConnectionsPanel } from "./FolderConnectionsPanel";

type Tab = "overview" | "campaign" | "adGroup" | "ad" | "connections";
type Folder = { id: string; name: string; description: string | null; reportStart: string; reportEnd: string; currency: string; mediaAccounts: Array<{ platform: string; accountId: string; accountName: string }> };
type DataRow = { id: string; sourceType: string; name: string; campaignId: string | null; campaignName: string; adGroupId: string | null; adGroupName: string | null; creativeId: string | null; creativeName: string | null; thumbnailUrl: string | null; status: string | null; cost: number; impressions: number; reach: number; clicks: number; conversions: number; ctr: number; cpc: number; costPerConversion: number };

const tabs: Array<{ id: Tab; label: string; icon: typeof BarChart3 }> = [
  { id: "overview", label: "통합 대시보드", icon: BarChart3 }, { id: "campaign", label: "캠페인", icon: Megaphone },
  { id: "adGroup", label: "광고 세트", icon: Layers3 }, { id: "ad", label: "광고·소재", icon: ImageIcon },
  { id: "connections", label: "연결 및 설정", icon: PlugZap },
];

export default function FolderDetailClient({ folderId }: { folderId: string }) {
  const [folder, setFolder] = useState<Folder>({ id: folderId, name: "", description: null, reportStart: "", reportEnd: "", currency: "KRW", mediaAccounts: [] });
  const [project, setProject] = useState<{ id: string; name: string } | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [rows, setRows] = useState<DataRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [source, setSource] = useState("ALL");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<{ campaignId?: string; campaignName?: string; adGroupId?: string; adGroupName?: string }>({});
  const [account, setAccount] = useState({ platform: "META", accountId: "", accountName: "" });
  const [syncing, setSyncing] = useState(false);

  useEffect(() => { (async () => { try { const response = await fetch(`/api/ad-performance/folders/${folderId}`); const data = await response.json().catch(() => null); if (!response.ok) throw new Error(data?.error || `폴더를 불러오지 못했습니다. (${response.status})`); setFolder(data.folder); setProject(data.project); } catch (error) { toast.error(error instanceof Error ? error.message : "폴더를 불러오지 못했습니다."); } finally { setLoading(false); } })(); }, [folderId]);

  const loadData = useCallback(async () => {
    if (tab === "overview" || tab === "connections") return;
    setDataLoading(true);
    const params = new URLSearchParams({ level: tab, sourceType: source });
    if (scope.campaignId) params.set("campaignId", scope.campaignId);
    if (scope.adGroupId) params.set("adGroupId", scope.adGroupId);
    try { const response = await fetch(`/api/ad-performance/folders/${folderId}/data?${params}`); const data = await response.json().catch(() => null); if (!response.ok) throw new Error(data?.error || `성과 데이터를 불러오지 못했습니다. (${response.status})`); setRows(data.rows ?? []); }
    catch (error) { toast.error(error instanceof Error ? error.message : "성과 데이터를 불러오지 못했습니다."); }
    finally { setDataLoading(false); }
  }, [folderId, tab, source, scope]);
  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  function drill(row: DataRow) {
    if (tab === "campaign") { setScope({ campaignId: row.campaignId || row.id, campaignName: row.name }); setTab("adGroup"); }
    else if (tab === "adGroup") { setScope({ ...scope, adGroupId: row.adGroupId || row.id, adGroupName: row.name }); setTab("ad"); }
  }

  async function addAccount() {
    if (!folder || !account.accountId.trim() || !account.accountName.trim()) return;
    const mediaAccounts = [...(folder.mediaAccounts ?? []), { ...account, accountId: account.accountId.trim(), accountName: account.accountName.trim() }];
    const response = await fetch(`/api/ad-performance/folders/${folderId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mediaAccounts }) });
    const data = await response.json().catch(() => null); if (!response.ok) return toast.error(data?.error || `광고 계정을 연결하지 못했습니다. (${response.status})`);
    setFolder(data.folder); setAccount({ platform: "META", accountId: "", accountName: "" }); toast.success("광고 계정을 연결했습니다.");
  }

  async function syncMeta() {
    setSyncing(true);
    try {
      const response = await fetch(`/api/ad-performance/folders/${folderId}/sync`, { method: "POST" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || `Meta 동기화에 실패했습니다. (${response.status})`);
      toast.success(`Meta 성과 ${Number(data.rowCount).toLocaleString()}행을 동기화했습니다.`);
      if (tab !== "overview" && tab !== "connections") await loadData();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Meta 동기화에 실패했습니다."); }
    finally { setSyncing(false); }
  }

  if (loading) return <div className="flex h-72 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!folder || !project) return <div className="p-8 text-sm text-muted-foreground">광고 성과 폴더를 찾을 수 없습니다.</div>;
  const media = ["ALL", ...new Set((folder.mediaAccounts ?? []).map(item => item.platform))];
  const filtered = rows.filter(row => row.name.toLowerCase().includes(query.toLowerCase()));

  return <div>
    <div className="border-b border-border/70 bg-background px-4 pt-5 sm:px-6 lg:px-8">
      <Link href="/analytics" className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />광고 성과 폴더</Link>
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-xl font-semibold tracking-tight">{folder.name}</h1><p className="mt-1 text-xs text-muted-foreground">{folder.reportStart.slice(0,10)} – {folder.reportEnd.slice(0,10)} · {folder.currency}</p></div><div className="flex items-center gap-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full bg-emerald-500" />{folder.mediaAccounts?.length || 0}개 광고 계정</div><button onClick={syncMeta} disabled={syncing || !folder.mediaAccounts?.some(item => item.platform === "META")} className="flex items-center gap-1.5 rounded-xl bg-violet-500 px-3 py-2 text-xs font-medium text-white shadow-sm disabled:opacity-40"><RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />Meta 동기화</button></div></div>
      <nav className="mt-5 flex gap-1 overflow-x-auto" aria-label="광고 성과 보기">{tabs.map(item => <button key={item.id} onClick={() => setTab(item.id)} className={`relative flex shrink-0 items-center gap-1.5 px-3 py-3 text-xs font-medium transition ${tab === item.id ? "text-violet-600" : "text-muted-foreground hover:text-foreground"}`}><item.icon className="h-3.5 w-3.5" />{item.label}{tab === item.id && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-violet-500" />}</button>)}</nav>
    </div>

    {tab === "overview" ? <AdPerformanceDashboard folderId={folderId} folderProject={project} /> : tab === "connections" ? <FolderConnectionsPanel folderId={folderId} accounts={folder?.mediaAccounts ?? []} onChange={mediaAccounts => setFolder(current => current ? { ...current, mediaAccounts } : current)} /> : false ? (
      <div className="space-y-5 p-4 sm:p-6 lg:p-8"><div><h2 className="font-semibold">매체 계정 연결</h2><p className="mt-1 text-xs text-muted-foreground">Meta로 시작하고 같은 폴더에 Google Ads와 TikTok Ads 계정을 이어서 추가할 수 있습니다.</p></div><div className="grid gap-3 lg:grid-cols-3">{folder.mediaAccounts?.map((item, i) => <div key={`${item.platform}-${i}`} className="rounded-2xl bg-card p-4 shadow-sm"><span className="text-[10px] font-semibold text-violet-500">{item.platform}</span><p className="mt-2 text-sm font-medium">{item.accountName}</p><p className="mt-1 font-mono text-[11px] text-muted-foreground">{item.accountId}</p></div>)}</div><section className="max-w-2xl rounded-2xl bg-secondary/35 p-5"><h3 className="text-sm font-semibold">광고 계정 추가</h3><div className="mt-4 grid gap-3 sm:grid-cols-3"><select value={account.platform} onChange={e => setAccount({...account,platform:e.target.value})} className="rounded-xl bg-background px-3 py-2.5 text-sm"><option>META</option><option disabled>GOOGLE (준비 중)</option><option disabled>TIKTOK (준비 중)</option></select><input value={account.accountName} onChange={e => setAccount({...account,accountName:e.target.value})} placeholder="계정 이름" className="rounded-xl bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400" /><input value={account.accountId} onChange={e => setAccount({...account,accountId:e.target.value})} placeholder="광고 계정 ID" className="rounded-xl bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400" /></div><button onClick={addAccount} className="mt-3 rounded-xl bg-violet-500 px-4 py-2 text-xs font-medium text-white">계정 연결하기</button></section></div>
    ) : (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8"><div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><button onClick={() => {setScope({});setTab("campaign")}} className="hover:text-violet-500">전체 매체</button>{scope.campaignName && <><ChevronRight className="h-3 w-3" /><button onClick={() => {setScope({campaignId:scope.campaignId,campaignName:scope.campaignName});setTab("adGroup")}} className="hover:text-violet-500">{scope.campaignName}</button></>}{scope.adGroupName && <><ChevronRight className="h-3 w-3" /><span className="text-foreground">{scope.adGroupName}</span></>}</div><div className="flex flex-wrap items-center gap-2"><div className="flex rounded-xl bg-secondary/60 p-1">{media.map(item => <button key={item} onClick={() => setSource(item)} className={`rounded-lg px-3 py-1.5 text-xs ${source === item ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}>{item === "ALL" ? "전체 매체" : item}</button>)}</div><label className="relative ml-auto"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="이름 검색" className="w-52 rounded-xl bg-secondary/60 py-2 pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-violet-400" /></label><button onClick={() => void loadData()} className="rounded-xl p-2 hover:bg-secondary" aria-label="새로고침"><RefreshCw className={`h-4 w-4 ${dataLoading ? "animate-spin" : ""}`} /></button></div><div className="overflow-hidden rounded-2xl bg-card shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-xs"><thead className="border-b border-border/70 bg-secondary/35 text-[11px] text-muted-foreground"><tr><th className="px-4 py-3 font-medium">게재</th><th className="px-4 py-3 font-medium">이름</th><th className="px-4 py-3 font-medium">매체</th><th className="px-4 py-3 text-right font-medium">결과</th><th className="px-4 py-3 text-right font-medium">도달</th><th className="px-4 py-3 text-right font-medium">노출</th><th className="px-4 py-3 text-right font-medium">클릭</th><th className="px-4 py-3 text-right font-medium">CTR</th><th className="px-4 py-3 text-right font-medium">지출</th><th className="px-4 py-3 text-right font-medium">결과당 비용</th></tr></thead><tbody>{dataLoading ? <tr><td colSpan={10} className="h-40 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr> : filtered.length === 0 ? <tr><td colSpan={10} className="h-40 text-center text-muted-foreground">이 단계에 표시할 데이터가 없습니다. 통합 대시보드에서 데이터를 추가해주세요.</td></tr> : filtered.map(row => <tr key={`${row.sourceType}-${row.id}`} className="border-b border-border/50 last:border-0 hover:bg-secondary/25"><td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-[10px] ${row.status?.toLowerCase().includes("active") ? "bg-emerald-500/10 text-emerald-600" : "bg-secondary text-muted-foreground"}`}>{row.status || "—"}</span></td><td className="max-w-[280px] px-4 py-3"><button onClick={() => drill(row)} disabled={tab === "ad"} className="flex items-center gap-3 text-left font-medium hover:text-violet-500 disabled:hover:text-foreground">{tab === "ad" && <span className="grid h-9 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-secondary">{row.thumbnailUrl ? <img src={row.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-4 w-4 text-muted-foreground" />}</span>}<span className="truncate">{row.name}</span>{tab !== "ad" && <ChevronRight className="h-3.5 w-3.5 shrink-0" />}</button></td><td className="px-4 py-3">{row.sourceType}</td><td className="px-4 py-3 text-right tabular-nums">{row.conversions.toLocaleString()}</td><td className="px-4 py-3 text-right tabular-nums">{row.reach.toLocaleString()}</td><td className="px-4 py-3 text-right tabular-nums">{row.impressions.toLocaleString()}</td><td className="px-4 py-3 text-right tabular-nums">{row.clicks.toLocaleString()}</td><td className="px-4 py-3 text-right tabular-nums">{row.ctr.toFixed(2)}%</td><td className="px-4 py-3 text-right font-medium tabular-nums">₩{Math.round(row.cost).toLocaleString()}</td><td className="px-4 py-3 text-right tabular-nums">{row.conversions ? `₩${Math.round(row.costPerConversion).toLocaleString()}` : "—"}</td></tr>)}</tbody></table></div></div></div>
    )}
  </div>;
}
