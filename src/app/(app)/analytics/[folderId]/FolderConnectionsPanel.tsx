"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, PlugZap, Trash2 } from "lucide-react";
import { toast } from "sonner";

type MediaAccount = { platform: string; accountId: string; accountName: string };
type MetaAccount = { id: string; name: string; currency?: string; timezone_name?: string };

export function FolderConnectionsPanel({
  folderId,
  accounts,
  onChange,
}: {
  folderId: string;
  accounts: MediaAccount[];
  onChange(accounts: MediaAccount[]): void;
}) {
  const [available, setAvailable] = useState<MetaAccount[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/ad-performance/folders/${folderId}/meta-accounts`, { cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (!response.ok) toast.error(data?.error || "Meta 광고 계정을 불러오지 못했습니다.");
    else { setAvailable(data.accounts ?? []); setConnected(data.connected === true); }
    setLoading(false);
  }, [folderId]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const selectable = useMemo(
    () => available.filter(item => !accounts.some(account => account.platform === "META" && account.accountId === item.id)),
    [available, accounts],
  );

  async function save(next: MediaAccount[], success: string) {
    setSaving(true);
    const response = await fetch(`/api/ad-performance/folders/${folderId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mediaAccounts: next }),
    });
    const data = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) return toast.error(data?.error || "광고 계정 설정을 저장하지 못했습니다.");
    onChange(data.folder.mediaAccounts ?? next); setSelectedId(""); toast.success(success);
  }

  function add() {
    const selected = available.find(item => item.id === selectedId);
    if (!selected) return;
    void save([...accounts, { platform: "META", accountId: selected.id, accountName: selected.name }], "광고 계정을 폴더에 연결했습니다.");
  }

  function remove(target: MediaAccount) {
    void save(accounts.filter(item => !(item.platform === target.platform && item.accountId === target.accountId)), "광고 계정을 폴더에서 삭제했습니다.");
  }

  return <div className="space-y-5 p-4 sm:p-6 lg:p-8">
    <div><h2 className="font-semibold">매체 계정 연결</h2><p className="mt-1 text-xs text-muted-foreground">OAuth로 연결된 광고 계정 중 이 폴더에서 비교할 계정을 선택합니다.</p></div>
    <div className="grid gap-3 lg:grid-cols-3">{accounts.map(item => <div key={`${item.platform}-${item.accountId}`} className="relative rounded-2xl bg-card p-4 shadow-sm"><span className="text-[10px] font-semibold text-violet-500">{item.platform}</span><p className="mt-2 pr-8 text-sm font-medium">{item.accountName}</p><p className="mt-1 font-mono text-[11px] text-muted-foreground">{item.accountId}</p><button type="button" aria-label={`${item.accountName} 삭제`} disabled={saving} onClick={() => remove(item)} className="absolute right-3 top-3 rounded-lg p-2 text-muted-foreground transition hover:bg-red-500/10 hover:text-red-500 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button></div>)}</div>
    <section className="max-w-2xl rounded-2xl bg-secondary/35 p-5"><div className="flex items-start gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600/10 text-blue-600"><PlugZap className="h-4 w-4" /></span><div><h3 className="text-sm font-semibold">Meta 광고 계정 추가</h3><p className="mt-1 text-xs text-muted-foreground">계정 이름과 광고 계정 ID를 함께 확인하고 선택할 수 있습니다.</p></div></div>{loading ? <div className="mt-4 flex h-10 items-center"><Loader2 className="h-4 w-4 animate-spin" /></div> : !connected ? <p className="mt-4 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-700">먼저 프로젝트의 Meta Ads OAuth 연결을 완료해주세요.</p> : <div className="mt-4 flex flex-col gap-2 sm:flex-row"><select value={selectedId} onChange={event => setSelectedId(event.target.value)} className="h-10 min-w-0 flex-1 rounded-xl bg-background px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-violet-400"><option value="">광고 계정을 선택해주세요</option>{selectable.map(item => <option key={item.id} value={item.id}>{item.name} · {item.id}{item.currency ? ` · ${item.currency}` : ""}</option>)}</select><button type="button" disabled={!selectedId || saving} onClick={add} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 text-xs font-medium text-white shadow-sm disabled:opacity-40">{saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}계정 추가</button></div>}</section>
  </div>;
}
