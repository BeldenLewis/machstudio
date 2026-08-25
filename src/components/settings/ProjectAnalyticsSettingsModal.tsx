"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { X, Loader2, BarChart3 } from "lucide-react";
import { toast } from "sonner";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

const MANUAL_ENTRY = "__manual__";

interface Ga4PropertyOption {
  propertyId: string;
  displayName: string;
  accountDisplayName: string;
}

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
  // 속성 목록 — null: 아직 조회 안 됨/실패(수동 입력으로 폴백), []: 조회는 됐지만 접근 가능한 속성 없음
  const [properties, setProperties] = useState<Ga4PropertyOption[] | null>(null);
  // 사용자가 "직접 입력..."을 명시적으로 골랐는지 — null이면 아직 안 고름(아래 파생값이 기본을 정한다)
  const [manualEntryChoice, setManualEntryChoice] = useState<boolean | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [projectRes, propsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/ga4-properties`),
      ]);
      const projectData = await projectRes.json().catch(() => ({}));
      if (projectRes.ok && projectData.project) {
        setGa4PropertyId(projectData.project.ga4PropertyId ?? "");
        setGa4RegistrationPagePath(projectData.project.ga4RegistrationPagePath ?? "");
      }
      const propsData = await propsRes.json().catch(() => ({}));
      setProperties(propsRes.ok && Array.isArray(propsData.properties) ? propsData.properties : null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void Promise.resolve().then(fetchData); }, [fetchData]);

  // 목록 조회 실패, 또는 저장된 값이 목록에 없으면(오래된 값/권한 변경) 잃어버리지 않게 수동 입력이 기본값 —
  // 사용자가 셀렉트에서 직접 고른 적 있으면(manualEntryChoice) 그 선택이 항상 우선한다.
  const manualEntry = useMemo(() => {
    if (manualEntryChoice !== null) return manualEntryChoice;
    if (properties === null) return true;
    return !!ga4PropertyId && !properties.some((p) => p.propertyId === ga4PropertyId);
  }, [manualEntryChoice, properties, ga4PropertyId]);

  const selectValue = useMemo(() => {
    if (properties === null || manualEntry) return MANUAL_ENTRY;
    return ga4PropertyId || "";
  }, [properties, manualEntry, ga4PropertyId]);

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
              <span className="text-xs font-medium text-muted-foreground">GA4 속성</span>
              {properties !== null && properties.length > 0 ? (
                <select
                  value={selectValue}
                  onChange={(e) => {
                    if (e.target.value === MANUAL_ENTRY) {
                      setManualEntryChoice(true);
                    } else {
                      setManualEntryChoice(false);
                      setGa4PropertyId(e.target.value);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none transition-colors focus:border-violet-400"
                >
                  <option value="" disabled>속성을 선택하세요</option>
                  {ga4PropertyId && !properties.some((p) => p.propertyId === ga4PropertyId) && (
                    <option value={ga4PropertyId}>현재 값: {ga4PropertyId} (목록에 없음)</option>
                  )}
                  {Object.entries(
                    properties.reduce<Record<string, Ga4PropertyOption[]>>((groups, p) => {
                      (groups[p.accountDisplayName] ??= []).push(p);
                      return groups;
                    }, {}),
                  ).map(([account, props]) => (
                    <optgroup key={account} label={account}>
                      {props.map((p) => (
                        <option key={p.propertyId} value={p.propertyId}>
                          {p.displayName} ({p.propertyId})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  <option value={MANUAL_ENTRY}>직접 입력...</option>
                </select>
              ) : (
                <>
                  <input
                    type="text"
                    value={ga4PropertyId}
                    onChange={(e) => setGa4PropertyId(e.target.value)}
                    placeholder="예: 123456789"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none transition-colors focus:border-violet-400"
                  />
                  {properties === null && (
                    <span className="block text-[11px] text-muted-foreground">
                      접근 가능한 속성 목록을 불러오지 못해 직접 입력해야 해요.
                    </span>
                  )}
                </>
              )}
              {properties !== null && properties.length > 0 && manualEntry && (
                <input
                  type="text"
                  value={ga4PropertyId}
                  onChange={(e) => setGa4PropertyId(e.target.value)}
                  placeholder="예: 123456789"
                  className="mt-1.5 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none transition-colors focus:border-violet-400"
                />
              )}
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
