"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Database, Globe, Loader2, ChevronRight, Users, Trash2, Upload, UserPlus, Edit3, Check, X, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/contexts/workspace";
import Link from "next/link";
import ProjectMembersModal from "@/components/settings/ProjectMembersModal";
import ProjectAnalyticsSettingsModal from "@/components/settings/ProjectAnalyticsSettingsModal";
import ActiveToggle from "@/app/(app)/collect/_components/ActiveToggle";

interface CollectSource {
  id: string;
  name: string;
  description: string | null;
  siteUrl: string | null;
  isActive: boolean;
  createdAt: string;
  _count: { records: number };
}

export default function CollectPage() {
  const { workspace, currentProject, isLoading: wsLoading } = useWorkspace();
  const [sources, setSources] = useState<CollectSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", siteUrl: "" });
  const [isCreating, setIsCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [showAnalyticsSettings, setShowAnalyticsSettings] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const fetchSources = useCallback(async () => {
    if (!workspace || !currentProject) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/collect-sources?workspaceId=${workspace.id}&projectId=${currentProject.id}`);
      const data = await res.json();
      setSources(data.sources ?? []);
    } finally {
      setIsLoading(false);
    }
  }, [workspace, currentProject]);

  useEffect(() => { fetchSources(); }, [fetchSources]);

  const handleCreate = async () => {
    if (!form.name.trim() || !workspace || !currentProject) return;
    setIsCreating(true);
    try {
      const res = await fetch("/api/collect-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: workspace.id,
          projectId: currentProject.id,
          name: form.name.trim(),
          description: form.description.trim() || null,
          siteUrl: form.siteUrl.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "생성 실패"); return; }
      toast.success(`'${data.source.name}' 수집 소스가 생성됐어요`);
      setForm({ name: "", description: "", siteUrl: "" });
      setShowCreate(false);
      fetchSources();
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleSilent = async (sourceId: string, next: boolean) => {
    const res = await fetch(`/api/collect-sources/${sourceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: next }),
    });
    if (!res.ok) { toast.error("상태 변경 실패"); return; }
    setSources((prev) => prev.map((s) => s.id === sourceId ? { ...s, isActive: next } : s));
  };

  const handleToggle = async (source: CollectSource, next: boolean) => {
    const prev = source.isActive;
    await handleToggleSilent(source.id, next);
    if (prev && !next) {
      toast("사전등록 폼이 비활성화됐어요", {
        description: "새 데이터 수집이 중단됩니다",
        duration: 5000,
        action: { label: "되돌리기", onClick: () => handleToggleSilent(source.id, true) },
      });
    } else if (!prev && next) {
      toast.success("사전등록 폼이 활성화됐어요");
    }
  };

  const handleRenameSource = async (id: string) => {
    const name = editingName.trim();
    setEditingId(null);
    if (!name) return;
    const source = sources.find((s) => s.id === id);
    if (!source || name === source.name) return;
    const res = await fetch(`/api/collect-sources/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) { toast.error("이름 변경 실패"); return; }
    setSources((prev) => prev.map((s) => s.id === id ? { ...s, name } : s));
    toast.success("이름이 변경됐어요");
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/collect-sources/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("삭제 실패"); return; }
    toast.success("수집 소스가 삭제됐어요");
    setDeleteId(null);
    setSources((prev) => prev.filter((s) => s.id !== id));
  };

  if (wsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!currentProject) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Database className="w-10 h-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">프로젝트를 먼저 선택해주세요</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">데이터 수집</h1>
          <p className="text-sm text-muted-foreground mt-1.5">{currentProject.name} · 외부 사이트 폼 데이터 수집</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowMembers(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            aria-label="프로젝트 권한"
          >
            <UserPlus className="w-3.5 h-3.5" />프로젝트 권한
          </button>
          <button
            onClick={() => setShowAnalyticsSettings(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            aria-label="분석 연동"
          >
            <BarChart3 className="w-3.5 h-3.5" />분석 연동
          </button>
          <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer">
            <Upload className="w-3.5 h-3.5" />백업 복구
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f || !workspace || !currentProject) return;
                setRestoring(true);
                try {
                  const text = await f.text();
                  const backup = JSON.parse(text);
                  const res = await fetch("/api/collect-sources/import-backup", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ workspaceId: workspace.id, projectId: currentProject.id, backup }),
                  });
                  const data = await res.json();
                  if (!res.ok) { toast.error(data.error ?? "복구 실패"); return; }
                  toast.success(`복구됨: ${data.imported.toLocaleString()}건 (소스 비활성 상태로 생성됨 — 확인 후 활성화)`);
                  fetchSources();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "파일 처리 실패");
                } finally {
                  setRestoring(false);
                  if (e.target) e.target.value = "";
                }
              }}
            />
          </label>
          {restoring && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            수집 소스 추가
          </motion.button>
        </div>
      </div>

      {showMembers && workspace && currentProject && (
        <ProjectMembersModal
          projectId={currentProject.id}
          projectName={currentProject.name}
          workspaceId={workspace.id}
          onClose={() => setShowMembers(false)}
        />
      )}

      {showAnalyticsSettings && currentProject && (
        <ProjectAnalyticsSettingsModal
          projectId={currentProject.id}
          projectName={currentProject.name}
          onClose={() => setShowAnalyticsSettings(false)}
        />
      )}

      {/* 생성 폼 */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="p-5 rounded-2xl border border-violet-400/30 bg-violet-500/5"
          >
            <h3 className="text-sm font-semibold mb-4">새 수집 소스</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">이름 *</label>
                <input
                  autoFocus
                  type="text"
                  placeholder="예: 2025 서울 국제아트페어"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setShowCreate(false); }}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">설명</label>
                <input
                  type="text"
                  placeholder="수집 소스에 대한 메모"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">사이트 URL</label>
                <input
                  type="url"
                  placeholder="https://example.com"
                  value={form.siteUrl}
                  onChange={(e) => setForm((f) => ({ ...f, siteUrl: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleCreate}
                  disabled={!form.name.trim() || isCreating}
                  className="px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors disabled:opacity-40"
                >
                  {isCreating ? "생성 중..." : "생성"}
                </motion.button>
                <button
                  onClick={() => { setShowCreate(false); setForm({ name: "", description: "", siteUrl: "" }); }}
                  className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-secondary transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 목록 */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : sources.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Database className="w-10 h-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">아직 수집 소스가 없어요</p>
          <p className="text-xs text-muted-foreground/60 mt-1 mb-4">외부 사이트에 스크립트를 삽입해 폼 데이터를 수집할 수 있어요</p>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            수집 소스 추가
          </motion.button>
        </div>
      ) : (
        <div className="space-y-2">
          {sources.map((source) => (
            <motion.div
              key={source.id}
              layout
              className="group flex items-center gap-4 p-4 rounded-2xl border border-border bg-background hover:border-violet-400/30 transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-500 shrink-0">
                <Database className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                {/* 이름 행: 편집 아이콘을 이름 텍스트 바로 옆에 배치 */}
                {editingId === source.id ? (
                  <div className="flex items-center gap-1.5 min-w-0" onClick={(e) => e.preventDefault()}>
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => handleRenameSource(source.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameSource(source.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="text-sm font-medium bg-transparent border-b border-violet-400 focus:outline-none min-w-0 py-0.5"
                    />
                    <button
                      onMouseDown={(e) => { e.preventDefault(); handleRenameSource(source.id); }}
                      className="p-0.5 rounded text-violet-500 hover:bg-violet-500/10 transition-colors shrink-0"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onMouseDown={(e) => { e.preventDefault(); setEditingId(null); }}
                      className="p-0.5 rounded text-muted-foreground hover:bg-secondary transition-colors shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 min-w-0">
                    <Link href={`/collect/${source.id}`} className="min-w-0">
                      <span className="text-sm font-medium truncate block">{source.name}</span>
                    </Link>
                    <button
                      onClick={(e) => { e.preventDefault(); setEditingId(source.id); setEditingName(source.name); }}
                      className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-all shrink-0"
                      title="이름 수정"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                  </div>
                )}
                <Link href={`/collect/${source.id}`} className="block min-w-0">
                  {source.description && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{source.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Users className="w-3 h-3" />{source._count.records.toLocaleString()}건
                    </span>
                    {source.siteUrl && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                        <Globe className="w-3 h-3 shrink-0" />{source.siteUrl}
                      </span>
                    )}
                  </div>
                </Link>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {/* 토글 스위치 */}
                <ActiveToggle
                  active={source.isActive}
                  onChange={(next) => handleToggle(source, next)}
                  size="sm"
                  showLabel={false}
                />
                <button
                  onClick={(e) => { e.preventDefault(); setDeleteId(source.id); }}
                  className="p-1.5 rounded-xl hover:bg-red-500/10 hover:text-red-500 transition-colors text-muted-foreground opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <Link href={`/collect/${source.id}`} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* 삭제 확인 */}
      <AnimatePresence>
        {deleteId && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setDeleteId(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-background border border-border rounded-2xl p-6 w-80 max-w-[calc(100vw-2rem)] shadow-xl"
            >
              <h3 className="text-base font-semibold mb-2">수집 소스 삭제</h3>
              <p className="text-sm text-muted-foreground mb-5">수집된 모든 데이터도 함께 삭제돼요. 되돌릴 수 없어요.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleDelete(deleteId)}
                  className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors"
                >
                  삭제
                </button>
                <button
                  onClick={() => setDeleteId(null)}
                  className="flex-1 py-2 rounded-xl border border-border text-sm hover:bg-secondary transition-colors"
                >
                  취소
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
