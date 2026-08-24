"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { X, Loader2, BarChart3 } from "lucide-react";
import { toast } from "sonner";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

interface Props {
  projectId: string;
  projectName: string;
  onClose: () => void;
}

export default function ProjectAnalyticsSettingsModal({ projectId, projectName, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ga4PropertyId, setGa4PropertyId] = useState("");
  const [ga4RegistrationPagePath, setGa4RegistrationPagePath] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.project) {
        setGa4PropertyId(d.project.ga4PropertyId ?? "");
        setGa4RegistrationPagePath(d.project.ga4RegistrationPagePath ?? "");
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void Promise.resolve().then(fetchData); }, [fetchData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ga4PropertyId, ga4RegistrationPagePath }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error ?? "저장 실패");
        return;
      }
      toast.success("저장했어요");
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.97 }}
        transition={spring}
        className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="분석 연동 설정"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-violet-500" />
            <h2 className="text-sm font-semibold">분석 연동 — {projectName}</h2>
          </div>
          <motion.button
            whileHover={{ rotate: 90 }}
            whileTap={{ scale: 0.9 }}
            transition={spring}
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </motion.button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <p className="text-xs text-muted-foreground">
              이미 설치된 GA4에서 홈페이지·사전등록 페이지 방문자 수를 가져와 요약 대시보드 퍼널에 표시해요.
            </p>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">GA4 속성 ID</span>
              <input
                type="text"
                value={ga4PropertyId}
                onChange={(e) => setGa4PropertyId(e.target.value)}
                placeholder="예: 123456789"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none transition-colors focus:border-violet-400"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">사전등록 페이지 경로 (선택)</span>
              <input
                type="text"
                value={ga4RegistrationPagePath}
                onChange={(e) => setGa4RegistrationPagePath(e.target.value)}
                placeholder="예: /Pre-registration"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none transition-colors focus:border-violet-400"
              />
              <span className="block text-[11px] text-muted-foreground">
                비워두면 사전등록 페이지 방문자는 표시하지 않아요.
              </span>
            </label>
          </div>
        )}

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.96 }}
            transition={spring}
            onClick={onClose}
            className="px-3 py-2 rounded-xl text-xs text-muted-foreground hover:bg-secondary transition-colors"
          >
            취소
          </motion.button>
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.96 }}
            transition={spring}
            onClick={handleSave}
            disabled={saving || loading}
            className="px-3 py-2 rounded-xl bg-violet-500 text-xs font-medium text-white transition-colors hover:bg-violet-600 disabled:opacity-50"
          >
            {saving ? "저장 중..." : "저장"}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
