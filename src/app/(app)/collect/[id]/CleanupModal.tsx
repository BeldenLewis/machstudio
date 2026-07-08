"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, Loader2, Check, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import ModalShell from "./ModalShell";
import { useConfirm } from "@/components/ui/confirm-dialog";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

interface FieldMapping {
  id: string;
  key: string;
  label: string;
}

interface PreviewResult {
  groups: number;
  toDelete: number;
  sampleGroups: Array<{ key: string; total: number; kept: string; deleted: string[] }>;
}

interface CleanupModalProps {
  sourceId: string;
  fieldMappings: FieldMapping[];
  onClose: () => void;
  onCleaned: () => void;
}

export default function CleanupModal({ sourceId, fieldMappings, onClose, onCleaned }: CleanupModalProps) {
  const confirm = useConfirm();
  const [keyField, setKeyField] = useState(fieldMappings[0]?.key ?? "");
  const [keep, setKeep] = useState<"latest" | "oldest">("latest");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [running, setRunning] = useState(false);

  const handleAnalyze = async () => {
    if (!keyField) { toast.error("기준 필드를 선택해주세요"); return; }
    setAnalyzing(true);
    setPreview(null);
    try {
      const res = await fetch(`/api/collect-sources/${sourceId}/records/cleanup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyField, keep, dryRun: true }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "분석 실패"); return; }
      setPreview(data);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRun = async () => {
    if (!preview || preview.toDelete === 0) return;
    if (!(await confirm({ title: "삭제할까요?", description: `${preview.toDelete}건을 삭제해요. 되돌릴 수 없어요.`, confirmLabel: "삭제", tone: "danger" }))) return;
    setRunning(true);
    try {
      const res = await fetch(`/api/collect-sources/${sourceId}/records/cleanup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyField, keep }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "정리 실패"); return; }
      toast.success(`${data.deleted}건 정리됐어요 (${data.groups}개 그룹)`);
      onCleaned();
      onClose();
    } finally {
      setRunning(false);
    }
  };

  const fieldLabel = (key: string) => fieldMappings.find((f) => f.key === key)?.label || key;

  return (
    <ModalShell open onClose={onClose} title="중복 데이터 정리" size="md" footer={
      preview && preview.toDelete > 0 ? (
        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.96 }}
          transition={spring}
          onClick={handleRun}
          disabled={running}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-40"
        >
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {running ? "정리 중..." : `${preview.toDelete}건 삭제`}
        </motion.button>
      ) : null
    }>
      <div className="space-y-5">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">기준 필드</label>
            <select
              value={keyField}
              onChange={(e) => { setKeyField(e.target.value); setPreview(null); }}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors"
            >
              {fieldMappings.length === 0 && <option value="">— 필드 없음 —</option>}
              {fieldMappings.map((f) => (
                <option key={f.key} value={f.key}>{f.label || f.key}</option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              이 필드의 값이 같은 레코드를 중복으로 간주해요 (대소문자 무시, 앞뒤 공백 무시)
            </p>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">유지할 레코드</label>
            <div className="relative flex items-center gap-1 p-0.5 rounded-xl border border-border bg-background w-fit">
              {(["latest", "oldest"] as const).map((mode) => {
                const active = keep === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => { setKeep(mode); setPreview(null); }}
                    className={`relative z-10 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      active ? "text-white" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="cleanup-keep-pill"
                        transition={spring}
                        className="absolute inset-0 -z-10 rounded-lg bg-violet-500"
                      />
                    )}
                    {mode === "latest" ? "최신 1건 유지" : "가장 오래된 1건 유지"}
                  </button>
                );
              })}
            </div>
          </div>

          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            transition={spring}
            onClick={handleAnalyze}
            disabled={analyzing || !keyField}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-40"
          >
            {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {analyzing ? "분석 중..." : "중복 분석"}
          </motion.button>

          <AnimatePresence>
          {preview && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={spring}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl border border-border bg-secondary/30">
                  <p className="text-[11px] text-muted-foreground">중복 그룹</p>
                  <p className="text-xl font-semibold mt-0.5">{preview.groups.toLocaleString()}</p>
                </div>
                <div className={`p-3 rounded-xl border ${preview.toDelete > 0 ? "border-red-500/30 bg-red-500/5" : "border-border bg-secondary/30"}`}>
                  <p className="text-[11px] text-muted-foreground">삭제될 레코드</p>
                  <p className={`text-xl font-semibold mt-0.5 ${preview.toDelete > 0 ? "text-red-500" : ""}`}>
                    {preview.toDelete.toLocaleString()}
                  </p>
                </div>
              </div>

              {preview.sampleGroups.length > 0 && (
                <div>
                  <p className="text-[11px] text-muted-foreground mb-2">미리보기 (상위 10개 그룹)</p>
                  <div className="rounded-xl border border-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-secondary/50 border-b border-border">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">{fieldLabel(keyField)} 값</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">전체</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">삭제</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.sampleGroups.map((g, i) => (
                          <tr key={i} className="border-b border-border last:border-0">
                            <td className="px-3 py-2 max-w-[280px] truncate font-mono">{g.key}</td>
                            <td className="px-3 py-2 text-right">{g.total}</td>
                            <td className="px-3 py-2 text-right text-red-500">{g.deleted.length}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {preview.toDelete === 0 && (
                <div className="flex items-center gap-2 p-3 rounded-xl border border-border bg-secondary/30 text-xs text-muted-foreground">
                  <Check className="w-3.5 h-3.5 text-green-500" />
                  중복 없음 — 정리할 데이터가 없어요
                </div>
              )}

              {preview.toDelete > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-amber-700 dark:text-amber-400">
                    삭제는 되돌릴 수 없어요. 중요한 데이터는 먼저 CSV로 내보내두는 걸 권장합니다.
                  </p>
                </div>
              )}
            </motion.div>
          )}
          </AnimatePresence>
      </div>
    </ModalShell>
  );
}
