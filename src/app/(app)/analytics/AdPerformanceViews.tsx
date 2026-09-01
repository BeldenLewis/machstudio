"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import type { DateRange } from "@/components/DateRangePicker";

type View = {
  id: string;
  name: string;
  sourceType: string;
  campaignName: string | null;
  adGroupName: string | null;
  rangeLabel: string;
  dateFrom: string;
  dateTo: string;
};

export type AdPerformanceViewConfig = {
  sourceType: string;
  campaignName: string | null;
  adGroupName: string | null;
  range: DateRange;
};

interface Props {
  workspaceId: string;
  projectId: string;
  current: AdPerformanceViewConfig;
  onApply: (config: AdPerformanceViewConfig) => void;
  onReset: () => void;
}

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

function viewConfig(view: View): AdPerformanceViewConfig {
  return {
    sourceType: view.sourceType,
    campaignName: view.campaignName,
    adGroupName: view.adGroupName,
    range: { from: new Date(view.dateFrom), to: new Date(view.dateTo), label: view.rangeLabel },
  };
}

function payload(config: AdPerformanceViewConfig) {
  return {
    sourceType: config.sourceType,
    campaignName: config.campaignName,
    adGroupName: config.adGroupName,
    rangeLabel: config.range.label,
    dateFrom: config.range.from.toISOString(),
    dateTo: config.range.to.toISOString(),
  };
}

function sameConfig(view: View, config: AdPerformanceViewConfig) {
  return view.sourceType === config.sourceType
    && view.campaignName === config.campaignName
    && view.adGroupName === config.adGroupName
    && view.rangeLabel === config.range.label
    && new Date(view.dateFrom).getTime() === config.range.from.getTime()
    && new Date(view.dateTo).getTime() === config.range.to.getTime();
}

export function AdPerformanceViews({ workspaceId, projectId, current, onApply, onReset }: Props) {
  const [views, setViews] = useState<View[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingName, setEditingName] = useState("");
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const params = new URLSearchParams({ workspaceId, projectId });
        const response = await fetch(`/api/ad-performance/views?${params}`);
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error ?? "성과 보드를 불러오지 못했어요");
        if (cancelled) return;
        setViews(data.views ?? []);
        setCanEdit(Boolean(data.canEdit));
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "성과 보드를 불러오지 못했어요");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [projectId, workspaceId]);

  const active = useMemo(() => views.find((view) => view.id === activeId) ?? null, [activeId, views]);
  const dirty = active ? !sameConfig(active, current) : false;

  const choose = (view: View | null) => {
    setActiveId(view?.id ?? null);
    setRenaming(false);
    if (view) onApply(viewConfig(view));
    else onReset();
  };

  const createView = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const response = await fetch("/api/ad-performance/views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, projectId, name, ...payload(current) }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "성과 보드를 만들지 못했어요");
      setViews((previous) => [...previous, data.view]);
      setActiveId(data.view.id);
      setNewName("");
      setCreating(false);
      toast.success("현재 범위를 새 성과 보드로 저장했어요");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "성과 보드를 만들지 못했어요");
    } finally {
      setSaving(false);
    }
  };

  const update = async (body: Record<string, unknown>, success: string) => {
    if (!active) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/ad-performance/views/${active.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "성과 보드를 저장하지 못했어요");
      setViews((previous) => previous.map((view) => view.id === active.id ? data.view : view));
      setRenaming(false);
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "성과 보드를 저장하지 못했어요");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!active || !window.confirm(`'${active.name}' 성과 보드를 삭제할까요? 광고 데이터는 삭제되지 않아요.`)) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/ad-performance/views/${active.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "성과 보드를 삭제하지 못했어요");
      setViews((previous) => previous.filter((view) => view.id !== active.id));
      choose(null);
      toast.success("성과 보드를 삭제했어요");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "성과 보드를 삭제하지 못했어요");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl bg-secondary/35 p-3 shadow-sm" aria-label="저장한 광고 성과 보드">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => choose(null)}
          className={`rounded-xl px-3 py-2 text-xs font-medium transition-all ${activeId === null ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/70 hover:text-foreground"}`}
        >
          전체 성과
        </button>
        {views.map((view) => (
          <button
            type="button"
            key={view.id}
            onClick={() => choose(view)}
            className={`rounded-xl px-3 py-2 text-left transition-all ${activeId === view.id ? "bg-background shadow-sm" : "hover:bg-background/70"}`}
          >
            <span className="block text-xs font-medium">{view.name}</span>
            <span className="mt-0.5 block max-w-40 truncate text-[10px] text-muted-foreground">{view.rangeLabel}</span>
          </button>
        ))}
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

        {canEdit && !creating && (
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            transition={spring}
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-violet-600 transition-colors hover:bg-violet-500/10 dark:text-violet-300"
          >
            <Plus className="h-3.5 w-3.5" /> 현재 범위 저장
          </motion.button>
        )}
      </div>

      {creating && (
        <div className="mt-3 flex max-w-md items-center gap-2 rounded-xl bg-background p-2 shadow-sm">
          <input
            autoFocus
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void createView();
              if (event.key === "Escape") setCreating(false);
            }}
            placeholder="예: 웨비나 사전등록 캠페인"
            className="min-w-0 flex-1 bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-violet-500/40"
          />
          <button type="button" onClick={() => void createView()} disabled={!newName.trim() || saving} className="rounded-lg bg-violet-500 p-2 text-white shadow-sm disabled:opacity-40" aria-label="성과 보드 저장">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </button>
          <button type="button" onClick={() => setCreating(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary" aria-label="취소"><X className="h-4 w-4" /></button>
        </div>
      )}

      {active && canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-foreground/5 pt-3">
          {renaming ? (
            <div className="flex items-center gap-1 rounded-xl bg-background p-1.5 shadow-sm">
              <input
                autoFocus
                value={editingName}
                onChange={(event) => setEditingName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && editingName.trim()) void update({ name: editingName.trim() }, "보드 이름을 변경했어요");
                  if (event.key === "Escape") setRenaming(false);
                }}
                className="w-48 bg-transparent px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
              />
              <button type="button" onClick={() => void update({ name: editingName.trim() }, "보드 이름을 변경했어요")} className="rounded-lg p-1.5 hover:bg-secondary" aria-label="이름 저장"><Check className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => setRenaming(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary" aria-label="이름 변경 취소"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <button type="button" onClick={() => { setEditingName(active.name); setRenaming(true); }} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-background hover:text-foreground">
              <Pencil className="h-3.5 w-3.5" /> 이름 변경
            </button>
          )}
          {dirty && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => void update(payload(current), "현재 범위와 기간을 보드에 저장했어요")}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              변경사항 저장
            </motion.button>
          )}
          <button type="button" onClick={() => void remove()} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-red-500/10 hover:text-red-500">
            <Trash2 className="h-3.5 w-3.5" /> 보드 삭제
          </button>
        </div>
      )}
    </section>
  );
}
